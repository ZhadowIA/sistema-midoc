import { NextResponse } from "next/server";
import { z } from "zod";

import { toErrorResponse } from "../../../../lib/api-error";
import { assertRateLimit } from "../../../../lib/rate-limit";
import { ackSyncEvents, authenticateSyncDevice } from "../../../../services/sync/sync-service";

const ackSchema = z.object({
  cursor: z.number().int().min(0)
});

export async function POST(request: Request) {
  try {
    const device = await authenticateSyncDevice(request);
    assertRateLimit({ key: `sync-ack:${device.id}`, limit: 120, windowMs: 1000 * 60 * 15 });

    const payload = ackSchema.parse(await request.json());
    const result = await ackSyncEvents(device, payload.cursor);

    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error, "No se pudo confirmar la entrega.");
  }
}
