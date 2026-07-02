import {
  randomInt
} from "node:crypto";

import {
  PlanStatus,
  AuthSessionStatus,
  ClinicalProfile,
  EmailVerificationTokenStatus,
  LegalDocumentType,
  NotificationChannel,
  NotificationKind,
  PasswordResetStatus,
  SubscriptionStatus,
  UserRole,
  UserStatus,
  type User
} from "@prisma/client";

import { writeAuditLog } from "../../lib/audit";
import { env } from "../../lib/env";
import { ServiceError } from "../../lib/errors";
import {
  assertPasswordConfirmation,
  normalizeLicenseNumber,
  normalizeMexicanE164Phone,
  normalizePersonName,
  normalizeProfessionalName
} from "../../lib/identity-validation";
import { prisma } from "../../lib/prisma";
import { assertRateLimit } from "../../lib/rate-limit";
import { hashPassword, passwordNeedsRehash, verifyPassword } from "../../lib/security/password";
import { generateOpaqueToken, hashOpaqueToken } from "../../lib/security/token";
import { queueNotification } from "../notifications/notification-service";
import {
  consumeTwoFactorChallenge,
  isTwoFactorEnabled,
  issueTwoFactorChallenge,
  verifyTwoFactorCode
} from "./two-factor-service";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const PASSWORD_RESET_TTL_MS = 1000 * 60 * 15;
const PASSWORD_RESET_CODE_LENGTH = 6;
const EMAIL_VERIFICATION_TTL_MS = 1000 * 60 * 60 * 24;
const SUBSCRIPTION_READY_STATUSES = [
  SubscriptionStatus.TRIAL,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.PAUSED
] as const;

type DoctorSpecialtyInput = "GENERAL_MEDICINE" | "ODONTOLOGY";

class AuthServiceError extends ServiceError {}

const PASSWORD_RESET_GENERIC_MESSAGE =
  "Si existe una cuenta activa con ese correo, enviaremos instrucciones para restablecer la contrasena.";

const DOCTOR_LOGIN_STATUSES = [UserStatus.ACTIVE, UserStatus.PENDING_APPROVAL] as const;

function defaultPlanConfiguration(planCode: string) {
  const normalized = planCode.trim().toUpperCase();
  const fullClinicalCapabilities = {
    agenda: true,
    documents: true,
    notifications: true,
    ai: true,
    presential: true
  };

  switch (normalized) {
    case "AGENDA":
    case "AGENDA_ONLY":
      return {
        name: "Agenda",
        priceCents: 54900,
        capabilities: {
          agenda: true,
          documents: false,
          notifications: true,
          ai: false,
          presential: false,
          aiCreditsMonthly: 0
        }
      };
    case "CLINICO":
    case "CLINICAL":
    case "ESSENTIAL":
      return {
        name: normalized === "ESSENTIAL" ? "Plan Essential" : "Clinico",
        priceCents: normalized === "ESSENTIAL" ? 0 : 99900,
        capabilities: { ...fullClinicalCapabilities, aiCreditsMonthly: 120 }
      };
    case "INTELIGENTE":
      return {
        name: "Inteligente",
        priceCents: 149900,
        capabilities: { ...fullClinicalCapabilities, aiCreditsMonthly: 900 }
      };
    case "INTELIGENTE_PLUS":
      return {
        name: "Inteligente Plus",
        priceCents: 229000,
        capabilities: { ...fullClinicalCapabilities, aiCreditsMonthly: 1800 }
      };
    default:
      return {
        name: planCode,
        priceCents: 0,
        capabilities: { ...fullClinicalCapabilities, aiCreditsMonthly: 120 }
      };
  }
}

function mapSpecialty(specialty: DoctorSpecialtyInput): ClinicalProfile {
  return specialty === "ODONTOLOGY"
    ? ClinicalProfile.ODONTOLOGY
    : ClinicalProfile.GENERAL_MEDICINE;
}

export function ensureStrongPassword(password: string) {
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
  passwordConfirmation?: string;
  firstName: string;
  lastName: string;
  phone?: string;
  professionalName: string;
  licenseNumber: string;
  specialty: DoctorSpecialtyInput;
  termsVersion: string;
  privacyVersion: string;
  requestIp?: string;
  requestUserAgent?: string;
}) {
  await assertRateLimit({
    key: `register:${input.email.toLowerCase()}`,
    limit: 5,
    windowMs: 1000 * 60 * 15
  });
  if (input.requestIp) {
    await assertRateLimit({
      key: `register-ip:${input.requestIp}`,
      limit: 10,
      windowMs: 1000 * 60 * 15
    });
  }

  ensureStrongPassword(input.password);
  assertPasswordConfirmation(input.password, input.passwordConfirmation);

  const email = input.email.trim().toLowerCase();
  const firstName = normalizePersonName(input.firstName, "firstName");
  const lastName = normalizePersonName(input.lastName, "lastName");
  const professionalName = normalizeProfessionalName(input.professionalName);
  const licenseNumber = normalizeLicenseNumber(input.licenseNumber);
  const phone = normalizeMexicanE164Phone(input.phone);
  const existingUser = await prisma.user.findUnique({
    where: { email }
  });

  if (existingUser) {
    throw new AuthServiceError("An account with this email already exists.", 409);
  }

  if (phone) {
    const phoneTaken = await prisma.user.findFirst({
      where: {
        role: UserRole.DOCTOR,
        phone
      },
      select: { id: true }
    });

    if (phoneTaken) {
      throw new AuthServiceError("Ese telefono ya esta asociado a una cuenta medica.", 409);
    }
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: UserRole.DOCTOR,
      status: UserStatus.PENDING_APPROVAL,
      firstName,
      lastName,
      phone,
      doctorProfile: {
        create: {
          professionalName,
          publicSlug: `doctor-${generateOpaqueToken(8)}`,
          licenseNumber,
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
    ipAddress: input.requestIp,
    userAgent: input.requestUserAgent,
    metadata: {
      role: user.role,
      status: user.status,
      specialty: user.doctorProfile?.specialty,
      emailDomain: email.split("@")[1] ?? null,
      hasPhone: Boolean(phone),
      phoneCountry: phone ? "MX" : null,
      termsVersion: input.termsVersion,
      privacyVersion: input.privacyVersion
    }
  });

  const emailVerification = await requestDoctorEmailVerification({
    userId: user.id,
    requestIp: input.requestIp,
    requestUserAgent: input.requestUserAgent
  });

  return { user, emailVerificationToken: emailVerification.verificationToken };
}

function doctorCanLogin(status: UserStatus) {
  return DOCTOR_LOGIN_STATUSES.includes(status as (typeof DOCTOR_LOGIN_STATUSES)[number]);
}

function userCanRecoverPassword(user: Pick<User, "role" | "status">) {
  return user.status === UserStatus.ACTIVE || (user.role === UserRole.DOCTOR && doctorCanLogin(user.status));
}

export async function signInDoctor(input: {
  email: string;
  password: string;
  requestIp?: string;
}) {
  await assertRateLimit({
    key: `login:${input.email.toLowerCase()}`,
    limit: 10,
    windowMs: 1000 * 60 * 15
  });
  if (input.requestIp) {
    await assertRateLimit({
      key: `login-ip:${input.requestIp}`,
      limit: 30,
      windowMs: 1000 * 60 * 15
    });
  }

  const email = input.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email }
  });

  if (!user || user.role !== UserRole.DOCTOR || !doctorCanLogin(user.status) || !user.passwordHash) {
    throw new AuthServiceError("Credenciales invalidas.", 401);
  }

  const isValid = await verifyPassword(input.password, user.passwordHash);

  if (!isValid) {
    throw new AuthServiceError("Credenciales invalidas.", 401);
  }

  // Re-hash transparente: los hashes legados migran a los parametros actuales
  // aprovechando que aqui tenemos la contrasena en claro y ya verificada.
  if (passwordNeedsRehash(user.passwordHash)) {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(input.password) }
    });
  }

  // Si el 2FA esta activo, no se crea sesion: se emite un desafio de segundo factor.
  if (await isTwoFactorEnabled(user.id)) {
    return {
      requiresTwoFactor: true as const,
      twoFactorToken: issueTwoFactorChallenge(user.id)
    };
  }

  const session = await createSessionForUser(user, "doctor.login");
  return { requiresTwoFactor: false as const, user, ...session };
}

export async function createSessionForUser(user: User, auditAction: string) {
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
    action: auditAction,
    source: "auth-service"
  });

  return { sessionToken, expiresAt };
}

/**
 * Completa un login que requiere 2FA: valida el desafio y el codigo (TOTP o
 * recuperacion) y crea la sesion.
 */
export async function completeTwoFactorLogin(input: { twoFactorToken: string; code: string }) {
  const userId = consumeTwoFactorChallenge(input.twoFactorToken);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== UserRole.DOCTOR || !doctorCanLogin(user.status)) {
    throw new AuthServiceError("Credenciales invalidas.", 401);
  }

  const valid = await verifyTwoFactorCode(userId, input.code);
  if (!valid) {
    throw new AuthServiceError("Codigo invalido.", 401);
  }

  const session = await createSessionForUser(user, "doctor.login");
  return { user, ...session };
}

export async function requestDoctorEmailVerification(input: {
  userId: string;
  requestIp?: string;
  requestUserAgent?: string;
}) {
  const user = await prisma.user.findUnique({
    where: { id: input.userId }
  });

  if (!user || user.role !== UserRole.DOCTOR || !doctorCanLogin(user.status)) {
    throw new AuthServiceError("Doctor account not found.", 404);
  }

  if (user.emailVerifiedAt) {
    return { alreadyVerified: true as const, verificationToken: undefined };
  }

  await prisma.emailVerificationToken.updateMany({
    where: {
      userId: user.id,
      status: EmailVerificationTokenStatus.ACTIVE
    },
    data: {
      status: EmailVerificationTokenStatus.REVOKED
    }
  });

  const verificationToken = generateOpaqueToken();
  const tokenHash = hashOpaqueToken(verificationToken);
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS);

  await prisma.emailVerificationToken.create({
    data: {
      userId: user.id,
      tokenHash,
      destination: user.email,
      status: EmailVerificationTokenStatus.ACTIVE,
      expiresAt,
      requestedIp: input.requestIp,
      requestedAgent: input.requestUserAgent
    }
  });

  await queueNotification({
    doctorId: user.id,
    channel: NotificationChannel.EMAIL,
    kind: NotificationKind.EMAIL_VERIFICATION,
    destination: user.email,
    actionUrl: `${env.APP_BASE_URL}/verificar-correo?token=${verificationToken}`,
    template: {
      expiresAt
    },
    metadata: {
      email: user.email
    }
  });

  await writeAuditLog({
    actorUserId: user.id,
    entityType: "EmailVerificationToken",
    entityId: tokenHash,
    action: "email-verification.requested",
    source: "auth-service",
    ipAddress: input.requestIp,
    userAgent: input.requestUserAgent
  });

  return {
    alreadyVerified: false as const,
    verificationToken: process.env.NODE_ENV === "test" ? verificationToken : undefined
  };
}

export async function confirmDoctorEmailVerification(input: { token: string }) {
  const tokenHash = hashOpaqueToken(input.token);
  const verificationToken = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash },
    include: { user: true }
  });

  if (
    !verificationToken ||
    verificationToken.status !== EmailVerificationTokenStatus.ACTIVE
  ) {
    throw new AuthServiceError("Token de verificacion invalido o expirado.", 400);
  }

  if (verificationToken.expiresAt <= new Date()) {
    await prisma.emailVerificationToken.update({
      where: { id: verificationToken.id },
      data: { status: EmailVerificationTokenStatus.EXPIRED }
    });
    throw new AuthServiceError("Token de verificacion invalido o expirado.", 400);
  }

  const verifiedAt = new Date();
  await prisma.$transaction([
    prisma.user.update({
      where: { id: verificationToken.userId },
      data: {
        emailVerifiedAt: verificationToken.user.emailVerifiedAt ?? verifiedAt
      }
    }),
    prisma.emailVerificationToken.update({
      where: { id: verificationToken.id },
      data: {
        status: EmailVerificationTokenStatus.USED,
        usedAt: verifiedAt
      }
    })
  ]);

  await writeAuditLog({
    actorUserId: verificationToken.userId,
    entityType: "User",
    entityId: verificationToken.userId,
    action: "email-verification.confirmed",
    source: "auth-service"
  });

  return { verified: true as const };
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
  channel?: "EMAIL" | "SMS";
  requestIp?: string;
  requestUserAgent?: string;
}) {
  await assertRateLimit({
    key: `password-reset:${input.email.toLowerCase()}`,
    limit: 5,
    windowMs: 1000 * 60 * 15
  });
  if (input.requestIp) {
    await assertRateLimit({
      key: `password-reset-ip:${input.requestIp}`,
      limit: 15,
      windowMs: 1000 * 60 * 15
    });
  }

  const email = input.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      doctorProfile: { select: { phone: true } },
      patientLinks: {
        where: { phone: { not: null } },
        select: { phone: true },
        take: 1
      }
    }
  });

  if (!user || !userCanRecoverPassword(user)) {
    return {
      message: PASSWORD_RESET_GENERIC_MESSAGE
    };
  }

  const channel = input.channel ? NotificationChannel[input.channel] : null;
  const destination =
    channel === NotificationChannel.SMS
      ? user.phone ?? user.doctorProfile?.phone ?? user.patientLinks[0]?.phone ?? null
      : user.email;

  if (channel === NotificationChannel.SMS && !destination) {
    return { message: PASSWORD_RESET_GENERIC_MESSAGE };
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
  const resetCode = channel ? buildPasswordResetCode() : null;
  const codeHash = resetCode ? hashOpaqueToken(`${email}:${resetCode}`) : null;
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      codeHash,
      deliveryChannel: channel ?? NotificationChannel.EMAIL,
      destination: destination ?? user.email,
      status: PasswordResetStatus.ACTIVE,
      expiresAt,
      requestedIp: input.requestIp,
      requestedAgent: input.requestUserAgent
    }
  });

  if (channel) {
    await queueNotification({
      doctorId: user.id,
      channel,
      kind: NotificationKind.PASSWORD_RESET,
      destination: destination ?? user.email,
      template: {
        resetCode,
        expiresAt
      },
      metadata: {
        email: user.email,
        channel
      }
    });
  } else {
    // The queued email must carry the link with the raw token; exposure is
    // bounded by the 15-minute TTL and single use.
    const resetUrl = `${env.APP_BASE_URL}/recuperar?token=${resetToken}`;

    await queueNotification({
      doctorId: user.id,
      channel: "EMAIL",
      kind: NotificationKind.PASSWORD_RESET,
      destination: user.email,
      actionUrl: resetUrl,
      template: {
        expiresAt
      },
      shortLink: {
        expiresAt,
        maxUses: 1
      },
      metadata: {
        email: user.email,
        resetUrl
      }
    });
  }

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
    message: PASSWORD_RESET_GENERIC_MESSAGE,
    resetToken: process.env.NODE_ENV === "test" && !channel ? resetToken : undefined,
    resetCode: process.env.NODE_ENV === "test" && resetCode ? resetCode : undefined
  };
}

function buildPasswordResetCode() {
  const min = 10 ** (PASSWORD_RESET_CODE_LENGTH - 1);
  const max = 10 ** PASSWORD_RESET_CODE_LENGTH;
  return String(randomInt(min, max));
}

async function consumePasswordReset(input: {
  userId: string;
  tokenId: string;
  newPassword: string;
}) {
  const newPasswordHash = await hashPassword(input.newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: input.userId },
      data: {
        passwordHash: newPasswordHash
      }
    }),
    prisma.passwordResetToken.update({
      where: { id: input.tokenId },
      data: {
        status: PasswordResetStatus.USED,
        usedAt: new Date()
      }
    }),
    prisma.authSession.updateMany({
      where: {
        userId: input.userId,
        status: AuthSessionStatus.ACTIVE
      },
      data: {
        status: AuthSessionStatus.REVOKED,
        revokedAt: new Date()
      }
    })
  ]);

  await writeAuditLog({
    actorUserId: input.userId,
    entityType: "User",
    entityId: input.userId,
    action: "password-reset.completed",
    source: "auth-service"
  });
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

  await consumePasswordReset({
    userId: passwordResetToken.userId,
    tokenId: passwordResetToken.id,
    newPassword: input.newPassword
  });
}

export async function resetPasswordWithCode(input: { email: string; code: string; newPassword: string }) {
  ensureStrongPassword(input.newPassword);

  const email = input.email.trim().toLowerCase();
  const code = input.code.trim();

  if (!/^\d{6}$/.test(code)) {
    throw new AuthServiceError("Codigo invalido o expirado.", 400);
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !userCanRecoverPassword(user)) {
    throw new AuthServiceError("Codigo invalido o expirado.", 400);
  }

  const passwordResetToken = await prisma.passwordResetToken.findFirst({
    where: {
      userId: user.id,
      codeHash: hashOpaqueToken(`${email}:${code}`),
      status: PasswordResetStatus.ACTIVE,
      expiresAt: { gt: new Date() }
    },
    orderBy: { createdAt: "desc" }
  });

  if (!passwordResetToken) {
    throw new AuthServiceError("Codigo invalido o expirado.", 400);
  }

  await consumePasswordReset({
    userId: passwordResetToken.userId,
    tokenId: passwordResetToken.id,
    newPassword: input.newPassword
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

  const planDefaults = defaultPlanConfiguration(input.planCode);

  const plan = await prisma.subscriptionPlan.upsert({
    where: {
      code: input.planCode
    },
    update: {
      status: PlanStatus.ACTIVE,
      name: planDefaults.name,
      priceCents: planDefaults.priceCents,
      capabilities: planDefaults.capabilities
    },
    create: {
      code: input.planCode,
      name: planDefaults.name,
      status: PlanStatus.ACTIVE,
      billingInterval: "monthly",
      priceCents: planDefaults.priceCents,
      currency: "MXN",
      capabilities: planDefaults.capabilities
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

  const gateStatus = {
    emailVerified: Boolean(doctor.emailVerifiedAt),
    approvalStatus: doctor.status,
    canPublishProfile: Boolean(doctor.emailVerifiedAt) && doctor.status === UserStatus.ACTIVE
  };
  const hasSubscription = doctor.doctorProfile.subscriptions.length > 0;

  if (!hasSubscription) {
    return {
      nextStep: "SUBSCRIPTION" as const,
      ...gateStatus
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
      nextStep: "ONBOARDING" as const,
      ...gateStatus
    };
  }

  return {
    nextStep: "DASHBOARD" as const,
    ...gateStatus
  };
}
