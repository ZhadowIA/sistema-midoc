import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { UserRole } from "@prisma/client";

import { writeAuditLog } from "../../lib/audit";
import { env } from "../../lib/env";
import { ServiceError } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { decryptSecret, encryptSecret } from "../../lib/security/secret-box";
import { hashOpaqueToken } from "../../lib/security/token";
import { generateTotpSecret, otpauthUri, verifyTotp } from "../../lib/security/totp";

export class TwoFactorServiceError extends ServiceError {}

const ISSUER = "MiDoc";
const RECOVERY_CODE_COUNT = 10;
const CHALLENGE_TTL_MS = 1000 * 60 * 5;

async function requireDoctor(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== UserRole.DOCTOR) {
    throw new TwoFactorServiceError("Cuenta de medico no encontrada.", 404);
  }
  return user;
}

/** Codigo de recuperacion legible: 5+5 caracteres hex en mayuscula. */
function generateRecoveryCode(): string {
  const raw = randomBytes(5).toString("hex").toUpperCase();
  return `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
}

function normalizeRecoveryCode(code: string): string {
  return code.replace(/\s|-/g, "").toUpperCase();
}

export async function isTwoFactorEnabled(userId: string): Promise<boolean> {
  const credential = await prisma.twoFactorCredential.findUnique({ where: { userId } });
  return Boolean(credential?.enabled);
}

/**
 * Inicia el enrolamiento: genera (o reemplaza) un secreto TOTP cifrado en estado
 * pendiente y devuelve el secreto + URI otpauth para mostrar como QR una sola vez.
 */
export async function beginTwoFactorEnrollment(userId: string) {
  const user = await requireDoctor(userId);
  const secret = generateTotpSecret();
  const encryptedSecret = encryptSecret(secret);

  await prisma.twoFactorCredential.upsert({
    where: { userId },
    update: { encryptedSecret, enabled: false, confirmedAt: null },
    create: { userId, encryptedSecret, enabled: false }
  });

  // Un enrolamiento nuevo invalida codigos de recuperacion previos.
  await prisma.twoFactorRecoveryCode.deleteMany({
    where: { credential: { userId } }
  });

  await writeAuditLog({
    actorUserId: userId,
    entityType: "TwoFactorCredential",
    entityId: userId,
    action: "doctor.2fa.enrollment_started",
    source: "two-factor-service"
  });

  return {
    secret,
    otpauthUri: otpauthUri(secret, user.email, ISSUER)
  };
}

async function issueRecoveryCodes(credentialId: string): Promise<string[]> {
  await prisma.twoFactorRecoveryCode.deleteMany({ where: { credentialId } });

  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
  await prisma.twoFactorRecoveryCode.createMany({
    data: codes.map((code) => ({
      credentialId,
      codeHash: hashOpaqueToken(normalizeRecoveryCode(code))
    }))
  });

  return codes;
}

/**
 * Confirma el enrolamiento verificando un codigo TOTP del autenticador. Activa el
 * 2FA y devuelve los codigos de recuperacion en claro una sola vez.
 */
export async function confirmTwoFactorEnrollment(userId: string, code: string) {
  const credential = await prisma.twoFactorCredential.findUnique({ where: { userId } });
  if (!credential) {
    throw new TwoFactorServiceError("No hay un enrolamiento de 2FA pendiente.", 409);
  }

  const secret = decryptSecret(credential.encryptedSecret);
  if (!verifyTotp(secret, code)) {
    throw new TwoFactorServiceError("Codigo invalido.", 401);
  }

  await prisma.twoFactorCredential.update({
    where: { userId },
    data: { enabled: true, confirmedAt: new Date() }
  });

  const recoveryCodes = await issueRecoveryCodes(credential.id);

  await writeAuditLog({
    actorUserId: userId,
    entityType: "TwoFactorCredential",
    entityId: userId,
    action: "doctor.2fa.enabled",
    source: "two-factor-service"
  });

  return { recoveryCodes };
}

/**
 * Verifica un segundo factor: acepta un codigo TOTP vigente o un codigo de
 * recuperacion sin usar (que se consume). Devuelve si fue valido.
 */
export async function verifyTwoFactorCode(userId: string, code: string): Promise<boolean> {
  const credential = await prisma.twoFactorCredential.findUnique({ where: { userId } });
  if (!credential || !credential.enabled) {
    throw new TwoFactorServiceError("El 2FA no esta activo.", 409);
  }

  const secret = decryptSecret(credential.encryptedSecret);
  if (verifyTotp(secret, code)) {
    return true;
  }

  // Intentar como codigo de recuperacion (un solo uso).
  const codeHash = hashOpaqueToken(normalizeRecoveryCode(code));
  const recovery = await prisma.twoFactorRecoveryCode.findUnique({ where: { codeHash } });

  if (!recovery || recovery.credentialId !== credential.id || recovery.usedAt) {
    return false;
  }

  await prisma.twoFactorRecoveryCode.update({
    where: { id: recovery.id },
    data: { usedAt: new Date() }
  });

  await writeAuditLog({
    actorUserId: userId,
    entityType: "TwoFactorRecoveryCode",
    entityId: recovery.id,
    action: "doctor.2fa.recovery_code_used",
    source: "two-factor-service"
  });

  return true;
}

/** Desactiva el 2FA tras verificar un codigo (TOTP o recuperacion). */
export async function disableTwoFactor(userId: string, code: string) {
  const valid = await verifyTwoFactorCode(userId, code);
  if (!valid) {
    throw new TwoFactorServiceError("Codigo invalido.", 401);
  }

  await prisma.twoFactorCredential.delete({ where: { userId } });

  await writeAuditLog({
    actorUserId: userId,
    entityType: "TwoFactorCredential",
    entityId: userId,
    action: "doctor.2fa.disabled",
    source: "two-factor-service"
  });
}

/** Regenera los codigos de recuperacion tras verificar un codigo vigente. */
export async function regenerateRecoveryCodes(userId: string, code: string) {
  const valid = await verifyTwoFactorCode(userId, code);
  if (!valid) {
    throw new TwoFactorServiceError("Codigo invalido.", 401);
  }

  const credential = await prisma.twoFactorCredential.findUnique({ where: { userId } });
  if (!credential) {
    throw new TwoFactorServiceError("El 2FA no esta activo.", 409);
  }

  const recoveryCodes = await issueRecoveryCodes(credential.id);

  await writeAuditLog({
    actorUserId: userId,
    entityType: "TwoFactorCredential",
    entityId: userId,
    action: "doctor.2fa.recovery_codes_regenerated",
    source: "two-factor-service"
  });

  return { recoveryCodes };
}

// --- Desafio de login 2FA (stateless, firmado, corto plazo) ---

function signChallenge(userId: string, expiresAt: number): string {
  return createHmac("sha256", env.NEXTAUTH_SECRET)
    .update(`2fa:${userId}:${expiresAt}`)
    .digest("hex");
}

/** Emite un token de desafio que autoriza intentar el 2FA durante 5 minutos. */
export function issueTwoFactorChallenge(userId: string): string {
  const expiresAt = Date.now() + CHALLENGE_TTL_MS;
  const signature = signChallenge(userId, expiresAt);
  return `${userId}.${expiresAt}.${signature}`;
}

/** Valida un token de desafio y devuelve el userId, o lanza si es invalido/expirado. */
export function consumeTwoFactorChallenge(token: string): string {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new TwoFactorServiceError("Desafio de 2FA invalido.", 401);
  }

  const [userId, expiresRaw, signature] = parts;
  const expiresAt = Number(expiresRaw);

  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    throw new TwoFactorServiceError("Desafio de 2FA expirado.", 401);
  }

  const expected = signChallenge(userId, expiresAt);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);

  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new TwoFactorServiceError("Desafio de 2FA invalido.", 401);
  }

  return userId;
}
