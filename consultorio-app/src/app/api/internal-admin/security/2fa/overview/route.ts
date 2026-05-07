import { requireStaffApiAccess } from "@/lib/medicalApi";
import { jsonNoStore } from "@/lib/http";
import { captureError } from "@/lib/observability";
import { getTwoFactorOverview } from "@/server/internal-admin/twoFactorOverview";

export async function GET() {
  try {
    const access = await requireStaffApiAccess({
      allowedRoles: ["ADMIN"],
      roleForbiddenMessage: "Solo ADMIN puede consultar overview de seguridad 2FA.",
    });
    if (access.response) return access.response;

    const payload = await getTwoFactorOverview();
    return jsonNoStore(payload);
  } catch (error: unknown) {
    captureError("internal_admin.security.2fa_overview.error", error);
    const message = error instanceof Error ? error.message : "Error interno";
    return jsonNoStore({ error: message }, { status: 500 });
  }
}
