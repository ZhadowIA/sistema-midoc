import { NextResponse } from "next/server";

import { toErrorResponse } from "../../../../../../lib/api-error";
import { assertRateLimit } from "../../../../../../lib/rate-limit";
import {
  authenticateSyncDevice,
  getMailboxPreconsultaForDevice
} from "../../../../../../services/sync/sync-service";

// Preconsulta configurable (paso 32, rebanada 3): la app baja el sobre sellado
// que anuncio el evento PRECONSULTA_SUBMITTED y lo abre con su llave.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const device = await authenticateSyncDevice(request);
    await assertRateLimit({ key: `sync-preconsulta-submission:${device.id}`, limit: 600, windowMs: 1000 * 60 * 15 });

    const { id } = await context.params;
    return NextResponse.json(await getMailboxPreconsultaForDevice(device, id));
  } catch (error) {
    return toErrorResponse(error, "No se pudo descargar la preconsulta.");
  }
}
