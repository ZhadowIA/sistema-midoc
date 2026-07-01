import type { TranscriptionMode } from "./ai-credits";

// Contrato AGNOSTICO de proveedor de transcripcion en nube. OpenAI es la primera
// implementacion (RF41: no acoplar a un solo proveedor). Agregar Deepgram, AWS
// HealthScribe u otro mas adelante = nueva implementacion de esta interfaz, sin
// tocar el servicio que la orquesta ni la app de escritorio.

export interface CloudTranscriptSegment {
  /** Etiqueta anonima del proveedor (p. ej. `speaker_0`). Sin rol asignado. */
  speaker: string;
  startSeconds: number;
  endSeconds: number;
  text: string;
}

export interface CloudTranscriptionResult {
  text: string;
  /** `null` en modo estandar; turnos por hablante en modo diarizado. */
  segments: CloudTranscriptSegment[] | null;
  /** Duracion declarada por el proveedor, solo como comprobacion. Puede faltar. */
  reportedDurationSeconds: number | null;
  model: string;
  latencyMs: number;
}

export interface CloudTranscriptionRequest {
  /** Bytes del audio (WAV). Nunca el nombre original ni IDs de paciente. */
  audio: Uint8Array;
  mode: TranscriptionMode;
}

export interface CloudTranscriptionProvider {
  readonly name: string;
  transcribe(request: CloudTranscriptionRequest): Promise<CloudTranscriptionResult>;
}
