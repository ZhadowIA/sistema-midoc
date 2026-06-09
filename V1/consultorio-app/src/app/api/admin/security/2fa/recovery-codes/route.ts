import { requireStaffApiAccess } from "@/lib/medicalApi";
import { jsonNoStore } from "@/lib/http";
import { AuditLogService } from "@/services/AuditLogService";
import { getRequestIp, getUserAgent } from "@/lib/requestContext";
import { generateRecoveryCodes, hashRecoveryCodes } from "@/lib/twoFactor";
import { getTwoFactorCredential, updateRecoveryCodes } from "@/server/security/twoFactorCredentialStore";

export async function POST(request: Request) {
  const access = await requireStaffApiAccess({
    allowedRoles: ["ADMIN", "CLINIC_ADMIN"],
    roleForbiddenMessage: "Solo ADMIN y CLINIC_ADMIN pueden rotar recovery codes.",
  });
  if (access.response) return access.response;

  const credential = await getTwoFactorCredential(access.user.id);
  if (!credential?.enabled) {
    return jsonNoStore({ error: "Debes tener 2FA activo antes de regenerar recovery codes." }, { status: 400 });
  }

  const recoveryCodes = generateRecoveryCodes();
  await updateRecoveryCodes(access.user.id, hashRecoveryCodes(recoveryCodes));

  await AuditLogService.safeLog({
    actorUserId: access.user.id,
    doctorId: access.user.id,
    action: "security.2fa.recovery_codes_rotated",
    ipAddress: getRequestIp(request),
    userAgent: getUserAgent(request),
  });

  return jsonNoStore({ recoveryCodes });
}
