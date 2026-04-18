import prisma from '@/lib/prisma'
import { jsonNoStore } from '@/lib/http'
import { requireMedicalDoctorApiAccess } from '@/lib/medicalApi'
import {
  isAiAvailableOnServer,
  isClinicalHistoryEnabled,
  isConsultaUnifiedEnabled,
} from '@/lib/featureFlags'
import { EncounterHistoryService } from '@/services/EncounterHistoryService'

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  if (!isConsultaUnifiedEnabled() || !isClinicalHistoryEnabled()) {
    return jsonNoStore({ error: 'Modo consulta unificado no habilitado' }, { status: 404 })
  }
  const params = await props.params
  try {
    const access = await requireMedicalDoctorApiAccess()
    if (access.response) return access.response
    const doctorId = access.context.doctorId

    const appointment = await prisma.appointment.findFirst({
      where: { id: params.id, doctorId },
      select: {
        id: true,
        date: true,
        startTime: true,
        status: true,
        appointmentType: true,
        patientId: true,
        questionnaireAnswered: true,
        patient: {
          select: {
            id: true,
            fullName: true,
            dateOfBirth: true,
            phone: true,
          },
        },
        clinicalNote: {
          select: { id: true, signedAt: true },
        },
      },
    })
    if (!appointment) {
      return jsonNoStore({ error: 'Cita no encontrada' }, { status: 404 })
    }

    const encounter = await EncounterHistoryService.getOrBuildForAppointment(
      appointment.id,
    )
    const existing = await prisma.encounterHistory.findUnique({
      where: { appointmentId: appointment.id },
      select: { consultationMode: true, aiConsent: true, aiConsentDecidedAt: true },
    })
    const doctorConfig = await prisma.doctorConfig.findUnique({
      where: { doctorId },
      select: { preferredConsultationMode: true },
    })

    return jsonNoStore({
      appointment,
      encounter,
      session: {
        consultationMode:
          existing?.consultationMode ??
          doctorConfig?.preferredConsultationMode ??
          'MANUAL',
        aiConsent: existing?.aiConsent ?? 'PENDING',
        aiConsentDecidedAt: existing?.aiConsentDecidedAt ?? null,
      },
      capabilities: {
        aiAvailable: isAiAvailableOnServer(),
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return jsonNoStore({ error: message }, { status: 500 })
  }
}
