import { NextResponse } from "next/server";
import { z } from "zod";

import { requestIpFrom, toErrorResponse } from "../../../../../lib/api-error";
import { assertRateLimit } from "../../../../../lib/rate-limit";
import {
  getUploadLinkForUpload,
  submitMailboxDocument
} from "../../../../../services/documents/document-service";

const uploadSchema = z.object({
  // Sealed box (X25519) en base64. La nube no lo descifra: lo reenvia al medico.
  // El nombre, tipo y categoria del archivo viajan cifrados dentro del box.
  ciphertext: z.string().min(1).max(20_000_000)
});

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    assertRateLimit({ key: `upload-info:${requestIpFrom(request) ?? token}`, limit: 60, windowMs: 1000 * 60 * 15 });
    const info = await getUploadLinkForUpload(token);
    return NextResponse.json(info);
  } catch (error) {
    return toErrorResponse(error, "No se pudo abrir el enlace de carga.");
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    assertRateLimit({ key: `upload-submit:${requestIpFrom(request) ?? token}`, limit: 30, windowMs: 1000 * 60 * 15 });

    const payload = uploadSchema.parse(await request.json());
    const ciphertext = Buffer.from(payload.ciphertext, "base64");
    const result = await submitMailboxDocument(token, { ciphertext });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "No se pudo subir el documento.");
  }
}
