import { NextResponse } from "next/server";
import { z } from "zod";

import { toErrorResponse } from "../../../../../../lib/api-error";
import { requireAdminUser } from "../../../../../../lib/auth/session-user";
import { updateDoctorAiAccess } from "../../../../../../services/platform-admin/platform-admin-service";

// Frontera HTTP del control de admin para habilitar IA y asignar creditos por
// medico (override sobre las capacidades del plan). Solo un admin autenticado.
const aiAccessSchema = z.object({
  aiEnabled: z.boolean(),
  // Override de creditos mensuales: entero >= 0, o null para heredar el plan.
  aiCreditsMonthly: z.number().int().min(0).max(1_000_000).nullable().optional()
});

export async function PATCH(request: Request, context: { params: Promise<{ doctorId: string }> }) {
  try {
    const user = await requireAdminUser(request);
    const { doctorId } = await context.params;
    const payload = aiAccessSchema.parse(await request.json());
    const summary = await updateDoctorAiAccess(user.id, doctorId, payload);
    return NextResponse.json({ summary });
  } catch (error) {
    return toErrorResponse(error, "No se pudo actualizar el acceso a la IA.");
  }
}
