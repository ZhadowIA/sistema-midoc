import { UserRole, UserStatus } from "@prisma/client";

import { writeAuditLog } from "../../lib/audit";
import { ServiceError } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { assertRateLimit } from "../../lib/rate-limit";
import { verifyPassword } from "../../lib/security/password";
import { createSessionForUser } from "../auth/auth-service";

class PlatformAdminServiceError extends ServiceError {}

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

  assertRateLimit({
    key: `admin-login:${email}`,
    limit: 10,
    windowMs: 1000 * 60 * 15
  });
  if (input.requestIp) {
    assertRateLimit({
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

  return { accounts };
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
