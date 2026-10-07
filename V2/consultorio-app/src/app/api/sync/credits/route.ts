import { NextResponse } from "next/server";

import { toErrorResponse } from "../../../../lib/api-error";
import { assertRateLimit } from "../../../../lib/rate-limit";
import { getCreditBalance } from "../../../../services/ai/credit-ledger";
import { authenticateSyncDevice } from "../../../../services/sync/sync-service";

// Saldo de creditos de IA para la app (paso 29 r3). Solo numeros, sin contenido.
export async function GET(request: Request) {
  try {
    const device = await authenticateSyncDevice(request);
    await assertRateLimit({ key: `sync-credits:${device.id}`, limit: 120, windowMs: 1000 * 60 * 15 });
    const balance = await getCreditBalance(device.doctorId);
    return NextResponse.json({
      balance: balance.balance,
      expiringCredits: balance.expiringCredits,
      nextExpiry: balance.nextExpiry?.toISOString() ?? null
    });
  } catch (error) {
    return toErrorResponse(error, "No se pudo leer el saldo de creditos.");
  }
}
