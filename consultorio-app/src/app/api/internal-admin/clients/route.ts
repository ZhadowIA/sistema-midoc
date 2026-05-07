import { requireStaffApiAccess } from "@/lib/medicalApi";
import { jsonNoStore } from "@/lib/http";
import { captureError, withEndpointObservability } from "@/lib/observability";
import { listCommercialClients } from "@/server/internal-admin/commercial";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  return withEndpointObservability(
    {
      endpoint: "api.internal-admin.clients.list",
      method: "GET",
    },
    async () => {
      try {
        const access = await requireStaffApiAccess({
          allowedRoles: ["ADMIN"],
          roleForbiddenMessage: "Solo ADMIN puede acceder al panel interno de clientes.",
        });
        if (access.response) return access.response;

        const q = request.nextUrl.searchParams;
        const payload = await listCommercialClients({
          search: q.get("search") ?? undefined,
          plan: (q.get("plan") as any) ?? undefined,
          status: (q.get("status") as any) ?? undefined,
          ai: (q.get("ai") as any) ?? undefined,
          active: (q.get("active") as any) ?? undefined,
          risk: (q.get("risk") as any) ?? undefined,
          page: q.get("page") ? Number(q.get("page")) : undefined,
          pageSize: q.get("pageSize") ? Number(q.get("pageSize")) : undefined,
        });
        return jsonNoStore(payload);
      } catch (error: unknown) {
        captureError("internal_admin.clients.list.error", error);
        const message = error instanceof Error ? error.message : "Error interno";
        return jsonNoStore({ error: message }, { status: 500 });
      }
    },
  );
}
