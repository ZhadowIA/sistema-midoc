import prisma from '@/lib/prisma'
import { jsonNoStore } from '@/lib/http'
import { requireMedicalDoctorApiAccess } from '@/lib/medicalApi'
import {
  isAiAvailableOnServer,
  isClinicalHistoryEnabled,
} from '@/lib/featureFlags'
import {
  resolveConsultationSession,
  shouldSkipSessionQueries,
} from '@/lib/consultationWorkspace'
import { EncounterHistoryService } from '@/services/EncounterHistoryService'

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  if (!isClinicalHistoryEnabled()) {
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
            firstName: true,
            lastNamePaternal: true,
            lastNameMaternal: true,
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
    const isReadOnly = shouldSkipSessionQueries({
      appointmentStatus: appointment.status,
      noteSignedAt: appointment.clinicalNote?.signedAt ?? null,
    })
    const existing = isReadOnly
      ? null
      : await prisma.encounterHistory.findUnique({
          where: { appointmentId: appointment.id },
          select: { consultationMode: true, aiConsent: true, aiConsentDecidedAt: true },
        })
    const doctorConfig = isReadOnly
      ? null
      : await prisma.doctorConfig.findUnique({
          where: { doctorId },
          select: { preferredConsultationMode: true },
        })
    const session = resolveConsultationSession({
      isReadOnly,
      existing,
      preferredConsultationMode: doctorConfig?.preferredConsultationMode ?? null,
    })

    return jsonNoStore({
      appointment: {
        ...appointment,
      },
      encounter,
      session,
      capabilities: {
        aiAvailable: isAiAvailableOnServer(),
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return jsonNoStore({ error: message }, { status: 500 })
  }
}
