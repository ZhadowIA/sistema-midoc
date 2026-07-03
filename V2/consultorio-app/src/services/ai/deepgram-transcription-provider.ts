import { z } from "zod";

import { ServiceError } from "../../lib/errors";
import type {
  CloudTranscriptionProvider,
  CloudTranscriptionRequest,
  CloudTranscriptionResult,
  CloudTranscriptSegment
} from "./cloud-transcription-provider";

// Segunda implementacion del contrato `CloudTranscriptionProvider`, contra la API
// de Deepgram (`/v1/listen`). A diferencia de OpenAI (multipart), Deepgram recibe
// los bytes crudos del WAV en el cuerpo y los parametros por query string. La
// diarizacion no usa otro modelo: se activa con `diarize=true&utterances=true`.
// El transporte HTTP se inyecta (frontera fina) para probar el contrato sin red.
// Nunca registra cuerpos ni filtra detalles del proveedor en los errores.

const DEFAULT_BASE_URL = "https://api.deepgram.com/v1";

export interface DeepgramTranscriptionProviderConfig {
  apiKey: string;
  model: string;
  /** Idioma para el modelo (p. ej. `multi` en nova-3, `es` en nova-2). */
  language: string;
  baseUrl?: string;
}

export interface DeepgramTransportResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type DeepgramTransport = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: Uint8Array }
) => Promise<DeepgramTransportResponse>;

const responseSchema = z.object({
  metadata: z.object({ duration: z.number().optional() }).optional(),
  results: z.object({
    channels: z
      .array(
        z.object({
          alternatives: z.array(z.object({ transcript: z.string() })).min(1)
        })
      )
      .min(1),
    utterances: z
      .array(
        z.object({
          speaker: z.number().int().nonnegative().optional(),
          start: z.number(),
          end: z.number(),
          transcript: z.string()
        })
      )
      .optional()
  })
});

export class DeepgramTranscriptionProvider implements CloudTranscriptionProvider {
  public readonly name = "deepgram";

  constructor(
    private readonly config: DeepgramTranscriptionProviderConfig,
    private readonly transport: DeepgramTransport
  ) {}

  async transcribe(request: CloudTranscriptionRequest): Promise<CloudTranscriptionResult> {
    const diarized = request.mode === "diarized";

    // Solo parametros de procesamiento: nunca identificadores del paciente ni
    // metadatos del archivo original (los bytes viajan sin nombre).
    const params = new URLSearchParams({
      model: this.config.model,
      language: this.config.language,
      smart_format: "true"
    });
    if (diarized) {
      params.set("diarize", "true");
      params.set("utterances", "true");
    }

    const baseUrl = this.config.baseUrl ?? DEFAULT_BASE_URL;
    const startedAt = Date.now();

    let response: DeepgramTransportResponse;
    try {
      response = await this.transport(`${baseUrl}/listen?${params.toString()}`, {
        method: "POST",
        headers: {
          Authorization: `Token ${this.config.apiKey}`,
          "Content-Type": "audio/wav"
        },
        body: request.audio
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

    const parsed = responseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error("Cloud transcription provider returned an invalid response");
    }

    const transcript = parsed.data.results.channels[0].alternatives[0].transcript.trim();
    const reportedDurationSeconds = parsed.data.metadata?.duration ?? null;

    if (diarized) {
      const utterances = parsed.data.results.utterances;
      if (!utterances) {
        throw new Error("Cloud transcription provider returned an invalid diarized response");
      }
      // Etiquetas anonimas `speaker_N` (mismo contrato que OpenAI): el rol
      // medico/paciente lo confirma el medico en el equipo, nunca el proveedor.
      const segments: CloudTranscriptSegment[] = utterances.map((utterance) => ({
        speaker: `speaker_${utterance.speaker ?? 0}`,
        startSeconds: utterance.start,
        endSeconds: utterance.end,
        text: utterance.transcript.trim()
      }));
      return {
        text: transcript,
        segments,
        reportedDurationSeconds,
        model: this.config.model,
        latencyMs
      };
    }

    return {
      text: transcript,
      segments: null,
      reportedDurationSeconds,
      model: this.config.model,
      latencyMs
    };
  }
}

/** Transporte real basado en `fetch` (produccion). Los tests inyectan un fake. */
export const deepgramFetchTransport: DeepgramTransport = async (url, init) => {
  const response = await fetch(url, {
    method: init.method,
    headers: init.headers,
    // Copia a un ArrayBuffer propio: Uint8Array generico sobre ArrayBufferLike
    // no es asignable directo a BodyInit.
    body: new Uint8Array(init.body).buffer
  });
  return {
    ok: response.ok,
    status: response.status,
    json: () => response.json()
  };
};

export interface DeepgramTranscriptionEnv {
  enabled: boolean;
  apiKey: string;
  model: string;
  language: string;
  baaApproved: boolean;
}

/**
 * Construye el proveedor Deepgram solo cuando la funcion esta habilitada, con
 * clave y con BAA / no-retencion verificado. En cualquier otro caso rechaza con
 * `403`: el audio es contenido CLINICO y no debe salir del equipo sin estos
 * controles. El BAA real se verifica fuera de banda (paso 16).
 */
export function resolveDeepgramTranscriptionProvider(
  config: DeepgramTranscriptionEnv,
  transport: DeepgramTransport = deepgramFetchTransport
): DeepgramTranscriptionProvider {
  if (!config.enabled || !config.baaApproved || !config.apiKey) {
    throw new ServiceError("La transcripcion en nube con este proveedor no esta habilitada.", 403);
  }
  return new DeepgramTranscriptionProvider(
    {
      apiKey: config.apiKey,
      model: config.model,
      language: config.language
    },
    transport
  );
}
