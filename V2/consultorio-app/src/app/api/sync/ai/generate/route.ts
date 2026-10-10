import { NextResponse } from "next/server";

import { toErrorResponse } from "../../../../../lib/api-error";
import { assertRateLimit } from "../../../../../lib/rate-limit";
import { runGatewayGeneration, TextGatewayError } from "../../../../../services/ai/text-gateway-service";
import { authenticateSyncDevice } from "../../../../../services/sync/sync-service";

// Pasarela de IA de texto (paso 30). Recibe contexto seudonimizado de la app,
// cobra creditos y responde el borrador. No guarda ni registra contenido.
export async function POST(request: Request) {
  try {
    const device = await authenticateSyncDevice(request);
    await assertRateLimit({ key: `sync-ai-generate:${device.id}`, limit: 120, windowMs: 1000 * 60 * 15 });
    const payload = await request.json().catch(() => null);
    const result = await runGatewayGeneration(device, payload);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof TextGatewayError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return toErrorResponse(error, "No se pudo completar la solicitud de IA.");
  }
}
