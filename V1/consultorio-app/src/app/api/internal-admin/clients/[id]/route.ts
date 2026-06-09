import { NextRequest } from "next/server";
import { z } from "zod";
import { requireStaffApiAccess } from "@/lib/medicalApi";
import { jsonNoStore } from "@/lib/http";
import { captureError, withEndpointObservability } from "@/lib/observability";
import { getRequestIp, getUserAgent } from "@/lib/requestContext";
import { updateCommercialClient, getCommercialClientDetail } from "@/server/internal-admin/commercial";

const patchSchema = z.object({
  basePlan: z.enum(["AGENDA", "CLINICAL", "INTEGRAL"]),
  addOn: z.enum(["AI_30", "AI_60", "AI_100"]).nullable(),
  active: z.boolean().optional(),
  aiOverrides: z.object({
    "ai.dictation": z.boolean().optional(),
    "ai.insights": z.boolean().optional(),
    "ai.questionnaire.text": z.boolean().optional(),
    "ai.questionnaire.audio": z.boolean().optional(),
  }).optional(),
});

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return withEndpointObservability(
    {
      endpoint: "api.internal-admin.clients.detail",
      method: "GET",
    },
    async () => {
      try {
        const access = await requireStaffApiAccess({
          allowedRoles: ["ADMIN"],
          roleForbiddenMessage: "Solo ADMIN puede acceder al panel interno de clientes.",
        });
        if (access.response) return access.response;

        const { id } = await context.params;
        const detail = await getCommercialClientDetail(id);
        if (!detail) {
          return jsonNoStore({ error: "Cliente no encontrado" }, { status: 404 });
        }

        return jsonNoStore(detail);
      } catch (error: unknown) {
        captureError("internal_admin.clients.detail.error", error);
        const message = error instanceof Error ? error.message : "Error interno";
        return jsonNoStore({ error: message }, { status: 500 });
      }
    },
  );
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  return withEndpointObservability(
    {
      endpoint: "api.internal-admin.clients.update",
      method: "PATCH",
    },
    async () => {
      try {
        const access = await requireStaffApiAccess({
          allowedRoles: ["ADMIN"],
          roleForbiddenMessage: "Solo ADMIN puede administrar clientes desde este panel.",
        });
        if (access.response) return access.response;

        const { id } = await context.params;
        const body = await request.json();
        const parsed = patchSchema.safeParse(body);
        if (!parsed.success) {
          return jsonNoStore(
            { error: "Payload inválido", details: parsed.error.issues },
            { status: 400 },
          );
        }

        const result = await updateCommercialClient({
          actorUserId: access.user.id,
          doctorId: id,
          ipAddress: getRequestIp(request),
          userAgent: getUserAgent(request),
          ...parsed.data,
        });

        if (!result) {
          return jsonNoStore({ error: "Cliente no encontrado" }, { status: 404 });
        }

        return jsonNoStore(result);
      } catch (error: unknown) {
        captureError("internal_admin.clients.update.error", error);
        const message = error instanceof Error ? error.message : "Error interno";
        return jsonNoStore({ error: message }, { status: 500 });
      }
    },
  );
}
