import {
  PlanStatus,
  SubscriptionStatus,
  UserRole,
  type DoctorSubscription,
  type SubscriptionPlan
} from "@prisma/client";

import { writeAuditLog } from "../../lib/audit";
import { ServiceError } from "../../lib/errors";
import { prisma } from "../../lib/prisma";

/** OPERATIVO: gobernanza comercial (planes, capacidades, ciclo de vida). Sin contenido clinico. */
export class SubscriptionServiceError extends ServiceError {}

/**
 * Catalogo de capacidades que un plan puede habilitar. El gating por capacidad
 * (`require-capability.ts`) y la app del medico consultan estas claves.
 */
export const CAPABILITIES = [
  "agenda", // agenda publica y holds
  "documents", // buzon de documentos y resumenes autorizados
  "notifications", // SMS y correo transaccional
  "ai", // IA clinica gobernada
  "presential" // operacion presencial (recepcion, caja)
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export type CapabilityMap = Record<Capability, boolean>;

/** Alias de claves heredadas hacia el catalogo actual, para planes antiguos. */
const LEGACY_CAPABILITY_ALIASES: Record<string, Capability> = {
  scheduling: "agenda",
  sms: "notifications",
  email: "notifications"
};

/** Estados que dan derecho a las capacidades del plan. */
const ENTITLED_STATUSES = [SubscriptionStatus.TRIAL, SubscriptionStatus.ACTIVE] as const;

/** Estados que cuentan como suscripcion vigente (existe, aunque no de derecho). */
const CURRENT_STATUSES = [
  SubscriptionStatus.TRIAL,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.PAUSED
] as const;

function emptyCapabilities(): CapabilityMap {
  return CAPABILITIES.reduce((acc, cap) => {
    acc[cap] = false;
    return acc;
  }, {} as CapabilityMap);
}

/** Lee un JSON de capacidades (plan o parche) tolerando claves heredadas y desconocidas. */
function readCapabilityMap(source: unknown): Partial<CapabilityMap> {
  if (!source || typeof source !== "object") {
    return {};
  }

  const record = source as Record<string, unknown>;
  const out: Partial<CapabilityMap> = {};

  for (const [key, value] of Object.entries(record)) {
    if (typeof value !== "boolean") {
      continue;
    }

    const canonical = (CAPABILITIES as readonly string[]).includes(key)
      ? (key as Capability)
      : LEGACY_CAPABILITY_ALIASES[key];

    if (canonical) {
      // Una capacidad habilitada por cualquier alias gana.
      out[canonical] = out[canonical] === true ? true : value;
    }
  }

  return out;
}

type SubscriptionWithPlan = DoctorSubscription & { plan: SubscriptionPlan };

async function resolveDoctorProfileId(userId: string): Promise<string> {
  const doctor = await prisma.user.findUnique({
    where: { id: userId },
    include: { doctorProfile: { select: { id: true } } }
  });

  if (!doctor || doctor.role !== UserRole.DOCTOR || !doctor.doctorProfile) {
    throw new SubscriptionServiceError("Cuenta de medico no encontrada.", 404);
  }

  return doctor.doctorProfile.id;
}

/**
 * Ultima suscripcion del medico, sin importar su estado, para reflejar la realidad
 * (incluido CANCELLED) en la UI. El derecho a capacidades se deriva del estado.
 */
async function getLatestSubscription(
  doctorProfileId: string
): Promise<SubscriptionWithPlan | null> {
  return prisma.doctorSubscription.findFirst({
    where: { doctorProfileId },
    include: { plan: true },
    orderBy: { createdAt: "desc" }
  });
}

export interface ResolvedSubscription {
  subscription: SubscriptionWithPlan | null;
  status: SubscriptionStatus | null;
  planCode: string | null;
  /** El estado da derecho a usar las capacidades del plan. */
  entitled: boolean;
  /** Capacidades efectivas: vacias si no hay suscripcion con derecho. */
  capabilities: CapabilityMap;
}

/**
 * Resuelve las capacidades efectivas del medico: capacidades del plan, parchadas
 * por la suscripcion, y solo si el estado da derecho. Sin suscripcion vigente con
 * derecho => todas las capacidades en false (todo gateado).
 */
export async function resolveDoctorCapabilities(userId: string): Promise<ResolvedSubscription> {
  const doctorProfileId = await resolveDoctorProfileId(userId);
  const subscription = await getLatestSubscription(doctorProfileId);

  if (!subscription) {
    return {
      subscription: null,
      status: null,
      planCode: null,
      entitled: false,
      capabilities: emptyCapabilities()
    };
  }

  const entitled = (ENTITLED_STATUSES as readonly SubscriptionStatus[]).includes(
    subscription.status
  );

  const capabilities = emptyCapabilities();

  if (entitled) {
    Object.assign(
      capabilities,
      readCapabilityMap(subscription.plan.capabilities),
      readCapabilityMap(subscription.capabilitiesPatch)
    );
  }

  return {
    subscription,
    status: subscription.status,
    planCode: subscription.plan.code,
    entitled,
    capabilities
  };
}

export async function getDoctorSubscription(userId: string): Promise<ResolvedSubscription> {
  return resolveDoctorCapabilities(userId);
}

export async function listAvailablePlans() {
  return prisma.subscriptionPlan.findMany({
    where: { status: PlanStatus.ACTIVE },
    orderBy: { priceCents: "asc" }
  });
}

async function transition(
  userId: string,
  options: {
    from: readonly SubscriptionStatus[];
    to: SubscriptionStatus;
    action: string;
    notFoundMessage: string;
    extraData?: Record<string, unknown>;
  }
): Promise<SubscriptionWithPlan> {
  const doctorProfileId = await resolveDoctorProfileId(userId);
  const current = await prisma.doctorSubscription.findFirst({
    where: { doctorProfileId, status: { in: [...options.from] } },
    orderBy: { createdAt: "desc" }
  });

  if (!current) {
    throw new SubscriptionServiceError(options.notFoundMessage, 409);
  }

  const updated = await prisma.doctorSubscription.update({
    where: { id: current.id },
    data: { status: options.to, ...options.extraData },
    include: { plan: true }
  });

  await writeAuditLog({
    actorUserId: userId,
    entityType: "DoctorSubscription",
    entityId: updated.id,
    action: options.action,
    source: "subscription-service",
    metadata: { from: current.status, to: updated.status, planCode: updated.plan.code }
  });

  return updated;
}

export async function cancelSubscription(userId: string): Promise<SubscriptionWithPlan> {
  return transition(userId, {
    from: CURRENT_STATUSES,
    to: SubscriptionStatus.CANCELLED,
    action: "doctor.subscription.cancelled",
    notFoundMessage: "No hay una suscripcion vigente para cancelar.",
    extraData: { cancelledAt: new Date() }
  });
}

export async function pauseSubscription(userId: string): Promise<SubscriptionWithPlan> {
  return transition(userId, {
    from: ENTITLED_STATUSES,
    to: SubscriptionStatus.PAUSED,
    action: "doctor.subscription.paused",
    notFoundMessage: "No hay una suscripcion activa para pausar."
  });
}

export async function reactivateSubscription(userId: string): Promise<SubscriptionWithPlan> {
  return transition(userId, {
    from: [SubscriptionStatus.PAUSED, SubscriptionStatus.PAST_DUE, SubscriptionStatus.CANCELLED],
    to: SubscriptionStatus.ACTIVE,
    action: "doctor.subscription.reactivated",
    notFoundMessage: "No hay una suscripcion para reactivar.",
    extraData: { cancelledAt: null }
  });
}

export async function changePlan(
  userId: string,
  planCode: string
): Promise<SubscriptionWithPlan> {
  const doctorProfileId = await resolveDoctorProfileId(userId);

  const plan = await prisma.subscriptionPlan.findUnique({ where: { code: planCode } });

  if (!plan || plan.status !== PlanStatus.ACTIVE) {
    throw new SubscriptionServiceError("Plan no disponible.", 404);
  }

  return prisma.$transaction(async (tx) => {
    await tx.doctorSubscription.updateMany({
      where: { doctorProfileId, status: { in: [...CURRENT_STATUSES] } },
      data: { status: SubscriptionStatus.CANCELLED, cancelledAt: new Date() }
    });

    const created = await tx.doctorSubscription.create({
      data: {
        doctorProfileId,
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        startsAt: new Date(),
        renewsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30)
      },
      include: { plan: true }
    });

    await writeAuditLog({
      actorUserId: userId,
      entityType: "DoctorSubscription",
      entityId: created.id,
      action: "doctor.subscription.plan_changed",
      source: "subscription-service",
      metadata: { planCode: plan.code, status: created.status }
    });

    return created;
  });
}
