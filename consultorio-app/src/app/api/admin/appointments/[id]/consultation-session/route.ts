import prisma from '@/lib/prisma'
import { jsonNoStore } from '@/lib/http'
import { requireMedicalDoctorApiAccess } from '@/lib/medicalApi'
import {
  isClinicalHistoryEnabled,
} from '@/lib/featureFlags'
import { EncounterHistoryService } from '@/services/EncounterHistoryService'
import { z } from 'zod'
import { ConsultationMode, AiConsentState } from '@prisma/client'

const bodySchema = z.object({
  consultationMode: z.nativeEnum(ConsultationMode).optional(),
  aiConsent: z.nativeEnum(AiConsentState).optional(),
})

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  if (!isClinicalHistoryEnabled()) {
    return jsonNoStore({ error: 'Modo consulta unificado no habilitado' }, { status: 404 })
  }
  const params = await props.params
  try {
    const access = await requireMedicalDoctorApiAccess()
    if (access.response) return access.response
    const doctorId = access.context.doctorId
    const actorUserId = access.context.user.id

    const appointment = await prisma.appointment.findFirst({
      where: { id: params.id, doctorId },
      select: { id: true, patientId: true },
    })
    if (!appointment) {
      return jsonNoStore({ error: 'Cita no encontrada' }, { status: 404 })
    }

    const parsed = bodySchema.safeParse(await request.json())
    if (!parsed.success) {
      return jsonNoStore(
        { error: 'Payload inválido', issues: parsed.error.issues },
        { status: 400 },
      )
    }

    if (parsed.data.consultationMode) {
      await EncounterHistoryService.setConsultationMode(
        appointment.id,
        appointment.patientId,
        doctorId,
        parsed.data.consultationMode,
      )
      await prisma.doctorConfig.updateMany({
        where: { doctorId },
        data: { preferredConsultationMode: parsed.data.consultationMode },
      })
    }
    if (parsed.data.aiConsent) {
      await EncounterHistoryService.setAiConsent(
        appointment.id,
        appointment.patientId,
        doctorId,
        parsed.data.aiConsent,
        actorUserId,
      )
    }

    const updated = await prisma.encounterHistory.findUnique({
      where: { appointmentId: appointment.id },
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
