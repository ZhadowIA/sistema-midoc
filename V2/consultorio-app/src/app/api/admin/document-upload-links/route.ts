import { NextResponse } from "next/server";
import { z } from "zod";

import { toErrorResponse } from "../../../../lib/api-error";
import { requireDoctorUser } from "../../../../lib/auth/session-user";
import {
  createUploadLink,
  listUploadLinks
} from "../../../../services/documents/document-service";

const createSchema = z.object({
  patientId: z.string().min(1),
  appointmentId: z.string().min(1).optional(),
  expiresInHours: z.number().int().positive().optional(),
  maxUploads: z.number().int().positive().optional()
});

export async function GET(request: Request) {
  try {
    const user = await requireDoctorUser(request);
    const url = new URL(request.url);
    const patientId = url.searchParams.get("patientId") ?? undefined;
    const links = await listUploadLinks(user.id, patientId);
    return NextResponse.json({ links });
  } catch (error) {
    return toErrorResponse(error, "No se pudieron obtener los enlaces.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireDoctorUser(request);
    const payload = createSchema.parse(await request.json());
    const result = await createUploadLink(user.id, payload);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "No se pudo crear el enlace de carga.");
  }
}
