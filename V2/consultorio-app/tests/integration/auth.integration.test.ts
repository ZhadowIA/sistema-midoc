import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "@prisma/client";

import {
  createDoctorAccount,
  requestPasswordReset,
  resetPassword,
  revokeAuthSession,
  signInDoctor,
  validateAuthSession
} from "../../src/services/auth/auth-service";

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
        phone: "6140000000",
        professionalName: "Dra. Ana Ramirez",
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      const storedUser = await prisma.user.findUnique({
        where: { id: account.user.id },
        include: {
          doctorProfile: true,
          legalAcceptances: true
        }
      });

      expect(storedUser?.email).toBe(email);
      expect(storedUser?.doctorProfile?.professionalName).toBe("Dra. Ana Ramirez");
      expect(storedUser?.legalAcceptances).toHaveLength(2);
    } finally {
      await cleanupUserByEmail(email);
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
        specialty: "GENERAL_MEDICINE",
        termsVersion: "2026-05",
        privacyVersion: "2026-05"
      });

      const login = await signInDoctor({
        email,
        password: "Str0ngPass!123"
      });

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

      await resetPassword({
        token: requestResult.resetToken!,
        newPassword: "N3wPass!4567"
      });

      const secondLogin = await signInDoctor({
        email,
        password: "N3wPass!4567"
      });

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
});
