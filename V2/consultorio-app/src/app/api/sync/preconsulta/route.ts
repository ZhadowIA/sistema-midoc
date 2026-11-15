import { NextResponse } from "next/server";
import { z } from "zod";

import { toErrorResponse } from "../../../../lib/api-error";
import { assertRateLimit } from "../../../../lib/rate-limit";
import { getPreconsultaStatus, publishQuestionnaire } from "../../../../services/preconsulta/questionnaire-service";
import { authenticateSyncDevice } from "../../../../services/sync/sync-service";

// Preconsulta configurable (paso 32, rebanada 1): la app lee lo publicado y el
// estado de su enlace general, y publica su cuestionario. Solo preguntas.
export async function GET(request: Request) {
  try {
    const device = await authenticateSyncDevice(request);
    await assertRateLimit({ key: `sync-preconsulta:${device.id}`, limit: 120, windowMs: 1000 * 60 * 15 });
    return NextResponse.json(await getPreconsultaStatus(device.doctorId));
  } catch (error) {
    return toErrorResponse(error, "No se pudo leer la preconsulta.");
  }
}

const publishSchema = z.strictObject({ definition: z.unknown() });

export async function PUT(request: Request) {
  try {
    const device = await authenticateSyncDevice(request);
    await assertRateLimit({ key: `sync-preconsulta-publish:${device.id}`, limit: 30, windowMs: 1000 * 60 * 15 });
    const { definition } = publishSchema.parse(await request.json());
    return NextResponse.json(await publishQuestionnaire(device.doctorId, definition));
  } catch (error) {
    return toErrorResponse(error, "No se pudo publicar el cuestionario.");
  }
}
