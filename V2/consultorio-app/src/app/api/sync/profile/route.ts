import { NextResponse } from "next/server";

import { toErrorResponse } from "../../../../lib/api-error";
import { assertRateLimit } from "../../../../lib/rate-limit";
import { authenticateSyncDevice, getSyncDeviceProfile } from "../../../../services/sync/sync-service";

export async function GET(request: Request) {
  try {
    const device = await authenticateSyncDevice(request);
    assertRateLimit({ key: `sync-profile:${device.id}`, limit: 120, windowMs: 1000 * 60 * 15 });

    const profile = await getSyncDeviceProfile(device);

    return NextResponse.json(profile);
  } catch (error) {
    return toErrorResponse(error, "No se pudo leer el perfil.");
  }
}
