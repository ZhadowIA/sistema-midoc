import { z } from 'zod'
import prisma from '@/lib/prisma'
import { jsonNoStore } from '@/lib/http'
import { requireAgendaDoctorApiAccess } from '@/lib/medicalApi'
import { getRequestIp, getUserAgent } from '@/lib/requestContext'
import { can, PERMISSIONS } from '@/lib/permissions'
import { AppointmentAuditService } from '@/services/AppointmentAuditService'
import { AgendaAppointmentInputError } from '@/server/agenda/appointments/errors'

const VALID_FROM_STATUSES = ['CHECKOUT_PENDING', 'IN_CONSULTATION', 'ARRIVED', 'WAITING', 'CONFIRMED', 'PENDING'] as const

const schema = z.object({
  concept:  z.string().trim().min(1).max(200),
  amount:   z.number().positive().max(999_999),
  method:   z.enum(['CASH', 'CARD', 'TRANSFER', 'OTHER']),
  notes:    z.string().max(500).optional().nullable(),
})

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params

  const access = await requireAgendaDoctorApiAccess({ allowSecretary: true })
  if (access.response) return access.response
  const authUser = access.context.user

  if (!can(authUser, PERMISSIONS.APPOINTMENT_UPDATE)) {
    return jsonNoStore({ error: 'No autorizado' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return jsonNoStore({ error: 'Datos inválidos', details: parsed.error.issues }, { status: 400 })
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: params.id },
    select: {
      id: true, doctorId: true, patientId: true,
      status: true, appointmentType: true,
      patient: { select: { firstName: true, lastNamePaternal: true } },
    },
  })

  if (!appointment) return jsonNoStore({ error: 'Cita no encontrada' }, { status: 404 })

  // Ownership check — secretary or clinic admin can act on behalf
  const isOwner = appointment.doctorId === authUser.id
  const isDelegate = authUser.role === 'SECRETARY' || authUser.role === 'CLINIC_ADMIN'
  if (!isOwner && !isDelegate) {
    return jsonNoStore({ error: 'No autorizado' }, { status: 403 })
  }

  if (!(VALID_FROM_STATUSES as readonly string[]).includes(appointment.status)) {
    throw new AgendaAppointmentInputError(
      `No se puede cobrar una cita en estado "${appointment.status}".`
    )
  }

  const { concept, amount, method, notes } = parsed.data
  const now = new Date()

  try {
    // Atomic: create cash entry + transition appointment to COMPLETED
    const [cashEntry] = await prisma.$transaction([
      prisma.dailyCashEntry.create({
        data: {
          doctorId:     appointment.doctorId,
          actorUserId:  authUser.id,
          appointmentId: appointment.id,
          concept,
          amount,
          method,
          notes: notes ?? null,
          date:  now,
        },
      }),
      prisma.appointment.update({
        where: { id: appointment.id },
        data:  { status: 'COMPLETED' },
      }),
    ])

    await AppointmentAuditService.safeLog({
      doctorId:     appointment.doctorId,
      appointmentId: appointment.id,
      patientId:    appointment.patientId,
      actorType:    'DOCTOR',
      actorUserId:  authUser.id,
      source:       'ADMIN_PANEL',
      ipAddress:    getRequestIp(request),
      userAgent:    getUserAgent(request),
      action:       'APPOINTMENT_CHECKOUT_COMPLETED',
      fromStatus:   appointment.status,
      toStatus:     'COMPLETED',
      metadata: {
        actorRole: authUser.role,
        cashEntryId: cashEntry.id,
        amount: Number(amount),
        method,
      },
    })

    return jsonNoStore({
      ok: true,
      status: 'COMPLETED',
      cashEntryId: cashEntry.id,
    }, { status: 201 })
  } catch (err) {
    if (err instanceof AgendaAppointmentInputError) {
      return jsonNoStore({ error: err.message }, { status: 422 })
    }
    const msg = err instanceof Error ? err.message : 'Error interno'
    return jsonNoStore({ error: msg }, { status: 500 })
  }
}
