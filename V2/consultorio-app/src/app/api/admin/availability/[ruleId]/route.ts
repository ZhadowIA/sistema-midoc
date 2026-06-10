import { NextResponse } from "next/server";
import { z } from "zod";

import { toErrorResponse } from "../../../../../lib/api-error";
import { requireDoctorUser } from "../../../../../lib/auth/session-user";
import {
  deleteAvailabilityRule,
  setAvailabilityRuleActive
} from "../../../../../services/doctor/doctor-profile-service";

const updateRuleSchema = z.object({
  isActive: z.boolean()
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ ruleId: string }> }
) {
  try {
    const user = await requireDoctorUser(request);
    const payload = updateRuleSchema.parse(await request.json());
    const { ruleId } = await context.params;
    const rule = await setAvailabilityRuleActive(user.id, ruleId, payload.isActive);

    return NextResponse.json({ rule });
  } catch (error) {
    return toErrorResponse(error, "No se pudo actualizar la regla de disponibilidad.");
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ ruleId: string }> }
) {
  try {
    const user = await requireDoctorUser(request);
    const { ruleId } = await context.params;
    await deleteAvailabilityRule(user.id, ruleId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error, "No se pudo eliminar la regla de disponibilidad.");
  }
}
