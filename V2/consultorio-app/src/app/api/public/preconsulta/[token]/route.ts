import { NextResponse } from "next/server";
import { z } from "zod";

import { requestIpFrom, toErrorResponse } from "../../../../../lib/api-error";
import { submitPreconsulta } from "../../../../../services/preconsulta/submission-service";

// Envio de una preconsulta (paso 32, rebanada 2). El cuerpo solo trae el sobre
// sellado en el celular del paciente: el portal nunca ve las respuestas.
const submissionSchema = z.strictObject({
  ciphertext: z.string().min(1).max(300 * 1024),
  questionnaireVersion: z.number().int().min(1),
  // Trampa para bots: un campo que una persona nunca ve ni llena.
  website: z.string().max(200).optional()
});

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const input = submissionSchema.parse(await request.json());
    if (input.website) {
      // A un bot se le responde como si todo saliera bien, sin guardar nada.
      return NextResponse.json({ ok: true });
    }
    await submitPreconsulta({
      token,
      ciphertext: input.ciphertext,
      questionnaireVersion: input.questionnaireVersion,
      ip: requestIpFrom(request)
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error, "No se pudo enviar tu preconsulta.");
  }
}
