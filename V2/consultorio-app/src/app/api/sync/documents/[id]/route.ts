import { NextResponse } from "next/server";

import { toErrorResponse } from "../../../../../lib/api-error";
import { assertRateLimit } from "../../../../../lib/rate-limit";
import {
  authenticateSyncDevice,
  getMailboxDocumentForDevice
} from "../../../../../services/sync/sync-service";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const device = await authenticateSyncDevice(request);
    assertRateLimit({ key: `sync-doc:${device.id}`, limit: 240, windowMs: 1000 * 60 * 15 });

    const { id } = await context.params;
    const document = await getMailboxDocumentForDevice(device, id);

    return NextResponse.json(document);
  } catch (error) {
    return toErrorResponse(error, "No se pudo descargar el documento.");
  }
}
