import prisma from '@/lib/prisma'
import { jsonNoStore } from '@/lib/http'
import { requireMedicalDoctorApiAccess } from '@/lib/medicalApi'
import { EncounterHistoryService } from '@/services/EncounterHistoryService'
import { EncounterHistoryPayloadSchema } from '@/lib/encounterHistorySchema'
import { AppointmentAuditService } from '@/services/AppointmentAuditService'
import { AuditActorType, AuditSource } from '@prisma/client'
import { isClinicalHistoryEnabled } from '@/lib/featureFlags'

function disabledResponse() {
  return jsonNoStore({ error: 'Historia clínica no habilitada' }, { status: 404 })
}

async function loadAppointment(appointmentId: string, doctorId: string) {
  return prisma.appointment.findFirst({
    where: { id: appointmentId, doctorId },
    select: { id: true, patientId: true, doctorId: true },
  })
}

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  if (!isClinicalHistoryEnabled()) return disabledResponse()
  const params = await props.params
  try {
    const access = await requireMedicalDoctorApiAccess()
    if (access.response) return access.response
    const doctorId = access.context.doctorId

    const appointment = await loadAppointment(params.id, doctorId)
    if (!appointment) {
      return jsonNoStore({ error: 'Cita no encontrada' }, { status: 404 })
    }

    const result = await EncounterHistoryService.getOrBuildForAppointment(params.id)
    return jsonNoStore({ ...result, patientId: appointment.patientId })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return jsonNoStore({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  if (!isClinicalHistoryEnabled()) return disabledResponse()
  const params = await props.params
  try {
    const access = await requireMedicalDoctorApiAccess()
    if (access.response) return access.response
    const doctorId = access.context.doctorId
    const actorUserId = access.context.user.id

    const appointment = await loadAppointment(params.id, doctorId)
    if (!appointment) {
      return jsonNoStore({ error: 'Cita no encontrada' }, { status: 404 })
    }

    const body = await request.json()
    const parsed = EncounterHistoryPayloadSchema.safeParse(body?.payload ?? body)
    if (!parsed.success) {
      return jsonNoStore(
        { error: 'Payload inválido', issues: parsed.error.issues },
        { status: 400 },
      )
    }

    const saved = await EncounterHistoryService.upsertByAppointmentId(
      params.id,
      appointment.patientId,
      doctorId,
      parsed.data,
      { actorUserId },
    )

    await AppointmentAuditService.safeLog({
      doctorId,
      appointmentId: params.id,
      patientId: appointment.patientId,
      actorType: AuditActorType.DOCTOR,
      actorUserId,
      source: AuditSource.ADMIN_PANEL,
      action: 'ENCOUNTER_HISTORY_UPDATED',
      metadata: { completionPct: saved.completionPct, status: saved.status },
    })

    return jsonNoStore(saved)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return jsonNoStore({ error: message }, { status: 500 })
  }
}
