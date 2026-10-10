import { AiUsageType } from "@prisma/client";

// Catalogo de costos en creditos por tipo de uso de IA. El saldo y el cobro
// viven en el libro mayor (`credit-ledger.ts`, paso 29).

const AI_CREDIT_COSTS: Record<string, number> = {
  SOAP_ASSIST: 1,
  SOAP_SUMMARY: 1,
  PATIENT_INSTRUCTIONS: 1,
  TRANSCRIPTION: 1,
  LONGITUDINAL_SUMMARY: 2,
  CLINICAL_GAPS: 2,
  CLINICAL_GAP: 2,
  CONSULTATION_STRUCTURING: 1,
  VALIDATION: 1,
  OTHER: 1
};

/** Modos de transcripcion en nube: normal vs separacion de hablantes. */
export type TranscriptionMode = "standard" | "diarized";

/** Contexto opcional para afinar el costo de un uso (p. ej. proveedor local). */
export interface AiCreditContext {
  /** Nombre del proveedor que ejecuto el uso (ej. `whisper-local-medium`). */
  providerName?: string;
}

/** Whisper corriendo en el equipo del medico no consume creditos. */
function isLocalTranscriptionProvider(providerName: string | undefined): boolean {
  return typeof providerName === "string" && providerName.startsWith("whisper-local");
}

export function getAiCreditCost(
  usageType: string | AiUsageType,
  context?: AiCreditContext
): number {
  // La transcripcion local (Whisper en el dispositivo) es gratuita; el costo de
  // nube no sale de aqui, lo fija el servicio autoritativo con la duracion del
  // WAV validado (ver `getTranscriptionCreditCost`).
  if (usageType === "TRANSCRIPTION" && isLocalTranscriptionProvider(context?.providerName)) {
    return 0;
  }
  return AI_CREDIT_COSTS[usageType] ?? AI_CREDIT_COSTS.OTHER;
}

/**
 * Costo en creditos de una transcripcion en nube, por bloques de duracion
 * iniciados. Estandar: 900 s (15 min). Diarizado: 600 s (10 min). Los limites
 * son inclusivos por bloque y el piso es 1 credito. La duracion debe ser la
 * autoritativa (WAV validado por el portal), no la declarada por el cliente.
 */
export function getTranscriptionCreditCost(input: {
  mode: TranscriptionMode;
  durationSeconds: number;
}): number {
  if (!Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0) {
    throw new Error("Invalid transcription duration");
  }
  const blockSeconds = input.mode === "diarized" ? 600 : 900;
  return Math.max(1, Math.ceil(input.durationSeconds / blockSeconds));
}
