export type RecordingState = "idle" | "recording" | "paused" | "stopping";

export interface TranscriptionWorkspaceInput {
  voiceConsent: boolean;
  recordingState: RecordingState;
  processing: boolean;
  hasTranscript: boolean;
  reviewed: boolean;
  streamingSupported: boolean;
  realtimeCapable: boolean;
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
  { value: 1, label: "1 · dictado" },
  { value: 2, label: "2 · médico y paciente" },
  { value: 3, label: "3 · con acompañante" }
];

export const DEFAULT_SPEAKER_COUNT = 2;

export function speakerCountLabel(value: number): string {
  return SPEAKER_COUNT_OPTIONS.find((option) => option.value === value)?.label ?? `${value}`;
}

export function deriveTranscriptionView(input: TranscriptionWorkspaceInput) {
  const hasTranscript = input.hasTranscript;
  return {
    canStart: input.voiceConsent && input.recordingState === "idle" && !input.processing,
    canPause: input.recordingState === "recording",
    canResume: input.recordingState === "paused",
    canStop: input.recordingState === "recording" || input.recordingState === "paused",
    canMarkReviewed: hasTranscript && !input.reviewed && !input.processing,
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
