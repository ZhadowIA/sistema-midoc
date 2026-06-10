import { NextResponse } from "next/server";
import { z } from "zod";

import { toErrorResponse } from "../../../../../lib/api-error";
import { requireDoctorUser } from "../../../../../lib/auth/session-user";
import { createAvailabilityBlock, getDoctorWorkspace } from "../../../../../services/doctor/doctor-profile-service";

const blockSchema = z.object({
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  reason: z.string().max(500).optional()
});

export async function GET(request: Request) {
  try {
    const user = await requireDoctorUser(request);
    const workspace = await getDoctorWorkspace(user.id);
    return NextResponse.json({
      blocks: workspace.availabilityBlocks
    });
  } catch (error) {
    return toErrorResponse(error, "No se pudieron obtener los bloqueos.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireDoctorUser(request);
    const payload = blockSchema.parse(await request.json());
    const block = await createAvailabilityBlock(user.id, payload);

    return NextResponse.json({ block }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "No se pudo crear el bloqueo.");
  }
}
