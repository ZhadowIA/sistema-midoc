import { IncidentSeverity } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { toErrorResponse } from "../../../../lib/api-error";
import { requireDoctorUser } from "../../../../lib/auth/session-user";
import { listIncidents, reportIncident } from "../../../../services/compliance/compliance-service";

const reportSchema = z.object({
  category: z.string().min(1).max(80),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(4000),
  severity: z.nativeEnum(IncidentSeverity).optional(),
  detectedAt: z.coerce.date().optional()
});

export async function GET(request: Request) {
  try {
    const user = await requireDoctorUser(request);
    const incidents = await listIncidents(user.id);
    return NextResponse.json({ incidents });
  } catch (error) {
    return toErrorResponse(error, "No se pudieron obtener los incidentes.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireDoctorUser(request);
    const payload = reportSchema.parse(await request.json());
    const incident = await reportIncident(user.id, payload);
    return NextResponse.json({ incident }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "No se pudo registrar el incidente.");
  }
}
