import { NextResponse } from "next/server";
import { z } from "zod";

import { toErrorResponse } from "../../../../../lib/api-error";
import { assertRateLimit } from "../../../../../lib/rate-limit";
import { createPersonalLink } from "../../../../../services/preconsulta/questionnaire-service";
import { authenticateSyncDevice } from "../../../../../services/sync/sync-service";

// Enlace personal de preconsulta (paso 32, rebanada 4): la app lo pide desde el
// expediente con una referencia opaca del paciente y recibe la URL una sola vez.
const personalLinkSchema = z.strictObject({ patientRef: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/) });

export async function POST(request: Request) {
  try {
    const device = await authenticateSyncDevice(request);
    await assertRateLimit({ key: `sync-preconsulta-personal-link:${device.id}`, limit: 60, windowMs: 1000 * 60 * 15 });
    const { patientRef } = personalLinkSchema.parse(await request.json());
    return NextResponse.json(await createPersonalLink(device.doctorId, patientRef));
  } catch (error) {
    return toErrorResponse(error, "No se pudo crear el enlace personal.");
  }
}
