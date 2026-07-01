import { z } from "zod";

import type {
  CloudTranscriptionProvider,
  CloudTranscriptionRequest,
  CloudTranscriptionResult,
  CloudTranscriptSegment
} from "./cloud-transcription-provider";

// Primera implementacion del contrato `CloudTranscriptionProvider` contra la API
// de OpenAI (`/v1/audio/transcriptions`). Construye un multipart con bytes y
// metadata minima, autentica con Bearer y valida la respuesta con Zod. El
// transporte HTTP se inyecta (frontera fina) para poder probar el contrato sin
// red. Nunca registra cuerpos ni filtra detalles del proveedor en los errores.

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const NEUTRAL_FILENAME = "consultation.wav";

export interface OpenAiTranscriptionProviderConfig {
  apiKey: string;
  standardModel: string;
  diarizationModel: string;
  baseUrl?: string;
}

export interface TranscriptionTransportResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type TranscriptionTransport = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: FormData }
) => Promise<TranscriptionTransportResponse>;

const standardResponseSchema = z.object({
  text: z.string(),
  duration: z.number().optional(),
  usage: z.object({ seconds: z.number() }).partial().optional()
});

const diarizedResponseSchema = standardResponseSchema.extend({
  segments: z.array(
    z.object({
      speaker: z.string(),
      start: z.number(),
      end: z.number(),
      text: z.string()
    })
  )
});

function reportedDuration(parsed: {
  duration?: number;
  usage?: { seconds?: number };
}): number | null {
  return parsed.usage?.seconds ?? parsed.duration ?? null;
}

export class OpenAiTranscriptionProvider implements CloudTranscriptionProvider {
  public readonly name = "openai";

  constructor(
    private readonly config: OpenAiTranscriptionProviderConfig,
    private readonly transport: TranscriptionTransport
  ) {}

  async transcribe(request: CloudTranscriptionRequest): Promise<CloudTranscriptionResult> {
    const diarized = request.mode === "diarized";
    const model = diarized ? this.config.diarizationModel : this.config.standardModel;

    const form = new FormData();
    // Bytes + nombre neutro: nunca el nombre original ni identificadores del paciente.
    form.append("file", new Blob([request.audio], { type: "audio/wav" }), NEUTRAL_FILENAME);
    form.append("model", model);
    form.append("response_format", diarized ? "diarized_json" : "json");
    if (diarized) {
      form.append("chunking_strategy", "auto");
    }

    const baseUrl = this.config.baseUrl ?? DEFAULT_BASE_URL;
    const startedAt = Date.now();

    let response: TranscriptionTransportResponse;
    try {
      response = await this.transport(`${baseUrl}/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
        body: form
      });
    } catch {
      // No se reexpone el error de red original (puede traer detalles sensibles).
      throw new Error("Cloud transcription provider request failed");
    }

    if (!response.ok) {
      throw new Error(`Cloud transcription provider failed (status ${response.status})`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error("Cloud transcription provider returned an unreadable response");
    }

    const latencyMs = Date.now() - startedAt;

    if (diarized) {
      const parsed = diarizedResponseSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error("Cloud transcription provider returned an invalid diarized response");
      }
      const segments: CloudTranscriptSegment[] = parsed.data.segments.map((segment) => ({
        speaker: segment.speaker,
        startSeconds: segment.start,
        endSeconds: segment.end,
        text: segment.text.trim()
      }));
      return {
        text: parsed.data.text.trim(),
        segments,
        reportedDurationSeconds: reportedDuration(parsed.data),
        model,
        latencyMs
      };
    }

    const parsed = standardResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error("Cloud transcription provider returned an invalid response");
    }
    return {
      text: parsed.data.text.trim(),
      segments: null,
      reportedDurationSeconds: reportedDuration(parsed.data),
      model,
      latencyMs
    };
  }
}
