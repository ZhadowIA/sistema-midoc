import { NextResponse } from "next/server";
import { z } from "zod";

import { submitAiPreconsulta } from "../../../../../../../services/booking/public-booking-service";

// El cuerpo solo lleva el sealed box (base64): el resultado de la preconsulta IA
// ya viene cifrado desde el navegador del paciente. La nube nunca lo lee.
const submitSchema = z.object({
  ciphertext: z.string().min(1).max(128 * 1024)
});

export async function PUT(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const payload = submitSchema.parse(await request.json());
    const precheckin = await submitAiPreconsulta({
      confirmationToken: token,
      ciphertext: payload.ciphertext
    });

    return NextResponse.json({ precheckin });
  } catch (error) {
    const status =
      typeof error === "object" && error && "status" in error ? Number(error.status) : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save AI preconsulta." },
      { status }
    );
  }
}
