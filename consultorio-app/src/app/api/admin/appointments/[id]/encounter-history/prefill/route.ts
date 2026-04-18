import prisma from '@/lib/prisma'
import { jsonNoStore } from '@/lib/http'
import { requireMedicalDoctorApiAccess } from '@/lib/medicalApi'
import { QuestionnaireService } from '@/services/QuestionnaireService'
import { EncounterHistoryService } from '@/services/EncounterHistoryService'
import { AppointmentAuditService } from '@/services/AppointmentAuditService'
import { AuditActorType, AuditSource } from '@prisma/client'
import { isClinicalHistoryEnabled } from '@/lib/featureFlags'

export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  if (!isClinicalHistoryEnabled()) {
    return jsonNoStore({ error: 'Historia clínica no habilitada' }, { status: 404 })
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

    const existing = await EncounterHistoryService.getByAppointmentId(params.id)
    if (existing) {
      return jsonNoStore(
        {
          error: 'El encuentro clínico ya existe; use PATCH para actualizarlo.',
          record: existing,
        },
        { status: 409 },
      )
    }

    const { payload, source } = await QuestionnaireService.buildEncounterPrefill(params.id)
    if (source === 'empty') {
      return jsonNoStore(
        { error: 'No hay cuestionario previo; no se puede prellenar.' },
        { status: 422 },
      )
    }

    const saved = await EncounterHistoryService.upsertByAppointmentId(
      params.id,
      appointment.patientId,
      doctorId,
      payload,
      { prefilledFromQuestionnaire: true, actorUserId },
    )

    await AppointmentAuditService.safeLog({
      doctorId,
      appointmentId: params.id,
      patientId: appointment.patientId,
      actorType: AuditActorType.DOCTOR,
      actorUserId,
      source: AuditSource.ADMIN_PANEL,
      action: 'ENCOUNTER_HISTORY_UPDATED',
      metadata: { prefilledFromQuestionnaire: true, completionPct: saved.completionPct },
    })

    return jsonNoStore(saved, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return jsonNoStore({ error: message }, { status: 500 })
  }
}
