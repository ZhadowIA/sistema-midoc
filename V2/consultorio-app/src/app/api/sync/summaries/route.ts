import { NextResponse } from "next/server";
import { z } from "zod";

import { toErrorResponse } from "../../../../lib/api-error";
import { assertRateLimit } from "../../../../lib/rate-limit";
import { publishAuthorizedSummary } from "../../../../services/documents/authorized-summary-service";
import { authenticateSyncDevice } from "../../../../services/sync/sync-service";

const publishSchema = z.object({
  patientId: z.string().min(1),
  appointmentId: z.string().min(1).optional(),
  // Ciphertext (nonce||secretbox) en base64. La nube no lo descifra.
  ciphertext: z.string().min(1).max(20_000_000),
  title: z.string().max(200).optional(),
  mimeType: z.string().max(100).optional(),
  expiresInHours: z.number().int().positive().optional()
});

export async function POST(request: Request) {
  try {
    const device = await authenticateSyncDevice(request);
    assertRateLimit({ key: `sync-summary:${device.id}`, limit: 120, windowMs: 1000 * 60 * 15 });

    const payload = publishSchema.parse(await request.json());
    const result = await publishAuthorizedSummary(device, {
      patientId: payload.patientId,
      appointmentId: payload.appointmentId,
      ciphertext: Buffer.from(payload.ciphertext, "base64"),
      title: payload.title,
      mimeType: payload.mimeType,
      expiresInHours: payload.expiresInHours
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "No se pudo publicar el resumen.");
  }
}
