import { NextResponse } from "next/server";

import { toErrorResponse } from "../../../../lib/api-error";
import { assertRateLimit } from "../../../../lib/rate-limit";
import {
  getPrescriberProfile,
  prescriberProfileInputSchema,
  updatePrescriberProfile
} from "../../../../services/doctor/prescriber-profile-service";
import { authenticateSyncDevice, getSyncDeviceProfile } from "../../../../services/sync/sync-service";

export async function GET(request: Request) {
  try {
    const device = await authenticateSyncDevice(request);
    await assertRateLimit({ key: `sync-profile:${device.id}`, limit: 120, windowMs: 1000 * 60 * 15 });

    const [profile, prescriber] = await Promise.all([
      getSyncDeviceProfile(device),
      getPrescriberProfile(device.doctorId)
    ]);

    // `prescriber` es aditivo: las versiones anteriores de la app solo leen `profile`.
    return NextResponse.json({ ...profile, prescriber });
  } catch (error) {
    return toErrorResponse(error, "No se pudo leer el perfil.");
  }
}

// Datos del medico para la receta, editados desde la app (regla 4.6): la app
// manda la version que leyo y solo actualiza su copia si el portal acepta.
export async function PUT(request: Request) {
  try {
    const device = await authenticateSyncDevice(request);
    await assertRateLimit({ key: `sync-profile-update:${device.id}`, limit: 30, windowMs: 1000 * 60 * 15 });

    const input = prescriberProfileInputSchema.parse(await request.json());
    const prescriber = await updatePrescriberProfile(device.doctorId, input, "desktop");

    return NextResponse.json({ prescriber });
  } catch (error) {
    return toErrorResponse(error, "No se pudieron guardar tus datos.");
  }
}
