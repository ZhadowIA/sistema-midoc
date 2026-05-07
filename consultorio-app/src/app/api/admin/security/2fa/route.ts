import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireStaffApiAccess } from "@/lib/medicalApi";
import { jsonNoStore } from "@/lib/http";
import { AuditLogService } from "@/services/AuditLogService";
import {
  buildTotpUri,
  consumeRecoveryCode,
  decryptTwoFactorSecret,
  encryptTwoFactorSecret,
  generateRecoveryCodes,
  generateTwoFactorSecret,
  hashRecoveryCodes,
  roleSupportsTwoFactor,
  verifyTotpCode,
} from "@/lib/twoFactor";
import { getRequestIp, getUserAgent } from "@/lib/requestContext";
import {
  disableTwoFactor,
  enableTwoFactorFromPending,
  getTwoFactorCredential,
  upsertPendingTwoFactorSecret,
  updateRecoveryCodes,
} from "@/server/security/twoFactorCredentialStore";

export async function GET() {
  const access = await requireStaffApiAccess({
    allowedRoles: ["ADMIN", "CLINIC_ADMIN"],
    roleForbiddenMessage: "Solo ADMIN y CLINIC_ADMIN pueden gestionar 2FA.",
  });
  if (access.response) return access.response;

  const credential = await getTwoFactorCredential(access.user.id);

  return jsonNoStore({
    required: roleSupportsTwoFactor(access.user.role),
    enabled: credential?.enabled === true,
    pending: Boolean(credential?.pendingGeneratedAt),
    recoveryCodesCount: Array.isArray(credential?.recoveryCodes) ? credential.recoveryCodes.length : 0,
    userEmail: undefined,
  });
}

export async function POST(request: Request) {
  const access = await requireStaffApiAccess({
    allowedRoles: ["ADMIN", "CLINIC_ADMIN"],
    roleForbiddenMessage: "Solo ADMIN y CLINIC_ADMIN pueden activar 2FA.",
  });
  if (access.response) return access.response;

  const user = await prisma.user.findUnique({
    where: { id: access.user.id },
    select: { email: true, role: true },
  });
  if (!user) return jsonNoStore({ error: "Usuario no encontrado" }, { status: 404 });

  const secret = generateTwoFactorSecret();
  const encrypted = encryptTwoFactorSecret(secret);
  const otpauthUri = buildTotpUri({ secret, accountName: user.email });

  await upsertPendingTwoFactorSecret(access.user.id, encrypted);

  await AuditLogService.safeLog({
    actorUserId: access.user.id,
    doctorId: access.user.id,
    action: "security.2fa.setup_started",
    ipAddress: getRequestIp(request),
    userAgent: getUserAgent(request),
    metadata: { role: user.role },
  });

  return jsonNoStore({
    manualEntryKey: secret,
    otpauthUri,
  });
}

export async function PUT(request: Request) {
  const access = await requireStaffApiAccess({
    allowedRoles: ["ADMIN", "CLINIC_ADMIN"],
    roleForbiddenMessage: "Solo ADMIN y CLINIC_ADMIN pueden activar 2FA.",
  });
  if (access.response) return access.response;

  const body = (await request.json()) as { code?: string };
  const code = typeof body.code === "string" ? body.code : "";

  const credential = await getTwoFactorCredential(access.user.id);
  if (!credential?.pendingSecretEncrypted) {
    return jsonNoStore({ error: "No hay una configuración pendiente para activar." }, { status: 400 });
  }

  const secret = decryptTwoFactorSecret(credential.pendingSecretEncrypted);
  if (!verifyTotpCode(secret, code)) {
    await AuditLogService.safeLog({
      actorUserId: access.user.id,
      doctorId: access.user.id,
      action: "security.2fa.enable_failed",
      ipAddress: getRequestIp(request),
      userAgent: getUserAgent(request),
    });
    return jsonNoStore({ error: "Código inválido" }, { status: 400 });
  }

  const recoveryCodes = generateRecoveryCodes();
  await enableTwoFactorFromPending(access.user.id, credential.pendingSecretEncrypted);
  await updateRecoveryCodes(access.user.id, hashRecoveryCodes(recoveryCodes));

  await AuditLogService.safeLog({
    actorUserId: access.user.id,
    doctorId: access.user.id,
    action: "security.2fa.enabled",
    ipAddress: getRequestIp(request),
    userAgent: getUserAgent(request),
  });

  return jsonNoStore({ success: true, recoveryCodes });
}

export async function DELETE(request: Request) {
  const access = await requireStaffApiAccess({
    allowedRoles: ["ADMIN", "CLINIC_ADMIN"],
    roleForbiddenMessage: "Solo ADMIN y CLINIC_ADMIN pueden desactivar 2FA.",
  });
  if (access.response) return access.response;

  const body = (await request.json()) as { code?: string };
  const code = typeof body.code === "string" ? body.code : "";

  const credential = await getTwoFactorCredential(access.user.id);
  if (!credential?.enabled || !credential.secretEncrypted) {
    return jsonNoStore({ error: "2FA no está activo en esta cuenta." }, { status: 400 });
  }

  const secret = decryptTwoFactorSecret(credential.secretEncrypted);
  const recoveryHashes = Array.isArray(credential.recoveryCodes)
    ? credential.recoveryCodes.filter((value): value is string => typeof value === "string")
    : [];
  const recoveryAttempt = consumeRecoveryCode(code, recoveryHashes);
  const validTotp = verifyTotpCode(secret, code);

  if (!validTotp && !recoveryAttempt.matched) {
    await AuditLogService.safeLog({
      actorUserId: access.user.id,
      doctorId: access.user.id,
      action: "security.2fa.disable_failed",
      ipAddress: getRequestIp(request),
      userAgent: getUserAgent(request),
    });
    return jsonNoStore({ error: "Código inválido" }, { status: 400 });
  }

  await disableTwoFactor(access.user.id);
  if (recoveryAttempt.matched) {
    await AuditLogService.safeLog({
      actorUserId: access.user.id,
      doctorId: access.user.id,
      action: "security.2fa.disable_recovery_code_used",
      ipAddress: getRequestIp(request),
      userAgent: getUserAgent(request),
    });
  }

  await AuditLogService.safeLog({
    actorUserId: access.user.id,
    doctorId: access.user.id,
    action: "security.2fa.disabled",
    ipAddress: getRequestIp(request),
    userAgent: getUserAgent(request),
  });

  return jsonNoStore({ success: true });
}
