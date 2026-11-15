import { NextResponse } from "next/server";
import { z } from "zod";

import { toErrorResponse } from "../../../../../lib/api-error";
import { assertRateLimit } from "../../../../../lib/rate-limit";
import { regenerateGeneralLink, setGeneralLinkStatus } from "../../../../../services/preconsulta/questionnaire-service";
import { authenticateSyncDevice } from "../../../../../services/sync/sync-service";

// Enlace general de preconsulta (paso 32, rebanada 1). POST lo crea o lo
// regenera (el anterior deja de servir) y devuelve la URL una sola vez; PATCH lo
// pausa o lo reanuda.
export async function POST(request: Request) {
  try {
    const device = await authenticateSyncDevice(request);
    await assertRateLimit({ key: `sync-preconsulta-link:${device.id}`, limit: 10, windowMs: 1000 * 60 * 15 });
    return NextResponse.json(await regenerateGeneralLink(device.doctorId));
  } catch (error) {
    return toErrorResponse(error, "No se pudo crear el enlace.");
  }
}

const statusSchema = z.strictObject({ status: z.enum(["ACTIVE", "PAUSED"]) });

export async function PATCH(request: Request) {
  try {
    const device = await authenticateSyncDevice(request);
    await assertRateLimit({ key: `sync-preconsulta-link-status:${device.id}`, limit: 30, windowMs: 1000 * 60 * 15 });
    const { status } = statusSchema.parse(await request.json());
    return NextResponse.json(await setGeneralLinkStatus(device.doctorId, status));
  } catch (error) {
    return toErrorResponse(error, "No se pudo cambiar el enlace.");
  }
}
