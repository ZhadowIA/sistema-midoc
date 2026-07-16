import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient, UserStatus } from "@prisma/client";

import {
  confirmDoctorEmailVerification,
  createDoctorAccount,
  requestPasswordReset,
  resetPasswordWithCode,
  resetPassword,
  revokeAuthSession,
  signInDoctor,
  validateAuthSession
} from "../../src/services/auth/auth-service";
import { registerPatientAccount, signInPatient } from "../../src/services/patient/patient-auth-service";

const prisma = new PrismaClient();

function uniqueEmail(label: string) {
  return `${label}-${randomUUID()}@example.com`;
}

async function cleanupUserByEmail(email: string) {
  const user = await prisma.user.findUnique({
    where: { email }
  });

  if (!user) {
    return;
  }

  await prisma.user.delete({
    where: { id: user.id }
  });
}

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("auth service", () => {
  it("registers a doctor account with legal acceptance and profile", async () => {
    const email = uniqueEmail("doctor-register");

    try {
      const account = await createDoctorAccount({
        email,
        password: "Str0ngPass!123",
        firstName: "Ana",
        lastName: "Ramirez",
        personalPhone: "6140000000",
        patientContactPhone: "6140000001",
        professionalName: "Dra. Ana Ramirez",
        licenseNumber: "1234567",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05",
        requestIp: "127.0.0.1",
        requestUserAgent: "vitest"
      });

      const storedUser = await prisma.user.findUnique({
        where: { id: account.user.id },
        include: {
          doctorProfile: true,
          legalAcceptances: true
        }
      });

      expect(storedUser?.email).toBe(email);
      expect(storedUser?.status).toBe(UserStatus.PENDING_APPROVAL);
      expect(storedUser?.emailVerifiedAt).toBeNull();
      expect(storedUser?.phone).toBe("+526140000000");
      expect(storedUser?.doctorProfile?.professionalName).toBe("Dra. Ana Ramirez");
      expect(storedUser?.doctorProfile?.licenseNumber).toBe("1234567");
      expect(storedUser?.doctorProfile?.phone).toBe("+526140000001");
      expect(storedUser?.legalAcceptances).toHaveLength(2);
      expect(account.emailVerificationToken).toBeTruthy();

      const queuedVerification = await prisma.notification.findFirst({
        where: {
          destination: email,
          kind: "EMAIL_VERIFICATION"
        },
        orderBy: { createdAt: "desc" }
      });
      expect(queuedVerification?.body).toContain("/verificar-correo?token=");

      const audit = await prisma.auditLog.findFirst({
        where: {
          entityId: account.user.id,
          action: "doctor.registered"
        },
        orderBy: { createdAt: "desc" }
      });
      expect(audit?.ipAddress).toBe("127.0.0.1");
      expect(audit?.userAgent).toBe("vitest");
      expect(JSON.stringify(audit?.metadata)).toContain("emailDomain");
      expect(JSON.stringify(audit?.metadata)).not.toContain("Str0ngPass");
      expect(JSON.stringify(audit?.metadata)).not.toContain(account.emailVerificationToken ?? "missing-token");
    } finally {
      await cleanupUserByEmail(email);
    }
  });

  it("confirms a doctor email verification token", async () => {
    const email = uniqueEmail("doctor-email-verification");

    try {
      const account = await createDoctorAccount({
        email,
        password: "Str0ngPass!123",
        firstName: "Carla",
        lastName: "Vidal",
        phone: "6140000090",
        professionalName: "Dra. Carla Vidal",
        licenseNumber: "1234567",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      await confirmDoctorEmailVerification({
        token: account.emailVerificationToken!
      });

      const storedUser = await prisma.user.findUnique({
        where: { id: account.user.id }
      });
      const storedToken = await prisma.emailVerificationToken.findFirst({
        where: { userId: account.user.id }
      });

      expect(storedUser?.emailVerifiedAt).toBeInstanceOf(Date);
      expect(storedToken?.status).toBe("USED");
      expect(storedToken?.usedAt).toBeInstanceOf(Date);
    } finally {
      await cleanupUserByEmail(email);
    }
  });

  it("rejects duplicate doctor phones", async () => {
    const emailA = uniqueEmail("doctor-phone-a");
    const emailB = uniqueEmail("doctor-phone-b");

    try {
      await createDoctorAccount({
        email: emailA,
        password: "Str0ngPass!123",
        firstName: "Mario",
        lastName: "Silva",
        phone: "6140000199",
        professionalName: "Dr. Mario Silva",
        licenseNumber: "1234567",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      await expect(
        createDoctorAccount({
          email: emailB,
          password: "Str0ngPass!123",
          firstName: "Maria",
          lastName: "Silva",
          phone: "+526140000199",
          professionalName: "Dra. Maria Silva",
          licenseNumber: "7654321",
          specialty: "GENERAL_MEDICINE",
          termsVersion: "2026-05",
          privacyVersion: "2026-05"
        })
      ).rejects.toMatchObject({ status: 409 });
    } finally {
      await cleanupUserByEmail(emailA);
      await cleanupUserByEmail(emailB);
    }
  });

  it("creates and validates an auth session on login, then revokes it on logout", async () => {
    const email = uniqueEmail("doctor-login");

    try {
      await createDoctorAccount({
        email,
        password: "Str0ngPass!123",
        firstName: "Luis",
        lastName: "Mora",
        phone: "6140000001",
        professionalName: "Dr. Luis Mora",
        licenseNumber: "1234567",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      const login = await signInDoctor({
        email,
        password: "Str0ngPass!123"
      });

      if (login.requiresTwoFactor) {
        throw new Error("no se esperaba 2FA");
      }

      expect(login.sessionToken.length).toBeGreaterThan(20);

      const sessionUser = await validateAuthSession(login.sessionToken);
      expect(sessionUser?.email).toBe(email);

      await revokeAuthSession(login.sessionToken);

      const revoked = await validateAuthSession(login.sessionToken);
      expect(revoked).toBeNull();
    } finally {
      await cleanupUserByEmail(email);
    }
  });

  it("returns a non-enumerable response for password reset and consumes the token on reset", async () => {
    const email = uniqueEmail("doctor-reset");

    try {
      await createDoctorAccount({
        email,
        password: "Str0ngPass!123",
        firstName: "Paula",
        lastName: "Soto",
        phone: "6140000002",
        professionalName: "Dra. Paula Soto",
        licenseNumber: "1234567",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      const requestResult = await requestPasswordReset({
        email,
        requestIp: "127.0.0.1",
        requestUserAgent: "vitest"
      });

      expect(requestResult.message).toMatch(/si existe/i);
      expect(requestResult.resetToken).toBeTruthy();

      const queuedEmail = await prisma.notification.findFirst({
        where: {
          destination: email,
          kind: "PASSWORD_RESET"
        },
        orderBy: { createdAt: "desc" }
      });

      expect(queuedEmail?.body).toContain(`/recuperar?token=${requestResult.resetToken}`);

      await resetPassword({
        token: requestResult.resetToken!,
        newPassword: "N3wPass!4567"
      });

      const secondLogin = await signInDoctor({
        email,
        password: "N3wPass!4567"
      });

      if (secondLogin.requiresTwoFactor) {
        throw new Error("no se esperaba 2FA");
      }

      expect(secondLogin.user.email).toBe(email);

      await expect(
        resetPassword({
          token: requestResult.resetToken!,
          newPassword: "AnotherPass!7890"
        })
      ).rejects.toThrow(/token/i);
    } finally {
      await cleanupUserByEmail(email);
    }
  });

  it("sends a password reset code by SMS and resets a doctor password with that code", async () => {
    const email = uniqueEmail("doctor-reset-sms");

    try {
      await createDoctorAccount({
        email,
        password: "Str0ngPass!123",
        firstName: "Rosa",
        lastName: "Lara",
        phone: "+526141234567",
        professionalName: "Dra. Rosa Lara",
        licenseNumber: "1234567",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      const requestResult = await requestPasswordReset({
        email,
        channel: "SMS",
        requestIp: "127.0.0.1",
        requestUserAgent: "vitest"
      });

      expect(requestResult.message).toMatch(/si existe/i);
      expect(requestResult.resetCode).toMatch(/^\d{6}$/);

      const queuedSms = await prisma.notification.findFirst({
        where: {
          destination: "+526141234567",
          channel: "SMS",
          kind: "PASSWORD_RESET"
        },
        orderBy: { createdAt: "desc" }
      });

      expect(queuedSms?.body).toContain(requestResult.resetCode);
      expect(queuedSms?.body).not.toContain("/recuperar?token=");

      await resetPasswordWithCode({
        email,
        code: requestResult.resetCode!,
        newPassword: "SmsPass!45678"
      });

      const login = await signInDoctor({ email, password: "SmsPass!45678" });
      if (login.requiresTwoFactor) {
        throw new Error("no se esperaba 2FA");
      }
      expect(login.user.email).toBe(email);

      await expect(
        resetPasswordWithCode({
          email,
          code: requestResult.resetCode!,
          newPassword: "SmsPass!99999"
        })
      ).rejects.toThrow(/codigo/i);
    } finally {
      await cleanupUserByEmail(email);
    }
  });

  it("sends a password reset code by email and resets a patient password with that code", async () => {
    const email = uniqueEmail("patient-reset-email");

    try {
      await registerPatientAccount({
        email,
        password: "P@cienteFuerte2026",
        firstName: "Hugo",
        lastName: "Paz",
        phone: "+526140000001",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      const requestResult = await requestPasswordReset({
        email,
        channel: "EMAIL",
        requestIp: "127.0.0.1",
        requestUserAgent: "vitest"
      });

      expect(requestResult.resetCode).toMatch(/^\d{6}$/);

      const queuedEmail = await prisma.notification.findFirst({
        where: {
          destination: email,
          channel: "EMAIL",
          kind: "PASSWORD_RESET"
        },
        orderBy: { createdAt: "desc" }
      });

      expect(queuedEmail?.body).toContain(requestResult.resetCode);
      expect(queuedEmail?.body).not.toContain("/recuperar?token=");

      await resetPasswordWithCode({
        email,
        code: requestResult.resetCode!,
        newPassword: "Paciente!2027"
      });

      const login = await signInPatient({ email, password: "Paciente!2027" });
      expect(login.user.email).toBe(email);
    } finally {
      await cleanupUserByEmail(email);
    }
  });

  it("does not reveal whether SMS recovery failed because the account has no phone", async () => {
    const email = uniqueEmail("doctor-reset-no-phone");

    try {
      await createDoctorAccount({
        email,
        password: "Str0ngPass!123",
        firstName: "Nadia",
        lastName: "Sol",
        professionalName: "Dra. Nadia Sol",
        licenseNumber: "1234567",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      const requestResult = await requestPasswordReset({
        email,
        channel: "SMS",
        requestIp: "127.0.0.1",
        requestUserAgent: "vitest"
      });

      const queuedSms = await prisma.notification.findFirst({
        where: {
          channel: "SMS",
          kind: "PASSWORD_RESET",
          metadata: {
            path: ["email"],
            equals: email
          }
        },
        orderBy: { createdAt: "desc" }
      });

      expect(requestResult.message).toMatch(/si existe/i);
      expect(requestResult.resetCode).toBeUndefined();
      expect(queuedSms).toBeNull();
    } finally {
      await cleanupUserByEmail(email);
    }
  });
});
