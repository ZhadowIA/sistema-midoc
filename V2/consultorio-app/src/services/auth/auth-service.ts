import {
  PlanStatus,
  AuthSessionStatus,
  ClinicalProfile,
  LegalDocumentType,
  NotificationChannel,
  NotificationKind,
  NotificationStatus,
  PasswordResetStatus,
  SubscriptionStatus,
  UserRole,
  UserStatus,
  type User
} from "@prisma/client";

import { writeAuditLog } from "../../lib/audit";
import { env } from "../../lib/env";
import { ServiceError } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { assertRateLimit } from "../../lib/rate-limit";
import { hashPassword, verifyPassword } from "../../lib/security/password";
import { generateOpaqueToken, hashOpaqueToken } from "../../lib/security/token";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const PASSWORD_RESET_TTL_MS = 1000 * 60 * 15;
const SUBSCRIPTION_READY_STATUSES = [
  SubscriptionStatus.TRIAL,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.PAUSED
] as const;

type DoctorSpecialtyInput = "GENERAL_MEDICINE" | "ODONTOLOGY";

class AuthServiceError extends ServiceError {}

function mapSpecialty(specialty: DoctorSpecialtyInput): ClinicalProfile {
  return specialty === "ODONTOLOGY"
    ? ClinicalProfile.ODONTOLOGY
    : ClinicalProfile.GENERAL_MEDICINE;
}

function ensureStrongPassword(password: string) {
  const meetsLength = password.length >= 12;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);

  if (!(meetsLength && hasUpper && hasLower && hasNumber && hasSymbol)) {
    throw new AuthServiceError("Password does not meet the required policy.");
  }
}

export async function createDoctorAccount(input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  professionalName: string;
  specialty: DoctorSpecialtyInput;
  termsVersion: string;
  privacyVersion: string;
  requestIp?: string;
}) {
  assertRateLimit({
    key: `register:${input.email.toLowerCase()}`,
    limit: 5,
    windowMs: 1000 * 60 * 15
  });
  if (input.requestIp) {
    assertRateLimit({
      key: `register-ip:${input.requestIp}`,
      limit: 10,
      windowMs: 1000 * 60 * 15
    });
  }

  ensureStrongPassword(input.password);

  const email = input.email.trim().toLowerCase();
  const existingUser = await prisma.user.findUnique({
    where: { email }
  });

  if (existingUser) {
    throw new AuthServiceError("An account with this email already exists.", 409);
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: UserRole.DOCTOR,
      status: UserStatus.ACTIVE,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      phone: input.phone?.trim(),
      doctorProfile: {
        create: {
          professionalName: input.professionalName.trim(),
          publicSlug: `doctor-${generateOpaqueToken(8)}`,
          specialty: mapSpecialty(input.specialty),
          isPublic: false
        }
      },
      legalAcceptances: {
        create: [
          {
            documentType: LegalDocumentType.TERMS,
            version: input.termsVersion
          },
          {
            documentType: LegalDocumentType.PRIVACY,
            version: input.privacyVersion
          }
        ]
      }
    },
    include: {
      doctorProfile: true
    }
  });

  await writeAuditLog({
    actorUserId: user.id,
    entityType: "User",
    entityId: user.id,
    action: "doctor.registered",
    source: "auth-service",
    metadata: {
      role: user.role,
      specialty: user.doctorProfile?.specialty
    }
  });

  return { user };
}

export async function signInDoctor(input: {
  email: string;
  password: string;
  requestIp?: string;
}) {
  assertRateLimit({
    key: `login:${input.email.toLowerCase()}`,
    limit: 10,
    windowMs: 1000 * 60 * 15
  });
  if (input.requestIp) {
    assertRateLimit({
      key: `login-ip:${input.requestIp}`,
      limit: 30,
      windowMs: 1000 * 60 * 15
    });
  }

  const email = input.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email }
  });

  if (!user || user.role !== UserRole.DOCTOR || user.status !== UserStatus.ACTIVE || !user.passwordHash) {
    throw new AuthServiceError("Invalid credentials.", 401);
  }

  const isValid = await verifyPassword(input.password, user.passwordHash);

  if (!isValid) {
    throw new AuthServiceError("Invalid credentials.", 401);
  }

  const sessionToken = generateOpaqueToken();
  const tokenHash = hashOpaqueToken(sessionToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.authSession.create({
    data: {
      userId: user.id,
      tokenHash,
      status: AuthSessionStatus.ACTIVE,
      expiresAt
    }
  });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLoginAt: new Date()
    }
  });

  await writeAuditLog({
    actorUserId: user.id,
    entityType: "AuthSession",
    entityId: tokenHash,
    action: "doctor.login",
    source: "auth-service"
  });

  return {
    user,
    sessionToken,
    expiresAt
  };
}

export async function validateAuthSession(sessionToken: string): Promise<User | null> {
  const tokenHash = hashOpaqueToken(sessionToken);
  const session = await prisma.authSession.findUnique({
    where: { tokenHash },
    include: { user: true }
  });

  if (!session) {
    return null;
  }

  if (session.status !== AuthSessionStatus.ACTIVE || session.revokedAt || session.expiresAt <= new Date()) {
    if (session.status === AuthSessionStatus.ACTIVE && session.expiresAt <= new Date()) {
      await prisma.authSession.update({
        where: { id: session.id },
        data: {
          status: AuthSessionStatus.EXPIRED
        }
      });
    }

    return null;
  }

  await prisma.authSession.update({
    where: { id: session.id },
    data: {
      lastSeenAt: new Date()
    }
  });

  return session.user;
}

export async function revokeAuthSession(sessionToken: string) {
  const tokenHash = hashOpaqueToken(sessionToken);
  const session = await prisma.authSession.findUnique({
    where: { tokenHash }
  });

  if (!session) {
    return;
  }

  await prisma.authSession.update({
    where: { id: session.id },
    data: {
      status: AuthSessionStatus.REVOKED,
      revokedAt: new Date()
    }
  });
}

export async function requestPasswordReset(input: {
  email: string;
  requestIp?: string;
  requestUserAgent?: string;
}) {
  assertRateLimit({
    key: `password-reset:${input.email.toLowerCase()}`,
    limit: 5,
    windowMs: 1000 * 60 * 15
  });
  if (input.requestIp) {
    assertRateLimit({
      key: `password-reset-ip:${input.requestIp}`,
      limit: 15,
      windowMs: 1000 * 60 * 15
    });
  }

  const email = input.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email }
  });

  if (!user || user.status !== UserStatus.ACTIVE) {
    return {
      message:
        "Si existe una cuenta activa con ese correo, enviaremos instrucciones para restablecer la contrasena."
    };
  }

  await prisma.passwordResetToken.updateMany({
    where: {
      userId: user.id,
      status: PasswordResetStatus.ACTIVE
    },
    data: {
      status: PasswordResetStatus.REVOKED
    }
  });

  const resetToken = generateOpaqueToken();
  const tokenHash = hashOpaqueToken(resetToken);

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      status: PasswordResetStatus.ACTIVE,
      expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      requestedIp: input.requestIp,
      requestedAgent: input.requestUserAgent
    }
  });

  // The queued email must carry the link with the raw token; exposure is
  // bounded by the 15-minute TTL and single use.
  const resetUrl = `${env.APP_BASE_URL}/recuperar?token=${resetToken}`;

  await prisma.notification.create({
    data: {
      doctorId: user.id,
      channel: NotificationChannel.EMAIL,
      kind: NotificationKind.PASSWORD_RESET,
      destination: user.email,
      subject: "Restablece tu contrasena",
      body: `Para restablecer la contrasena de tu cuenta MiDoc entra a: ${resetUrl}\nEl enlace vence en 15 minutos y solo puede usarse una vez. Si no solicitaste este cambio, ignora este correo.`,
      status: NotificationStatus.PENDING,
      metadata: {
        email: user.email,
        resetUrl
      }
    }
  });

  await writeAuditLog({
    actorUserId: user.id,
    entityType: "PasswordResetToken",
    entityId: tokenHash,
    action: "password-reset.requested",
    source: "auth-service",
    metadata: {
      requestIp: input.requestIp
    }
  });

  return {
    message:
      "Si existe una cuenta activa con ese correo, enviaremos instrucciones para restablecer la contrasena.",
    resetToken: process.env.NODE_ENV === "test" ? resetToken : undefined
  };
}

export async function resetPassword(input: { token: string; newPassword: string }) {
  ensureStrongPassword(input.newPassword);

  const tokenHash = hashOpaqueToken(input.token);
  const passwordResetToken = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true }
  });

  if (
    !passwordResetToken ||
    passwordResetToken.status !== PasswordResetStatus.ACTIVE ||
    passwordResetToken.expiresAt <= new Date()
  ) {
    throw new AuthServiceError("Invalid or expired reset token.", 400);
  }

  const newPasswordHash = await hashPassword(input.newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: passwordResetToken.userId },
      data: {
        passwordHash: newPasswordHash
      }
    }),
    prisma.passwordResetToken.update({
      where: { id: passwordResetToken.id },
      data: {
        status: PasswordResetStatus.USED,
        usedAt: new Date()
      }
    }),
    prisma.authSession.updateMany({
      where: {
        userId: passwordResetToken.userId,
        status: AuthSessionStatus.ACTIVE
      },
      data: {
        status: AuthSessionStatus.REVOKED,
        revokedAt: new Date()
      }
    })
  ]);

  await writeAuditLog({
    actorUserId: passwordResetToken.userId,
    entityType: "User",
    entityId: passwordResetToken.userId,
    action: "password-reset.completed",
    source: "auth-service"
  });
}

export async function createDoctorSubscription(input: {
  doctorUserId: string;
  planCode: string;
}) {
  const doctor = await prisma.user.findUnique({
    where: { id: input.doctorUserId },
    include: {
      doctorProfile: true
    }
  });

  if (!doctor || doctor.role !== UserRole.DOCTOR || !doctor.doctorProfile) {
    throw new AuthServiceError("Doctor account not found.", 404);
  }

  const plan = await prisma.subscriptionPlan.upsert({
    where: {
      code: input.planCode
    },
    update: {
      status: PlanStatus.ACTIVE
    },
    create: {
      code: input.planCode,
      name: input.planCode === "ESSENTIAL" ? "Plan Essential" : input.planCode,
      status: PlanStatus.ACTIVE,
      billingInterval: "monthly",
      priceCents: 0,
      currency: "MXN",
      capabilities: {
        scheduling: true,
        sms: true
      }
    }
  });

  await prisma.doctorSubscription.updateMany({
    where: {
      doctorProfileId: doctor.doctorProfile.id,
      status: {
        in: [SubscriptionStatus.TRIAL, SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE]
      }
    },
    data: {
      status: SubscriptionStatus.CANCELLED,
      cancelledAt: new Date()
    }
  });

  const subscription = await prisma.doctorSubscription.create({
    data: {
      doctorProfileId: doctor.doctorProfile.id,
      planId: plan.id,
      status: SubscriptionStatus.TRIAL,
      startsAt: new Date(),
      renewsAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30)
    },
    include: {
      plan: true
    }
  });

  await writeAuditLog({
    actorUserId: doctor.id,
    entityType: "DoctorSubscription",
    entityId: subscription.id,
    action: "doctor.subscription.created",
    source: "auth-service",
    metadata: {
      planCode: plan.code,
      status: subscription.status
    }
  });

  return subscription;
}

export async function getDoctorSetupStatus(userId: string) {
  const doctor = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      doctorProfile: {
        include: {
          services: {
            where: {
              status: "ACTIVE"
            }
          },
          availabilityRules: {
            where: {
              isActive: true
            }
          },
          subscriptions: {
            where: {
              status: {
                in: [...SUBSCRIPTION_READY_STATUSES]
              }
            },
            orderBy: {
              createdAt: "desc"
            },
            take: 1
          }
        }
      }
    }
  });

  if (!doctor || doctor.role !== UserRole.DOCTOR || !doctor.doctorProfile) {
    throw new AuthServiceError("Doctor account not found.", 404);
  }

  const hasSubscription = doctor.doctorProfile.subscriptions.length > 0;

  if (!hasSubscription) {
    return {
      nextStep: "SUBSCRIPTION" as const
    };
  }

  const hasPublicProfile =
    doctor.doctorProfile.isPublic &&
    Boolean(doctor.doctorProfile.professionalName.trim()) &&
    Boolean(doctor.doctorProfile.publicSlug.trim()) &&
    Boolean(doctor.doctorProfile.specialty);

  const hasServices = doctor.doctorProfile.services.length > 0;
  const hasAvailability = doctor.doctorProfile.availabilityRules.length > 0;

  if (!(hasPublicProfile && hasServices && hasAvailability)) {
    return {
      nextStep: "ONBOARDING" as const
    };
  }

  return {
    nextStep: "DASHBOARD" as const
  };
}
