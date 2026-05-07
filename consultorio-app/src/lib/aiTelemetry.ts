import prisma from '@/lib/prisma'
import { AI_MODEL_PRICING_USD, DEFAULT_AI_MODEL_PRICE } from '@/lib/aiPricing'
import type { Prisma } from '@prisma/client'

export type AIUsageEventStatus = 'COMPLETED' | 'FAILED'

export type AIUsageSourceModule =
  | 'AI_NOTE_GENERATE_AUDIO'
  | 'AI_NOTE_GENERATE_TRANSCRIPT'
  | 'AI_INSIGHTS'
  | 'AI_PRESCRIPTION_VALIDATE'
  | 'AI_CLINICAL_GAPS'
  | 'AI_QUESTIONNAIRE_INTERVIEW'
  | 'AI_PATIENT_INSTRUCTIONS'

export type AIUsageEventInput = {
  doctorId: string
  clinicId?: string | null
  appointmentId?: string | null
  jobId?: string | null
  sourceModule: AIUsageSourceModule
  provider: string
  model: string
  promptVersion: string
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  estimatedCostUsd?: number
  currency?: string
  durationMs?: number | null
  status: AIUsageEventStatus
  errorCode?: string | null
  metadata?: Prisma.InputJsonValue | null
  createdAt?: Date
}

export function estimateAiCost(params: {
  model: string
  inputTokens: number
  outputTokens: number
}): number {
  const modelPrice = AI_MODEL_PRICING_USD[params.model] ?? DEFAULT_AI_MODEL_PRICE
  const inputCost = (Math.max(0, params.inputTokens) / 1000) * modelPrice.inputPer1kUsd
  const outputCost = (Math.max(0, params.outputTokens) / 1000) * modelPrice.outputPer1kUsd
  return Number((inputCost + outputCost).toFixed(6))
}

export function resolvePromptVersion(kind: AIUsageSourceModule): string {
  const versions: Record<AIUsageSourceModule, string> = {
    AI_NOTE_GENERATE_AUDIO: 'v1-soap-dictation-4o',
    AI_NOTE_GENERATE_TRANSCRIPT: 'v1-soap-dictation-4o',
    AI_INSIGHTS: 'v1-insights-4o',
    AI_PRESCRIPTION_VALIDATE: 'v1-pharmacovigilance-4o',
    AI_CLINICAL_GAPS: 'v1-clinical-gaps-4o',
    AI_QUESTIONNAIRE_INTERVIEW: 'v1-questionnaire-interview-4o',
    AI_PATIENT_INSTRUCTIONS: 'v1-patient-instructions-4o',
  }
  return versions[kind]
}

export function getMonthlyUsagePeriod(date: Date = new Date()): { periodStart: Date; periodEnd: Date } {
  const periodStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0))
  const periodEnd = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0, 0))
  return { periodStart, periodEnd }
}

async function upsertMonthlyUsageSummary(input: {
  doctorId: string
  clinicId?: string | null
  sourceModule: AIUsageSourceModule
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  estimatedCostUsd: number
  currency: string
  status: AIUsageEventStatus
  createdAt: Date
}) {
  const monthlySummaryDelegate = (prisma as unknown as {
    aIUsageMonthlySummary?: {
      upsert: (args: unknown) => Promise<unknown>
    }
  }).aIUsageMonthlySummary

  if (!monthlySummaryDelegate) return null

  const { periodStart, periodEnd } = getMonthlyUsagePeriod(input.createdAt)
  const isCompleted = input.status === 'COMPLETED'

  return monthlySummaryDelegate.upsert({
    where: {
      doctorId_periodStart_sourceModule_provider_model: {
        doctorId: input.doctorId,
        periodStart,
        sourceModule: input.sourceModule,
        provider: input.provider,
        model: input.model,
      },
    },
    update: {
      clinicId: input.clinicId ?? null,
      periodEnd,
      usageCount: { increment: 1 },
      successCount: { increment: isCompleted ? 1 : 0 },
      failureCount: { increment: isCompleted ? 0 : 1 },
      inputTokens: { increment: input.inputTokens },
      outputTokens: { increment: input.outputTokens },
      totalTokens: { increment: input.totalTokens },
      estimatedCostUsd: { increment: input.estimatedCostUsd },
      currency: input.currency,
    },
    create: {
      doctorId: input.doctorId,
      clinicId: input.clinicId ?? null,
      periodStart,
      periodEnd,
      sourceModule: input.sourceModule,
      provider: input.provider,
      model: input.model,
      usageCount: 1,
      successCount: isCompleted ? 1 : 0,
      failureCount: isCompleted ? 0 : 1,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      totalTokens: input.totalTokens,
      estimatedCostUsd: input.estimatedCostUsd,
      currency: input.currency,
    },
  })
}

export async function recordAiUsage(input: AIUsageEventInput) {
  const inputTokens = Math.max(0, input.inputTokens ?? 0)
  const outputTokens = Math.max(0, input.outputTokens ?? 0)
  const totalTokens = Math.max(0, input.totalTokens ?? inputTokens + outputTokens)
  const createdAt = input.createdAt ?? new Date()
  const currency = input.currency ?? 'USD'
  const estimatedCostUsd =
    typeof input.estimatedCostUsd === 'number'
      ? input.estimatedCostUsd
      : estimateAiCost({ model: input.model, inputTokens, outputTokens })

  const event = await prisma.aIUsageEvent.create({
    data: {
      doctorId: input.doctorId,
      clinicId: input.clinicId ?? null,
      appointmentId: input.appointmentId ?? null,
      jobId: input.jobId ?? null,
      sourceModule: input.sourceModule,
      provider: input.provider,
      model: input.model,
      promptVersion: input.promptVersion,
      inputTokens,
      outputTokens,
      totalTokens,
      estimatedCostUsd,
      currency,
      durationMs: input.durationMs ?? null,
      status: input.status,
      errorCode: input.errorCode ?? null,
      metadata: input.metadata ?? undefined,
      createdAt,
    },
  })

  await upsertMonthlyUsageSummary({
    doctorId: input.doctorId,
    clinicId: input.clinicId ?? null,
    sourceModule: input.sourceModule,
    provider: input.provider,
    model: input.model,
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCostUsd,
    currency,
    status: input.status,
    createdAt,
  }).catch((error) => {
    console.error('[aiTelemetry] monthly summary upsert failed:', error)
  })

  return event
}
