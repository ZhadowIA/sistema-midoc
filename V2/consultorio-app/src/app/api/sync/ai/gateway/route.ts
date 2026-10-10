import { NextResponse } from "next/server";

import { toErrorResponse } from "../../../../../lib/api-error";
import { getGatewayStatus } from "../../../../../services/ai/text-gateway-service";
import { authenticateSyncDevice } from "../../../../../services/sync/sync-service";

// Estado de la pasarela de IA (paso 30) para la app: si esta encendida y que
// modelos ofrece. Sin datos del medico ni contenido.
export async function GET(request: Request) {
  try {
    await authenticateSyncDevice(request);
    return NextResponse.json(getGatewayStatus());
  } catch (error) {
    return toErrorResponse(error, "No se pudo leer el estado de la pasarela de IA.");
  }
}
