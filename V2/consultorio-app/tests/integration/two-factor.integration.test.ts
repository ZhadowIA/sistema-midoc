import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "@prisma/client";

import {
  completeTwoFactorLogin,
  createDoctorAccount,
  signInDoctor,
  validateAuthSession
} from "../../src/services/auth/auth-service";
import {
  beginTwoFactorEnrollment,
  confirmTwoFactorEnrollment,
  disableTwoFactor,
  isTwoFactorEnabled
} from "../../src/services/auth/two-factor-service";
import { totp } from "../../src/lib/security/totp";

const prisma = new PrismaClient();
const PASSWORD = "Str0ngPass!123";

function uniqueEmail(label: string) {
  return `${label}-${randomUUID()}@example.com`;
}

async function cleanupUserByEmail(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return;
  }
  await prisma.authSession.deleteMany({ where: { userId: user.id } });
  await prisma.user.delete({ where: { id: user.id } });
}

async function registerDoctor(label: string) {
  const email = uniqueEmail(label);
  const account = await createDoctorAccount({
    email,
    password: PASSWORD,
    firstName: "Iris",
    lastName: "Mena",
    professionalName: "Dra. Iris Mena",
    licenseNumber: "1234567",
    specialty: "GENERAL_MEDICINE",
    termsVersion: "2026-05",
    privacyVersion: "2026-05"
  });
  return { email, userId: account.user.id };
}

const createdEmails: string[] = [];

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  for (const email of createdEmails) {
    await cleanupUserByEmail(email);
  }
  await prisma.$disconnect();
});

describe("two-factor authentication (paso 12, rebanada 2)", () => {
  it("enrolls, confirms, and requires the second factor at login", async () => {
    const { email, userId } = await registerDoctor("2fa-flow");
    createdEmails.push(email);

    // Sin 2FA: login crea sesion directo.
    const plain = await signInDoctor({ email, password: PASSWORD });
    expect(plain.requiresTwoFactor).toBe(false);

    // Enrolar y confirmar con un codigo TOTP valido.
    const { secret } = await beginTwoFactorEnrollment(userId);
    expect(await isTwoFactorEnabled(userId)).toBe(false);

    const confirm = await confirmTwoFactorEnrollment(userId, totp(secret));
    expect(confirm.recoveryCodes).toHaveLength(10);
    expect(await isTwoFactorEnabled(userId)).toBe(true);

    // Ahora el login con password NO crea sesion: pide segundo factor.
    const challenged = await signInDoctor({ email, password: PASSWORD });
    if (!challenged.requiresTwoFactor) {
      throw new Error("se esperaba requiresTwoFactor");
    }

    // Completar con un codigo TOTP valido crea la sesion.
    const completed = await completeTwoFactorLogin({
      twoFactorToken: challenged.twoFactorToken,
      code: totp(secret)
    });
    expect(await validateAuthSession(completed.sessionToken)).not.toBeNull();
  });

  it("rejects a wrong code and an expired/tampered challenge", async () => {
    const { email, userId } = await registerDoctor("2fa-reject");
    createdEmails.push(email);

    const { secret } = await beginTwoFactorEnrollment(userId);
    await confirmTwoFactorEnrollment(userId, totp(secret));

    const challenged = await signInDoctor({ email, password: PASSWORD });
    if (!challenged.requiresTwoFactor) {
      throw new Error("se esperaba requiresTwoFactor");
    }

    await expect(
      completeTwoFactorLogin({ twoFactorToken: challenged.twoFactorToken, code: "000000" })
    ).rejects.toMatchObject({ status: 401 });

    await expect(
      completeTwoFactorLogin({ twoFactorToken: "garbage.0.deadbeef", code: totp(secret) })
    ).rejects.toMatchObject({ status: 401 });
  });

  it("accepts a recovery code once and rejects its reuse", async () => {
    const { email, userId } = await registerDoctor("2fa-recovery");
    createdEmails.push(email);

    const { secret } = await beginTwoFactorEnrollment(userId);
    const { recoveryCodes } = await confirmTwoFactorEnrollment(userId, totp(secret));
    const recoveryCode = recoveryCodes[0]!;

    const first = await signInDoctor({ email, password: PASSWORD });
    if (!first.requiresTwoFactor) {
      throw new Error("se esperaba requiresTwoFactor");
    }
    const ok = await completeTwoFactorLogin({
      twoFactorToken: first.twoFactorToken,
      code: recoveryCode
    });
    expect(ok.sessionToken).toBeTruthy();

    const second = await signInDoctor({ email, password: PASSWORD });
    if (!second.requiresTwoFactor) {
      throw new Error("se esperaba requiresTwoFactor");
    }
    await expect(
      completeTwoFactorLogin({ twoFactorToken: second.twoFactorToken, code: recoveryCode })
    ).rejects.toMatchObject({ status: 401 });
  });

  it("disables 2FA and returns to direct login", async () => {
    const { email, userId } = await registerDoctor("2fa-disable");
    createdEmails.push(email);

    const { secret } = await beginTwoFactorEnrollment(userId);
    await confirmTwoFactorEnrollment(userId, totp(secret));
    expect(await isTwoFactorEnabled(userId)).toBe(true);

    await disableTwoFactor(userId, totp(secret));
    expect(await isTwoFactorEnabled(userId)).toBe(false);

    const plain = await signInDoctor({ email, password: PASSWORD });
    expect(plain.requiresTwoFactor).toBe(false);
  });
});
