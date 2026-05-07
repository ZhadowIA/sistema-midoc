import { z } from 'zod'
import prisma from '@/lib/prisma'
import { jsonNoStore } from '@/lib/http'
import { requireMedicalDoctorApiAccess } from '@/lib/medicalApi'
import { generatePatientInstructions } from '@/lib/aiNoteService'
import { recordAiUsage, resolvePromptVersion } from '@/lib/aiTelemetry'
import { consumeAICredits, validateAICredits } from '@/lib/aiCreditsMiddleware'

const bodySchema = z.object({
  chiefComplaint: z.string().trim().min(1).max(2_000),
  assessment: z.string().trim().min(1).max(8_000),
  plan: z.string().trim().min(1).max(8_000),
})

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const access = await requireMedicalDoctorApiAccess()
    if (access.response) return access.response
    const doctorId = access.context.doctorId
    const actorUserId = access.context.user.id

    const creditCheck = await validateAICredits(actorUserId, 'patientInstructions')
    if (!creditCheck.hasCredits) {
      return jsonNoStore({ error: creditCheck.error }, { status: 402 })
    }

    const encounter = await prisma.clinicalEncounter.findFirst({
      where: { id: params.id, doctorId },
      select: { id: true, appointmentId: true },
    })
    if (!encounter) {
      return jsonNoStore({ error: 'Encounter no encontrado' }, { status: 404 })
    }

    const doctor = await prisma.user.findUnique({
      where: { id: doctorId },
      select: { specialty: true },
    })

    const body = await request.json()
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return jsonNoStore(
        { error: 'Payload inválido', issues: parsed.error.issues },
        { status: 400 },
      )
    }

    const { instructions, usage } = await generatePatientInstructions({
      chiefComplaint: parsed.data.chiefComplaint,
      assessment: parsed.data.assessment,
      plan: parsed.data.plan,
      specialty: doctor?.specialty ?? null,
    })

    // Record telemetry (non-blocking — errors here must not fail the response)
    recordAiUsage({
      doctorId,
      appointmentId: encounter.appointmentId ?? null,
      sourceModule: 'AI_PATIENT_INSTRUCTIONS',
      provider: 'OPENAI',
      model: usage.model,
      promptVersion: resolvePromptVersion('AI_PATIENT_INSTRUCTIONS'),
      inputTokens: usage.promptTokens,
      outputTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      status: 'COMPLETED',
    }).catch(() => undefined)

    consumeAICredits(
      actorUserId,
      'patientInstructions',
      `Encounter ${encounter.id}: patient instructions`,
    ).catch(() => undefined)

    return jsonNoStore({ instructions })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return jsonNoStore({ error: message }, { status: 500 })
  }
}
