import { NextResponse } from "next/server";
import { z } from "zod";

import { toErrorResponse } from "../../../../lib/api-error";
import { assertRateLimit } from "../../../../lib/rate-limit";
import { activateLicense } from "../../../../services/license/license-service";
import { authenticateSyncDevice } from "../../../../services/sync/sync-service";

// Activacion de la licencia en el equipo vinculado (paso 29). La app la llama al
// vincular y en cada sincronizacion; la respuesta trae la licencia firmada.
const activationSchema = z.object({
  installationId: z.string().uuid(),
  deviceName: z.string().max(120).optional()
});

export async function POST(request: Request) {
  try {
    const device = await authenticateSyncDevice(request);
    await assertRateLimit({ key: `sync-license:${device.id}`, limit: 30, windowMs: 1000 * 60 * 15 });
    const payload = activationSchema.parse(await request.json().catch(() => ({})));
    const result = await activateLicense(device, payload);
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error, "No se pudo activar la licencia.");
  }
}
