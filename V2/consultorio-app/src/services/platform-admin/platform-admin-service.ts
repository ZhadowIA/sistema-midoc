import { PlanStatus, Prisma, SubscriptionStatus, UserRole, UserStatus } from "@prisma/client";

import { writeAuditLog } from "../../lib/audit";
import { ServiceError } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { assertRateLimit } from "../../lib/rate-limit";
import { hashPassword, passwordNeedsRehash, verifyPassword } from "../../lib/security/password";
import {
  getDoctorAiCreditSummary,
  readAiCreditAllowance,
  type AiCreditSummary
} from "../ai/ai-credits";
import { createSessionForUser } from "../auth/auth-service";

class PlatformAdminServiceError extends ServiceError {}

/** Estados de suscripcion que dan derecho a las capacidades del plan. */
const ENTITLED_SUBSCRIPTION_STATUSES = [
  SubscriptionStatus.TRIAL,
  SubscriptionStatus.ACTIVE
] as const;

/** Vuelve un valor JSON de capacidades en un objeto llano (ignora null/arrays). */
function asCapabilityRecord(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

const DOCTOR_ACCOUNT_STATUSES = [
  UserStatus.ACTIVE,
  UserStatus.PENDING_APPROVAL,
  UserStatus.SUSPENDED,
  UserStatus.ARCHIVED
] as const;

function assertAdminUserId(adminUserId: string) {
  return prisma.user.findFirst({
    where: {
      id: adminUserId,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE
    }
  });
}

export async function signInPlatformAdmin(input: {
  email: string;
  password: string;
  requestIp?: string;
}) {
  const email = input.email.trim().toLowerCase();

  await assertRateLimit({
    key: `admin-login:${email}`,
    limit: 10,
    windowMs: 1000 * 60 * 15
  });
  if (input.requestIp) {
    await assertRateLimit({
      key: `admin-login-ip:${input.requestIp}`,
      limit: 30,
      windowMs: 1000 * 60 * 15
    });
  }

  const user = await prisma.user.findUnique({
    where: { email }
  });

  if (!user || user.role !== UserRole.ADMIN || user.status !== UserStatus.ACTIVE || !user.passwordHash) {
    throw new PlatformAdminServiceError("Credenciales invalidas.", 401);
  }

  const isValid = await verifyPassword(input.password, user.passwordHash);

  if (!isValid) {
    throw new PlatformAdminServiceError("Credenciales invalidas.", 401);
  }

  // Re-hash transparente hacia los parametros actuales de scrypt.
  if (passwordNeedsRehash(user.passwordHash)) {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(input.password) }
    });
  }

  const session = await createSessionForUser(user, "platform_admin.login");
  return { user, ...session };
}

export async function listDoctorAccountsForAdmin(
  adminUserId: string,
  filters?: { status?: UserStatus }
) {
  const admin = await assertAdminUserId(adminUserId);

  if (!admin) {
    throw new PlatformAdminServiceError("No autorizado.", 401);
  }

  const status =
    filters?.status && DOCTOR_ACCOUNT_STATUSES.includes(filters.status as (typeof DOCTOR_ACCOUNT_STATUSES)[number])
      ? filters.status
      : undefined;

  const accounts = await prisma.user.findMany({
    where: {
      role: UserRole.DOCTOR,
      ...(status ? { status } : {})
    },
    orderBy: [{ status: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      phone: true,
      status: true,
      emailVerifiedAt: true,
      createdAt: true,
      lastLoginAt: true,
      doctorProfile: {
        select: {
          id: true,
          professionalName: true,
          publicSlug: true,
          specialty: true,
          licenseNumber: true,
          isPublic: true
        }
      }
    }
  });

  // Estado de IA por medico: se resuelve de la suscripcion vigente (TRIAL/ACTIVE)
  // mas reciente, mezclando las capacidades del plan con el override por medico.
  // Una sola consulta para todos los perfiles (evita N+1).
  const profileIds = accounts
    .map((account) => account.doctorProfile?.id)
    .filter((id): id is string => Boolean(id));

  const aiByProfileId = await resolveAiStateByProfileId(profileIds);

  return {
    accounts: accounts.map((account) => ({
      ...account,
      ai: (account.doctorProfile && aiByProfileId.get(account.doctorProfile.id)) ?? {
        enabled: false,
        monthlyCredits: 0
      }
    }))
  };
}

interface DoctorAiState {
  enabled: boolean;
  monthlyCredits: number;
}

/** Estado de IA (habilitado + creditos efectivos) por perfil de medico. */
async function resolveAiStateByProfileId(
  profileIds: string[]
): Promise<Map<string, DoctorAiState>> {
  const result = new Map<string, DoctorAiState>();
  if (profileIds.length === 0) {
    return result;
  }

  const subscriptions = await prisma.doctorSubscription.findMany({
    where: {
      doctorProfileId: { in: profileIds },
      status: { in: [...ENTITLED_SUBSCRIPTION_STATUSES] }
    },
    orderBy: { createdAt: "desc" },
    select: {
      doctorProfileId: true,
      capabilitiesPatch: true,
      plan: { select: { capabilities: true } }
    }
  });

  for (const subscription of subscriptions) {
    // findMany va de mas reciente a mas antigua: la primera por perfil es la vigente.
    if (result.has(subscription.doctorProfileId)) {
      continue;
    }
    const capabilities = {
      ...asCapabilityRecord(subscription.plan.capabilities),
      ...asCapabilityRecord(subscription.capabilitiesPatch)
    };
    result.set(subscription.doctorProfileId, {
      enabled: capabilities.ai === true,
      monthlyCredits: readAiCreditAllowance(capabilities)
    });
  }

  return result;
}

export async function updateDoctorAccountStatus(
  adminUserId: string,
  doctorUserId: string,
  status: UserStatus
) {
  const admin = await assertAdminUserId(adminUserId);

  if (!admin) {
    throw new PlatformAdminServiceError("No autorizado.", 401);
  }

  if (!DOCTOR_ACCOUNT_STATUSES.includes(status as (typeof DOCTOR_ACCOUNT_STATUSES)[number])) {
    throw new PlatformAdminServiceError("Estado no permitido.");
  }

  const doctor = await prisma.user.findFirst({
    where: {
      id: doctorUserId,
      role: UserRole.DOCTOR
    }
  });

  if (!doctor) {
    throw new PlatformAdminServiceError("Medico no encontrado.", 404);
  }

  const updated = await prisma.user.update({
    where: { id: doctorUserId },
    data: { status },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      status: true,
      doctorProfile: {
        select: {
          professionalName: true,
          publicSlug: true,
          isPublic: true
        }
      }
    }
  });

  await writeAuditLog({
    actorUserId: adminUserId,
    entityType: "User",
    entityId: doctorUserId,
    action: "platform.doctor.status_updated",
    source: "platform-admin-service",
    metadata: {
      previousStatus: doctor.status,
      nextStatus: status
    }
  });

  return updated;
}

export interface DoctorAiAccessInput {
  /** Habilita o inhabilita la transcripcion/asistencia en nube para el medico. */
  aiEnabled: boolean;
  /**
   * Override de creditos mensuales de IA para este medico. `undefined` deja el
   * override tal cual; `null` lo limpia (hereda el default del plan); un numero
   * lo fija. Solo tiene efecto con la IA habilitada.
   */
  aiCreditsMonthly?: number | null;
}

/** Plan ACTIVE para asignar cuando el medico no tiene suscripcion vigente. */
async function resolveGrantablePlan() {
  const plans = await prisma.subscriptionPlan.findMany({
    where: { status: PlanStatus.ACTIVE },
    orderBy: { priceCents: "asc" }
  });
  // Preferimos un plan con IA (creditos por defecto coherentes); si no hay,
  // usamos el mas barato y la IA se habilita via override.
  const plan =
    plans.find((candidate) => asCapabilityRecord(candidate.capabilities).ai === true) ?? plans[0];
  if (!plan) {
    throw new PlatformAdminServiceError("No hay un plan disponible para asignar.", 409);
  }
  return plan;
}

/**
 * Habilita/inhabilita la IA de un medico y (opcionalmente) fija sus creditos
 * mensuales, como override por medico sobre las capacidades del plan
 * (`capabilitiesPatch`). Si el medico no tiene una suscripcion vigente y se
 * habilita la IA, se le crea una ACTIVE en un plan con IA disponible. Devuelve
 * el resumen de creditos resultante.
 */
export async function updateDoctorAiAccess(
  adminUserId: string,
  doctorUserId: string,
  input: DoctorAiAccessInput
): Promise<AiCreditSummary> {
  const admin = await assertAdminUserId(adminUserId);
  if (!admin) {
    throw new PlatformAdminServiceError("No autorizado.", 401);
  }

  if (input.aiCreditsMonthly != null && (!Number.isInteger(input.aiCreditsMonthly) || input.aiCreditsMonthly < 0)) {
    throw new PlatformAdminServiceError("Los creditos de IA deben ser un entero mayor o igual a cero.");
  }

  const doctor = await prisma.user.findFirst({
    where: { id: doctorUserId, role: UserRole.DOCTOR },
    include: { doctorProfile: { select: { id: true } } }
  });
  if (!doctor || !doctor.doctorProfile) {
    throw new PlatformAdminServiceError("Medico no encontrado.", 404);
  }
  const doctorProfileId = doctor.doctorProfile.id;

  let subscription = await prisma.doctorSubscription.findFirst({
    where: { doctorProfileId, status: { in: [...ENTITLED_SUBSCRIPTION_STATUSES] } },
    orderBy: { createdAt: "desc" }
  });

  if (!subscription) {
    // Deshabilitar sin suscripcion vigente es no-op: la IA ya esta gateada.
    if (!input.aiEnabled) {
      return getDoctorAiCreditSummary(doctorUserId);
    }
    const plan = await resolveGrantablePlan();
    subscription = await prisma.doctorSubscription.create({
      data: {
        doctorProfileId,
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        startsAt: new Date(),
        renewsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30)
      }
    });
  }

  const patch = asCapabilityRecord(subscription.capabilitiesPatch);
  patch.ai = input.aiEnabled;
  if (input.aiCreditsMonthly === null) {
    delete patch.aiCreditsMonthly;
  } else if (typeof input.aiCreditsMonthly === "number") {
    patch.aiCreditsMonthly = input.aiCreditsMonthly;
  }

  await prisma.doctorSubscription.update({
    where: { id: subscription.id },
    data: { capabilitiesPatch: patch as Prisma.InputJsonValue }
  });

  await writeAuditLog({
    actorUserId: adminUserId,
    entityType: "DoctorSubscription",
    entityId: subscription.id,
    action: "platform.doctor.ai_access_updated",
    source: "platform-admin-service",
    metadata: {
      doctorUserId,
      aiEnabled: input.aiEnabled,
      aiCreditsMonthly: input.aiCreditsMonthly ?? null
    }
  });

  return getDoctorAiCreditSummary(doctorUserId);
}
