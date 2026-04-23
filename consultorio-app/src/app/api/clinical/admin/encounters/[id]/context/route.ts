import prisma from '@/lib/prisma'
import { jsonNoStore } from '@/lib/http'
import { requireMedicalDoctorApiAccess } from '@/lib/medicalApi'
import { getEnabledFeatures } from '@/lib/featureFlags'
import { resolveConsultationSession } from '@/lib/consultationWorkspace'
import { EncounterHistoryService } from '@/services/EncounterHistoryService'
import { resolveCapabilities } from '@/lib/capabilities'

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const access = await requireMedicalDoctorApiAccess()
    if (access.response) return access.response
    const doctorId = access.context.doctorId

    const encounter = await prisma.clinicalEncounter.findFirst({
      where: { id: params.id, doctorId },
      select: {
        id: true,
        appointmentId: true,
        status: true,
        patientId: true,
        source: true,
        patient: {
          select: {
            id: true,
            firstName: true,
            lastNamePaternal: true,
            lastNameMaternal: true,
            phone: true,
          },
        },
        appointment: {
          select: {
            id: true,
            status: true,
            questionnaireAnswered: true,
            clinicalNote: { select: { id: true, signedAt: true } },
          },
        },
      },
    })

    if (!encounter) {
      return jsonNoStore({ error: 'Encounter no encontrado' }, { status: 404 })
    }

    const history = await EncounterHistoryService.getOrBuildForClinicalEncounter({
      clinicalEncounterId: encounter.id,
      appointmentId: encounter.appointmentId,
    })

    const existingSession = history.built
      ? null
      : await prisma.encounterHistory.findUnique({
          where: { clinicalEncounterId: encounter.id },
          select: { consultationMode: true, aiConsent: true, aiConsentDecidedAt: true },
        })

    const doctorConfig = await prisma.doctorConfig.findUnique({
      where: { doctorId },
      select: { preferredConsultationMode: true },
    })
    const features = await getEnabledFeatures(doctorId)
    const capabilities = resolveCapabilities({
      features,
      hasAppointmentContext: Boolean(encounter.appointmentId),
    })
    if (!capabilities.clinicalUnified.enabled) {
      console.info('clinical.context.disabled', {
        doctorId,
        encounterId: params.id,
        reasonCode: capabilities.clinicalUnified.reasonCode,
      })
      return jsonNoStore(
        {
          error: 'Modo consulta unificado no habilitado',
          capabilities,
        },
        { status: 404 },
      )
    }

    const isReadOnly = Boolean(encounter.appointment?.clinicalNote?.signedAt)
    const session = resolveConsultationSession({
      isReadOnly,
      existing: existingSession,
      preferredConsultationMode: doctorConfig?.preferredConsultationMode ?? null,
    })

    return jsonNoStore({
      encounter: {
        id: encounter.id,
        source: encounter.source,
        status: encounter.status,
        appointmentId: encounter.appointmentId,
      },
      appointment: {
        id: encounter.appointment?.id ?? null,
        patientId: encounter.patientId,
        patient: encounter.patient,
        questionnaireAnswered: encounter.appointment?.questionnaireAnswered ?? false,
      },
      encounterHistory: {
        record: history.record,
        built: history.built,
      },
      session,
      capabilities: {
        aiAvailable: capabilities.aiConsultation.enabled,
        ai: capabilities.aiConsultation,
        clinicalUnified: capabilities.clinicalUnified,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return jsonNoStore({ error: message }, { status: 500 })
  }
}
