import { NextResponse } from "next/server";

import { toErrorResponse } from "../../../../lib/api-error";
import { assertRateLimit } from "../../../../lib/rate-limit";
import { authenticateSyncDevice, getSyncInbox } from "../../../../services/sync/sync-service";

export async function GET(request: Request) {
  try {
    const device = await authenticateSyncDevice(request);
    await assertRateLimit({ key: `sync-inbox:${device.id}`, limit: 120, windowMs: 1000 * 60 * 15 });

    const url = new URL(request.url);
    const cursorParam = url.searchParams.get("cursor");
    const cursor = cursorParam ? Number(cursorParam) : device.cursor;

    if (!Number.isInteger(cursor) || cursor < 0) {
      return NextResponse.json({ error: "Cursor invalido." }, { status: 400 });
    }

    const inbox = await getSyncInbox(device, cursor);

    return NextResponse.json(inbox);
  } catch (error) {
    return toErrorResponse(error, "No se pudo leer el buzon.");
  }
}
