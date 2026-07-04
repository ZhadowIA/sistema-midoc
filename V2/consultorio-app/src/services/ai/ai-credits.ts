import { AiUsageStatus, AiUsageType, Prisma } from "@prisma/client";

import { prisma } from "../../lib/prisma";
import { resolveDoctorCapabilities } from "../subscription/subscription-service";

const CREDIT_WARNING_RATIO = 0.8;

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

export interface AiCreditBalanceInput {
  monthlyCredits: number;
  consumedCredits: number;
}

export interface AiCreditBalance {
  monthlyCredits: number;
  consumedCredits: number;
  remainingCredits: number;
  overageCredits: number;
  usageRatio: number;
  nearLimit: boolean;
  shouldBlockUsage: false;
}

export interface AiCreditSummary extends AiCreditBalance {
  periodKey: string;
  periodStart: Date;
  periodEnd: Date;
  planCode: string | null;
  entitled: boolean;
  aiEnabled: boolean;
}

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

export function readAiCreditAllowance(capabilities: unknown): number {
  if (!capabilities || typeof capabilities !== "object") {
    return 0;
  }

  const record = capabilities as Record<string, unknown>;
  if (record.ai !== true) {
    return 0;
  }

  const value = record.aiCreditsMonthly;
  const credits =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : 0;

  if (!Number.isInteger(credits) || credits < 0) {
    return 0;
  }

  return credits;
}

export function calculateAiCreditBalance(input: AiCreditBalanceInput): AiCreditBalance {
  const monthlyCredits = Math.max(0, Math.floor(input.monthlyCredits));
  const consumedCredits = Math.max(0, Math.floor(input.consumedCredits));
  const remainingCredits = Math.max(monthlyCredits - consumedCredits, 0);
  const overageCredits = Math.max(consumedCredits - monthlyCredits, 0);
  const usageRatio = monthlyCredits > 0 ? consumedCredits / monthlyCredits : 0;

  return {
    monthlyCredits,
    consumedCredits,
    remainingCredits,
    overageCredits,
    usageRatio,
    nearLimit: monthlyCredits > 0 && usageRatio >= CREDIT_WARNING_RATIO,
    shouldBlockUsage: false
  };
}

export function utcMonthWindow(referenceDate = new Date()) {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth();
  const periodStart = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0));
  const periodKey = `${year}-${String(month + 1).padStart(2, "0")}`;

  return { periodStart, periodEnd, periodKey };
}

function mergeCapabilityJson(
  base: Prisma.JsonValue | null | undefined,
  patch: Prisma.JsonValue | null | undefined
) {
  return {
    ...((base && typeof base === "object" && !Array.isArray(base) ? base : {}) as Record<
      string,
      unknown
    >),
    ...((patch && typeof patch === "object" && !Array.isArray(patch) ? patch : {}) as Record<
      string,
      unknown
    >)
  };
}

export async function getDoctorAiCreditSummary(
  doctorUserId: string,
  referenceDate = new Date()
): Promise<AiCreditSummary> {
  const subscription = await resolveDoctorCapabilities(doctorUserId);
  const { periodStart, periodEnd, periodKey } = utcMonthWindow(referenceDate);
  const effectivePlanCapabilities =
    subscription.subscription && subscription.entitled
      ? mergeCapabilityJson(
          subscription.subscription.plan.capabilities,
          subscription.subscription.capabilitiesPatch
        )
      : {};
  const monthlyCredits = readAiCreditAllowance(effectivePlanCapabilities);

  const aggregate = await prisma.aiUsageLog.aggregate({
    where: {
      doctorId: doctorUserId,
      createdAt: { gte: periodStart, lt: periodEnd },
      status: { not: AiUsageStatus.FAILED }
    },
    _sum: { creditCost: true }
  });
  const balance = calculateAiCreditBalance({
    monthlyCredits,
    consumedCredits: aggregate._sum.creditCost ?? 0
  });

  return {
    ...balance,
    periodKey,
    periodStart,
    periodEnd,
    planCode: subscription.planCode,
    entitled: subscription.entitled,
    aiEnabled: subscription.capabilities.ai
  };
}
