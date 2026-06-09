import prisma from '@/lib/prisma'
import { jsonNoStore } from '@/lib/http'
import { requireMedicalDoctorApiAccess } from '@/lib/medicalApi'
import { getEnabledFeatures } from '@/lib/featureFlags'
import { EncounterHistoryService } from '@/services/EncounterHistoryService'
import { z } from 'zod'
import { ConsultationMode, AiConsentState } from '@prisma/client'
import { resolveCapabilities } from '@/lib/capabilities'

const bodySchema = z.object({
  consultationMode: z.nativeEnum(ConsultationMode).optional(),
  aiConsent: z.nativeEnum(AiConsentState).optional(),
})

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const access = await requireMedicalDoctorApiAccess()
    if (access.response) return access.response
    const doctorId = access.context.doctorId
    const actorUserId = access.context.user.id
    const features = await getEnabledFeatures(doctorId)
    const capabilities = resolveCapabilities({
      features,
      hasAppointmentContext: true,
    })
    if (!capabilities.clinicalUnified.enabled) {
      return jsonNoStore(
        {
          error: 'Modo consulta unificado no habilitado',
          capabilities,
        },
        { status: 404 },
      )
    }

    const encounter = await prisma.clinicalEncounter.findFirst({
      where: { id: params.id, doctorId },
      select: { id: true, patientId: true, appointmentId: true },
    })
    if (!encounter) {
      return jsonNoStore({ error: 'Encounter no encontrado' }, { status: 404 })
    }

    const parsed = bodySchema.safeParse(await request.json())
    if (!parsed.success) {
      return jsonNoStore(
        { error: 'Payload inválido', issues: parsed.error.issues },
        { status: 400 },
      )
    }

    await EncounterHistoryService.setSessionByClinicalEncounterId({
      clinicalEncounterId: encounter.id,
      appointmentId: encounter.appointmentId,
      patientId: encounter.patientId,
      doctorId,
      consultationMode: parsed.data.consultationMode,
      aiConsent: parsed.data.aiConsent,
      actorUserId,
    })

    if (parsed.data.consultationMode) {
      await prisma.doctorConfig.updateMany({
        where: { doctorId },
        data: { preferredConsultationMode: parsed.data.consultationMode },
      })
    }

    const updated = await prisma.encounterHistory.findUnique({
      where: { clinicalEncounterId: encounter.id },
      select: {
        consultationMode: true,
        aiConsent: true,
        aiConsentDecidedAt: true,
        aiConsentActorUserId: true,
      },
    })
    return jsonNoStore({ session: updated })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return jsonNoStore({ error: message }, { status: 500 })
  }
}
