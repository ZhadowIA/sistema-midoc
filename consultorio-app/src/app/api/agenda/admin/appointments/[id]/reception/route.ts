import { z } from 'zod'
import prisma from '@/lib/prisma'
import { jsonNoStore } from '@/lib/http'
import { requireAgendaDoctorApiAccess } from '@/lib/medicalApi'
import { getRequestIp, getUserAgent } from '@/lib/requestContext'
import { can, PERMISSIONS } from '@/lib/permissions'
import { receptionTransition, type ReceptionAction } from '@/server/agenda/appointments/receptionTransition'
import { AgendaAppointmentInputError } from '@/server/agenda/appointments/errors'

const schema = z.object({
  action: z.enum([
    'MARK_ARRIVED',
    'MARK_WAITING',
    'MARK_IN_CONSULTATION',
    'MARK_CHECKOUT_PENDING',
    'MARK_NO_SHOW',
    'MARK_COMPLETED',
  ]),
})

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  try {
    const access = await requireAgendaDoctorApiAccess({ allowSecretary: true })
    if (access.response) return access.response
    const authUser = access.context.user

    if (!can(authUser, PERMISSIONS.APPOINTMENT_UPDATE)) {
      return jsonNoStore({ error: 'No autorizado' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const parsed = schema.safeParse(body)
    if (!parsed.success) {
      return jsonNoStore({ error: 'Acción inválida', details: parsed.error.issues }, { status: 400 })
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: params.id },
      select: { id: true, doctorId: true, patientId: true, status: true },
    })

    if (!appointment) return jsonNoStore({ error: 'Cita no encontrada' }, { status: 404 })

    if (authUser.role !== 'CLINIC_ADMIN' && appointment.doctorId !== authUser.id) {
      const isSecretary = authUser.role === 'SECRETARY'
      if (!isSecretary) return jsonNoStore({ error: 'No autorizado' }, { status: 403 })
    }

    const newStatus = await receptionTransition({
      prisma,
      appointmentId: appointment.id,
      doctorId: appointment.doctorId,
      patientId: appointment.patientId,
      currentStatus: appointment.status,
      action: parsed.data.action as ReceptionAction,
      actorUserId: authUser.id,
      actorRole: authUser.role,
      ipAddress: getRequestIp(request),
      userAgent: getUserAgent(request),
    })

    return jsonNoStore({ ok: true, status: newStatus })
  } catch (error: unknown) {
    if (error instanceof AgendaAppointmentInputError) {
      return jsonNoStore({ error: error.message }, { status: 422 })
    }
    const message = error instanceof Error ? error.message : 'Error interno'
    return jsonNoStore({ error: message }, { status: 500 })
  }
}
