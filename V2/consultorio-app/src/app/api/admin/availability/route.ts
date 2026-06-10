import { NextResponse } from "next/server";
import { z } from "zod";

import { toErrorResponse } from "../../../../lib/api-error";
import { requireDoctorUser } from "../../../../lib/auth/session-user";
import { createAvailabilityRule, getDoctorWorkspace } from "../../../../services/doctor/doctor-profile-service";

const availabilitySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6).optional(),
  specificDate: z.string().datetime().optional(),
  startTime: z.string().min(5),
  endTime: z.string().min(5),
  slotInterval: z.number().int().positive().optional(),
  maxAdvanceDays: z.number().int().positive().optional(),
  minAdvanceHours: z.number().int().min(0).optional(),
  isActive: z.boolean().optional()
});

export async function GET(request: Request) {
  try {
    const user = await requireDoctorUser(request);
    const workspace = await getDoctorWorkspace(user.id);
    return NextResponse.json({
      availability: workspace.availabilityRules
    });
  } catch (error) {
    return toErrorResponse(error, "No se pudo obtener la disponibilidad.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireDoctorUser(request);
    const payload = availabilitySchema.parse(await request.json());
    const rule = await createAvailabilityRule(user.id, payload);

    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "No se pudo crear la regla de disponibilidad.");
  }
}
