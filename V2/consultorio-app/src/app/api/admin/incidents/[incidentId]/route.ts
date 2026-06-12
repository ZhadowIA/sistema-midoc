import { IncidentStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { toErrorResponse } from "../../../../../lib/api-error";
import { requireDoctorUser } from "../../../../../lib/auth/session-user";
import { updateIncidentStatus } from "../../../../../services/compliance/compliance-service";

const updateSchema = z.object({
  status: z.nativeEnum(IncidentStatus)
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ incidentId: string }> }
) {
  try {
    const user = await requireDoctorUser(request);
    const payload = updateSchema.parse(await request.json());
    const { incidentId } = await context.params;
    const incident = await updateIncidentStatus(user.id, incidentId, payload.status);
    return NextResponse.json({ incident });
  } catch (error) {
    return toErrorResponse(error, "No se pudo actualizar el incidente.");
  }
}
