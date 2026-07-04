import { NextResponse } from "next/server";

import { toErrorResponse } from "../../../../lib/api-error";
import { assertRateLimit } from "../../../../lib/rate-limit";
import { authenticateSyncDevice, recordAiUsageBatch } from "../../../../services/sync/sync-service";

export async function POST(request: Request) {
  try {
    const device = await authenticateSyncDevice(request);
    await assertRateLimit({ key: `sync-ai-usage:${device.id}`, limit: 120, windowMs: 1000 * 60 * 15 });

    const result = await recordAiUsageBatch(device, await request.json());

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "No se pudo registrar el uso de IA.");
  }
}
