import { NextResponse } from "next/server";
import { z } from "zod";

import { toErrorResponse } from "../../../../lib/api-error";
import { requireDoctorUser } from "../../../../lib/auth/session-user";
import { linkSyncDevice } from "../../../../services/sync/sync-service";

const linkSchema = z.object({
  deviceName: z.string().max(120).optional(),
  // Llave publica X25519 base64 (32 bytes -> 44 chars). El servicio la valida.
  documentPublicKey: z.string().max(64).optional()
});

export async function POST(request: Request) {
  try {
    const user = await requireDoctorUser(request);
    const payload = linkSchema.parse(await request.json().catch(() => ({})));
    const { device, deviceToken } = await linkSyncDevice(
      user.id,
      payload.deviceName,
      payload.documentPublicKey
    );

    return NextResponse.json(
      {
        device: {
          id: device.id,
          deviceName: device.deviceName,
          createdAt: device.createdAt
        },
        // El token solo se entrega aqui, una vez; el portal guarda su hash.
        deviceToken
      },
      { status: 201 }
    );
  } catch (error) {
    return toErrorResponse(error, "No se pudo vincular el dispositivo.");
  }
}
