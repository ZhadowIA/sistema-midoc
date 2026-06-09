import { DoctorServiceStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireDoctorUser } from "../../../../../lib/auth/session-user";
import { updateDoctorService } from "../../../../../services/doctor/doctor-profile-service";

const updateServiceSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().max(1000).nullable().optional(),
  priceCents: z.number().int().min(0).optional(),
  currency: z.string().min(3).max(3).optional(),
  durationMinutes: z.number().int().positive().optional(),
  displayOrder: z.number().int().min(0).optional(),
  status: z.nativeEnum(DoctorServiceStatus).optional()
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ serviceId: string }> }
) {
  try {
    const user = await requireDoctorUser(request);
    const payload = updateServiceSchema.parse(await request.json());
    const { serviceId } = await context.params;
    const service = await updateDoctorService(user.id, serviceId, payload);

    return NextResponse.json({ service });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 400;

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to update service."
      },
      { status }
    );
  }
}
