import { requireStaffApiAccess } from "@/lib/medicalApi";
import { jsonNoStore } from "@/lib/http";
import { captureError, withEndpointObservability } from "@/lib/observability";
import { listCommercialClients, type ListCommercialClientsInput } from "@/server/internal-admin/commercial";
import { NextRequest } from "next/server";

const PLAN_FILTERS = ["ALL", "AGENDA", "CLINICAL", "INTEGRAL"] as const;
const STATUS_FILTERS = ["ALL", "ACTIVE", "PAST_DUE", "PENDING", "CANCELED", "NO_SUBSCRIPTION"] as const;
const AI_FILTERS = ["ALL", "WITH_AI", "WITHOUT_AI"] as const;
const ACTIVE_FILTERS = ["ALL", "ACTIVE", "INACTIVE"] as const;
const RISK_FILTERS = ["ALL", "LOW", "MEDIUM", "HIGH"] as const;

function readEnumParam<T extends readonly string[]>(value: string | null, allowed: T): T[number] | undefined {
  return value && allowed.includes(value) ? value : undefined;
}

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
        const filters: ListCommercialClientsInput = {
          search: q.get("search") ?? undefined,
          plan: readEnumParam(q.get("plan"), PLAN_FILTERS),
          status: readEnumParam(q.get("status"), STATUS_FILTERS),
          ai: readEnumParam(q.get("ai"), AI_FILTERS),
          active: readEnumParam(q.get("active"), ACTIVE_FILTERS),
          risk: readEnumParam(q.get("risk"), RISK_FILTERS),
          page: q.get("page") ? Number(q.get("page")) : undefined,
          pageSize: q.get("pageSize") ? Number(q.get("pageSize")) : undefined,
        };
        const payload = await listCommercialClients(filters);
        return jsonNoStore(payload);
      } catch (error: unknown) {
        captureError("internal_admin.clients.list.error", error);
        const message = error instanceof Error ? error.message : "Error interno";
        return jsonNoStore({ error: message }, { status: 500 });
      }
    },
  );
}
