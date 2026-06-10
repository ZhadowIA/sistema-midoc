import { DoctorServiceStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { toErrorResponse } from "../../../../lib/api-error";
import { requireDoctorUser } from "../../../../lib/auth/session-user";
import { createDoctorService, getDoctorWorkspace } from "../../../../services/doctor/doctor-profile-service";

const createServiceSchema = z.object({
  name: z.string().min(1),
  description: z.string().max(1000).optional(),
  priceCents: z.number().int().min(0),
  currency: z.string().min(3).max(3).optional(),
  durationMinutes: z.number().int().positive(),
  displayOrder: z.number().int().min(0).optional(),
  status: z.nativeEnum(DoctorServiceStatus).optional()
});

export async function GET(request: Request) {
  try {
    const user = await requireDoctorUser(request);
    const workspace = await getDoctorWorkspace(user.id);
    return NextResponse.json({ services: workspace.services });
  } catch (error) {
    return toErrorResponse(error, "No se pudieron obtener los servicios.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireDoctorUser(request);
    const payload = createServiceSchema.parse(await request.json());
    const service = await createDoctorService(user.id, payload);
    return NextResponse.json({ service }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "No se pudo crear el servicio.");
  }
}
