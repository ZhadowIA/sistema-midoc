import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { attachSessionCookie, buildSessionToken } from "@/lib/session";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/rateLimit";
import { captureError, logEvent } from "@/lib/observability";
import { buildMedicalSessionClaims } from "@/server/auth/medicalSession";
import {
  consumeRecoveryCode,
  decryptTwoFactorSecret,
  roleSupportsTwoFactor,
  verifyTotpCode,
  verifyTwoFactorChallengeToken,
} from "@/lib/twoFactor";
import { AuditLogService } from "@/services/AuditLogService";
import { getRequestIp, getUserAgent } from "@/lib/requestContext";
import { getTwoFactorCredential, updateRecoveryCodes } from "@/server/security/twoFactorCredentialStore";

const TWO_FACTOR_LOGIN_RATE_LIMIT = { key: "auth:login:2fa", limit: 8, windowMs: 10 * 60 * 1000 };

export async function POST(request: Request) {
  try {
    const limit = await checkRateLimit(request, TWO_FACTOR_LOGIN_RATE_LIMIT);
    if (!limit.ok) return rateLimitExceededResponse(limit);

    const body = (await request.json()) as { challengeToken?: string; code?: string };
    const challengeToken = typeof body.challengeToken === "string" ? body.challengeToken : "";
    const code = typeof body.code === "string" ? body.code : "";
    if (!challengeToken || !code) {
      return NextResponse.json({ error: "Challenge y código son obligatorios." }, { status: 400 });
    }

    const challenge = await verifyTwoFactorChallengeToken(challengeToken);
    if (!roleSupportsTwoFactor(challenge.role)) {
      return NextResponse.json({ error: "La cuenta no requiere 2FA." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: challenge.userId },
      select: { id: true, name: true, email: true, role: true, active: true, bossId: true },
    });
    if (!user || !user.active) {
      return NextResponse.json({ error: "Cuenta no disponible." }, { status: 401 });
    }

    const credential = await getTwoFactorCredential(user.id);
    if (!credential?.enabled || !credential.secretEncrypted) {
      return NextResponse.json({ error: "2FA no está habilitado en esta cuenta." }, { status: 400 });
    }

    const secret = decryptTwoFactorSecret(credential.secretEncrypted);
    const recoveryHashes = Array.isArray(credential.recoveryCodes)
      ? credential.recoveryCodes.filter((value): value is string => typeof value === "string")
      : [];
    const recoveryAttempt = consumeRecoveryCode(code, recoveryHashes);
    const validTotp = verifyTotpCode(secret, code);

    if (!validTotp && !recoveryAttempt.matched) {
      await AuditLogService.safeLog({
        actorUserId: user.id,
        doctorId: user.id,
        action: "auth.login.2fa_failed",
        ipAddress: getRequestIp(request),
        userAgent: getUserAgent(request),
      });
      return NextResponse.json({ error: "Código inválido." }, { status: 401 });
    }

    if (recoveryAttempt.matched) {
      await updateRecoveryCodes(user.id, recoveryAttempt.remaining);
      await AuditLogService.safeLog({
        actorUserId: user.id,
        doctorId: user.id,
        action: "auth.login.2fa_recovery_code_used",
        ipAddress: getRequestIp(request),
        userAgent: getUserAgent(request),
        metadata: {
          remainingRecoveryCodes: recoveryAttempt.remaining.length,
        },
      });
    }

    const claims = await buildMedicalSessionClaims(user, {
      twoFactorVerified: true,
      twoFactorSetupRequired: false,
    });
    const token = await buildSessionToken(claims);
    const response = NextResponse.json({
      success: true,
      nextStep: claims.hasActiveSubscription === false ? "SUBSCRIPTION" : claims.onboardingCompleted === false ? "ONBOARDING" : "DASHBOARD",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
    attachSessionCookie(response, token);

    await AuditLogService.safeLog({
      actorUserId: user.id,
      doctorId: user.id,
      action: "auth.login.2fa_verified",
      ipAddress: getRequestIp(request),
      userAgent: getUserAgent(request),
    });
    logEvent("info", "auth.login.2fa_success", { userId: user.id, role: user.role });

    return response;
  } catch (error: unknown) {
    captureError("auth.login.2fa.error", error);
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
