import { NextResponse } from "next/server";
import { z, ZodError } from "zod";

import { assertRateLimit } from "../../../../../../lib/rate-limit";
import { assertAiPreconsultaNotSubmitted } from "../../../../../../services/booking/public-booking-service";
import { getPreconsultaAiProvider } from "../../../../../../services/ai/preconsulta-ai";

/** Maximo de preguntas adaptativas de la entrevista (paso 19, rebanada 8). */
const MAX_QUESTIONS = 5;

// El cuerpo solo lleva texto clinico seudonimizado (motivo + respuestas). NO se
// persiste: la siguiente pregunta se calcula y se devuelve, sin guardar nada
// (regla 4: prohibido persistir contenido en nube/logs). El consentimiento del
// paciente es obligatorio antes de cualquier llamada al proveedor.
const chatSchema = z.object({
  consent: z.literal(true),
  motivo: z.string().max(2000).default(""),
  answers: z
    .array(z.object({ question: z.string().max(500), answer: z.string().max(2000) }))
    .max(MAX_QUESTIONS)
    .default([])
});

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    await assertRateLimit({ key: `preconsulta-ai:${token}`, limit: 10, windowMs: 1000 * 60 * 15 });

    const payload = chatSchema.parse(await request.json());
    await assertAiPreconsultaNotSubmitted(token);
    const provider = getPreconsultaAiProvider();
    const next = await provider.nextQuestion({
      motivo: payload.motivo,
      answers: payload.answers,
      maxQuestions: MAX_QUESTIONS
    });

    return NextResponse.json(next);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Solicitud de preconsulta invalida." }, { status: 400 });
    }

    const status =
      typeof error === "object" && error && "status" in error ? Number(error.status) : 503;
    return NextResponse.json(
      { error: "No se pudo continuar la preconsulta en este momento. Intenta de nuevo mas tarde." },
      { status }
    );
  }
}
