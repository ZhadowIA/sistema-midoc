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
