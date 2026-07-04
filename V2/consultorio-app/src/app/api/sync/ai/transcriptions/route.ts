import { NextResponse } from "next/server";
import { z } from "zod";

import { toErrorResponse } from "../../../../../lib/api-error";
import { env } from "../../../../../lib/env";
import { ServiceError } from "../../../../../lib/errors";
import { assertRateLimit } from "../../../../../lib/rate-limit";
import { transcribeCloudAudio } from "../../../../../services/ai/cloud-transcription-service";
import { resolveDeepgramTranscriptionProvider } from "../../../../../services/ai/deepgram-transcription-provider";
import { resolveOpenAiTranscriptionProvider } from "../../../../../services/ai/openai-transcription-provider";
import { authenticateSyncDevice } from "../../../../../services/sync/sync-service";

// Frontera HTTP fina del respaldo de transcripcion en nube (Ruta B, F2). Recibe
// el audio como multipart, autentica el dispositivo, aplica rate limit y delega
// en el servicio gobernado. No escribe cuerpos, bytes ni transcripciones en
// logs. El audio se procesa en memoria y se descarta.

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const ACCEPTED_AUDIO_TYPES = ["audio/wav", "audio/x-wav"];

const runIdSchema = z.uuid();
const modeSchema = z.enum(["standard", "diarized"]);
// Proveedor elegido por el medico en el desktop. Opcional con default `openai`
// para no romper dispositivos con versiones previas que no envian el campo.
const providerSchema = z.enum(["openai", "deepgram"]).default("openai");

export async function POST(request: Request) {
  try {
    const device = await authenticateSyncDevice(request);
    await assertRateLimit({
      key: `sync-transcription:${device.id}`,
      limit: 30,
      windowMs: 1000 * 60 * 15
    });

    const form = await request.formData();
    const runId = runIdSchema.parse(form.get("runId"));
    const mode = modeSchema.parse(form.get("mode"));
    const providerName = providerSchema.parse(form.get("provider") ?? undefined);

    const audio = form.get("audio");
    if (!(audio instanceof File)) {
      throw new ServiceError("Se requiere el archivo de audio.", 422);
    }
    if (!ACCEPTED_AUDIO_TYPES.includes(audio.type)) {
      throw new ServiceError("Formato de audio no soportado.", 415);
    }
    if (audio.size < 1 || audio.size > MAX_AUDIO_BYTES) {
      throw new ServiceError("Tamano de audio invalido.", 413);
    }

    // El proveedor solo se construye si la funcion esta habilitada con BAA/ZDR;
    // de lo contrario resuelve un 403 antes de tocar el audio. Cada proveedor
    // tiene su propio gate de entorno (RF41: contrato agnostico).
    const provider =
      providerName === "deepgram"
        ? resolveDeepgramTranscriptionProvider({
            enabled: env.DEEPGRAM_TRANSCRIPTION_ENABLED,
            apiKey: env.DEEPGRAM_API_KEY ?? "",
            model: env.DEEPGRAM_TRANSCRIPTION_MODEL,
            language: env.DEEPGRAM_TRANSCRIPTION_LANGUAGE,
            baaApproved: env.DEEPGRAM_TRANSCRIPTION_BAA_APPROVED
          })
        : resolveOpenAiTranscriptionProvider({
            enabled: env.OPENAI_TRANSCRIPTION_ENABLED,
            apiKey: env.OPENAI_API_KEY ?? "",
            standardModel: env.OPENAI_TRANSCRIPTION_MODEL,
            diarizationModel: env.OPENAI_DIARIZATION_MODEL,
            zdrApproved: env.OPENAI_TRANSCRIPTION_ZDR_APPROVED
          });

    const bytes = new Uint8Array(await audio.arrayBuffer());
    const result = await transcribeCloudAudio({ device, runId, mode, audio: bytes }, provider);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return toErrorResponse(error, "No se pudo transcribir el audio.");
  }
}
