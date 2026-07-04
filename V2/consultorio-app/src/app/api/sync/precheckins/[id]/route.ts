import { NextResponse } from "next/server";

import { toErrorResponse } from "../../../../../lib/api-error";
import { assertRateLimit } from "../../../../../lib/rate-limit";
import {
  authenticateSyncDevice,
  getMailboxPrecheckinForDevice
} from "../../../../../services/sync/sync-service";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const device = await authenticateSyncDevice(request);
    await assertRateLimit({ key: `sync-precheckin:${device.id}`, limit: 240, windowMs: 1000 * 60 * 15 });

    const { id } = await context.params;
    const precheckin = await getMailboxPrecheckinForDevice(device, id);

    return NextResponse.json(precheckin);
  } catch (error) {
    return toErrorResponse(error, "No se pudieron descargar los antecedentes.");
  }
}
