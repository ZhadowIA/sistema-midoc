import prisma from '@/lib/prisma'
import { jsonNoStore } from '@/lib/http'
import { requireMedicalDoctorApiAccess } from '@/lib/medicalApi'
import { getEnabledFeatures } from '@/lib/featureFlags'
import { resolveCapabilities } from '@/lib/capabilities'
import { llmGapAnalysis, deterministicGapAnalysis, dedupeGaps } from '@/lib/clinicalGapsService'
import { recordAiUsage, estimateAiCost } from '@/lib/aiTelemetry'
import { consumeAICredits, validateAICredits } from '@/lib/aiCreditsMiddleware'
import type { ClinicalHistoryPayload } from '@/lib/clinicalHistorySchema'
import type { EncounterHistoryPayload } from '@/lib/encounterHistorySchema'
import { withEndpointObservability } from '@/lib/observability'

export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params

  return withEndpointObservability(
    { endpoint: 'api.clinical.gaps', method: 'POST' },
    async () => {
      const access = await requireMedicalDoctorApiAccess()
      if (access.response) return access.response
      const doctorId = access.context.doctorId
      const actorUserId = access.context.user.id

      const encounter = await prisma.clinicalEncounter.findFirst({
        where: { id: params.id, doctorId },
        select: {
          id: true,
          patientId: true,
          appointmentId: true,
          patient: {
            select: {
              medicalRecord: true,
              clinicalHistory: { select: { payload: true } },
            },
          },
          encounterHistory: { select: { payload: true } },
          clinicalNote: {
            select: {
              subjective: true,
              objective: true,
              assessment: true,
              plan: true,
              prescriptions: {
                select: { medication: true, dosage: true },
              },
            },
          },
        },
      })

      if (!encounter) {
        return jsonNoStore({ error: 'Encounter no encontrado' }, { status: 404 })
      }

      const features = await getEnabledFeatures(doctorId)
      const capabilities = resolveCapabilities({
        features,
        hasAppointmentContext: Boolean(encounter.appointmentId),
      })

      const clinicalHistory = (encounter.patient.clinicalHistory?.payload ?? null) as ClinicalHistoryPayload | null
      const encounterPayload = (encounter.encounterHistory?.payload ?? null) as EncounterHistoryPayload | null

      const deterministicGaps = deterministicGapAnalysis({
        clinicalHistory,
        medicalRecord: encounter.patient.medicalRecord,
        encounterPayload,
      })

      if (!capabilities.aiConsultation.enabled) {
        return jsonNoStore({ gaps: dedupeGaps(deterministicGaps) })
      }

      const creditCheck = await validateAICredits(actorUserId, 'insights')
      if (!creditCheck.hasCredits) {
        return jsonNoStore({
          gaps: dedupeGaps(deterministicGaps),
          warning: 'IA sin créditos suficientes; se devolvió análisis determinístico.',
        })
      }

      // Full hybrid analysis
      const startMs = Date.now()
      const soapNote = {
        subjective: encounter.clinicalNote?.subjective ?? undefined,
        objective: encounter.clinicalNote?.objective ?? undefined,
        assessment: encounter.clinicalNote?.assessment ?? undefined,
        plan: encounter.clinicalNote?.plan ?? undefined,
      }
      const prescriptions = (encounter.clinicalNote?.prescriptions ?? []).map((p) => ({
        medication: p.medication,
        dosage: p.dosage ?? undefined,
      }))

      const llmResult = await llmGapAnalysis({
        clinicalHistory,
        medicalRecord: encounter.patient.medicalRecord,
        encounterPayload,
        soapNote,
        prescriptions,
      })

      const allGaps = dedupeGaps([...deterministicGaps, ...llmResult.gaps])

      // Record AI usage telemetry (fire-and-forget)
      recordAiUsage({
        doctorId,
        appointmentId: encounter.appointmentId,
        sourceModule: 'AI_CLINICAL_GAPS',
        provider: 'openai',
        model: llmResult.usage.model,
        promptVersion: 'v1-clinical-gaps-4o',
        inputTokens: llmResult.usage.promptTokens,
        outputTokens: llmResult.usage.completionTokens,
        totalTokens: llmResult.usage.totalTokens,
        estimatedCostUsd: estimateAiCost({
          model: llmResult.usage.model,
          inputTokens: llmResult.usage.promptTokens,
          outputTokens: llmResult.usage.completionTokens,
        }),
        durationMs: Date.now() - startMs,
        status: 'COMPLETED',
      }).catch((err) => {
        console.error('Failed to record AI usage for clinical-gaps', err)
      })

      consumeAICredits(
        actorUserId,
        'insights',
        `Encounter ${encounter.id}: clinical gaps`,
      ).catch(() => undefined)

      return jsonNoStore({ gaps: allGaps })
    },
  )
}
