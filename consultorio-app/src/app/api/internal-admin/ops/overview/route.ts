import { requireStaffApiAccess } from "@/lib/medicalApi";
import { jsonNoStore } from "@/lib/http";
import { captureError, withEndpointObservability } from "@/lib/observability";
import { getOpsOverview } from "@/server/internal-admin/opsOverview";

export async function GET() {
  return withEndpointObservability(
    {
      endpoint: "api.internal-admin.ops.overview",
      method: "GET",
    },
    async () => {
      try {
        const access = await requireStaffApiAccess({
          allowedRoles: ["ADMIN"],
          roleForbiddenMessage: "Solo ADMIN puede acceder al panel interno de operación.",
        });
        if (access.response) return access.response;

        const payload = await getOpsOverview();
        return jsonNoStore(payload);
      } catch (error: unknown) {
        captureError("internal_admin.ops.overview.error", error);
        const message = error instanceof Error ? error.message : "Error interno";
        return jsonNoStore({ error: message }, { status: 500 });
      }
    },
  );
}
