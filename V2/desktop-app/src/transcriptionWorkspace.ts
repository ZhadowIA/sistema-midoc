export type RecordingState = "idle" | "recording" | "paused" | "stopping";

export interface TranscriptionWorkspaceInput {
  voiceConsent: boolean;
  recordingState: RecordingState;
  processing: boolean;
  hasTranscript: boolean;
  reviewed: boolean;
  streamingSupported: boolean;
  realtimeCapable: boolean;
  /** `false` bloquea "Marcar como revisada" mientras falten roles por asignar
   * (diarizacion en nube, Ruta B F4). Por defecto `true`: no aplica a
   * transcripcion local ni a nube estandar, donde no hay hablantes que asignar. */
  rolesResolved?: boolean;
}

// Numero de voces que el medico le indica a la diarizacion. 0 = Auto (el motor lo
// estima); 1 = dictado de una sola voz; 2 = consulta tipica (medico y paciente);
// 3 = con acompanante. Debe coincidir con el clamp del backend (MAX_NUM_SPEAKERS).
export interface SpeakerCountOption {
  value: number;
  label: string;
}

export const SPEAKER_COUNT_OPTIONS: SpeakerCountOption[] = [
  { value: 0, label: "Auto (detectar)" },
  { value: 1, label: "1 - dictado" },
  { value: 2, label: "2 - médico y paciente" },
  { value: 3, label: "3 - con acompañante" }
];

export const DEFAULT_SPEAKER_COUNT = 2;

export function speakerCountLabel(value: number): string {
  return SPEAKER_COUNT_OPTIONS.find((option) => option.value === value)?.label ?? `${value}`;
}

// Via de transcripcion (Ruta B, F4). "local" separa hablantes con Whisper +
// sherpa-onnx en el equipo; las dos vias en nube las gobierna el portal
// (nunca conoce la clave del proveedor real). Solo "cloud_diarized" identifica
// hablantes anonimos que el medico debe confirmar antes de acomodar.
export type TranscriptionMode = "local" | "cloud_standard" | "cloud_diarized";

export interface TranscriptionModeOption {
  value: TranscriptionMode;
  label: string;
}

export const TRANSCRIPTION_MODE_OPTIONS: TranscriptionModeOption[] = [
  { value: "local", label: "Local (con separación de voces)" },
  { value: "cloud_standard", label: "Nube · estándar" },
  { value: "cloud_diarized", label: "Nube · con hablantes" }
];

export const DEFAULT_TRANSCRIPTION_MODE: TranscriptionMode = "local";

// Proveedor real de la via en nube (RF41: contrato agnostico). El medico lo
// elige en la UI; el desktop solo transmite la eleccion al portal, que valida
// su gate de entorno y media con la clave (el desktop nunca la conoce).
export type CloudTranscriptionProviderId = "openai" | "deepgram";

export interface CloudTranscriptionProviderOption {
  value: CloudTranscriptionProviderId;
  label: string;
}

export const CLOUD_TRANSCRIPTION_PROVIDER_OPTIONS: CloudTranscriptionProviderOption[] = [
  { value: "openai", label: "OpenAI" },
  { value: "deepgram", label: "Deepgram" }
];

export const DEFAULT_CLOUD_TRANSCRIPTION_PROVIDER: CloudTranscriptionProviderId = "openai";

export function deriveTranscriptionView(input: TranscriptionWorkspaceInput) {
  const hasTranscript = input.hasTranscript;
  return {
    canStart: input.voiceConsent && input.recordingState === "idle" && !input.processing,
    canPause: input.recordingState === "recording",
    canResume: input.recordingState === "paused",
    canStop: input.recordingState === "recording" || input.recordingState === "paused",
    canMarkReviewed:
      hasTranscript && !input.reviewed && !input.processing && (input.rolesResolved ?? true),
    canUseClinicalAid: hasTranscript && input.reviewed,
    transcriptStatus: input.reviewed
      ? "Revisada"
      : hasTranscript
        ? "Lista para revisar"
        : input.streamingSupported && input.recordingState === "recording"
          ? "En vivo"
          : "Por lotes",
    transcriptMessage:
      input.streamingSupported && input.recordingState === "recording"
        ? "La transcripción se actualizará durante la grabación."
        : hasTranscript
          ? "Revisa el texto y los hablantes antes de marcarla como lista."
          : "La transcripción aparecerá al finalizar la grabación."
  } as const;
}
