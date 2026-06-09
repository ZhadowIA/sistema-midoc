import type { AppointmentStatus, PrismaClient } from '@prisma/client'
import { AppointmentAuditService } from '@/services/AppointmentAuditService'
import { AgendaAppointmentInputError } from '@/server/agenda/appointments/errors'

export type ReceptionAction =
  | 'MARK_ARRIVED'
  | 'MARK_WAITING'
  | 'MARK_IN_CONSULTATION'
  | 'MARK_CHECKOUT_PENDING'
  | 'MARK_NO_SHOW'
  | 'MARK_COMPLETED'

const TRANSITION_MAP: Record<ReceptionAction, { from: AppointmentStatus[]; to: AppointmentStatus }> = {
  MARK_ARRIVED: {
    from: ['PENDING', 'CONFIRMED'],
    to: 'ARRIVED',
  },
  MARK_WAITING: {
    from: ['ARRIVED', 'CONFIRMED', 'PENDING'],
    to: 'WAITING',
  },
  MARK_IN_CONSULTATION: {
    from: ['ARRIVED', 'WAITING'],
    to: 'IN_CONSULTATION',
  },
  MARK_CHECKOUT_PENDING: {
    from: ['IN_CONSULTATION'],
    to: 'CHECKOUT_PENDING',
  },
  MARK_NO_SHOW: {
    from: ['PENDING', 'CONFIRMED', 'ARRIVED', 'WAITING'],
    to: 'NO_SHOW',
  },
  MARK_COMPLETED: {
    from: ['CHECKOUT_PENDING', 'IN_CONSULTATION', 'ARRIVED', 'WAITING'],
    to: 'COMPLETED',
  },
}

const ACTION_TO_AUDIT: Record<ReceptionAction, string> = {
  MARK_ARRIVED: 'APPOINTMENT_ARRIVED',
  MARK_WAITING: 'APPOINTMENT_WAITING',
  MARK_IN_CONSULTATION: 'APPOINTMENT_IN_CONSULTATION',
  MARK_CHECKOUT_PENDING: 'APPOINTMENT_CHECKOUT_PENDING',
  MARK_NO_SHOW: 'APPOINTMENT_NO_SHOW',
  MARK_COMPLETED: 'APPOINTMENT_CHECKOUT_COMPLETED',
}

type Input = {
  prisma: PrismaClient
  appointmentId: string
  doctorId: string
  patientId: string
  currentStatus: AppointmentStatus
  action: ReceptionAction
  actorUserId: string
  actorRole: string
  ipAddress: string | null
  userAgent: string | null
}

export async function receptionTransition(input: Input) {
  const rule = TRANSITION_MAP[input.action]
  if (!rule) throw new AgendaAppointmentInputError(`Acción de recepción desconocida: ${input.action}`)

  if (!rule.from.includes(input.currentStatus)) {
    throw new AgendaAppointmentInputError(
      `No se puede aplicar "${input.action}" desde el estado "${input.currentStatus}".`
    )
  }

  const updateData: { status: AppointmentStatus; arrivedAt?: Date } = { status: rule.to }
  if (input.action === 'MARK_ARRIVED') updateData.arrivedAt = new Date()

  await input.prisma.appointment.update({
    where: { id: input.appointmentId },
    data: updateData,
  })

  await AppointmentAuditService.safeLog({
    doctorId: input.doctorId,
    appointmentId: input.appointmentId,
    patientId: input.patientId,
    actorType: 'DOCTOR',
    actorUserId: input.actorUserId,
    source: 'ADMIN_PANEL',
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    action: ACTION_TO_AUDIT[input.action] as Parameters<typeof AppointmentAuditService.safeLog>[0]['action'],
    fromStatus: input.currentStatus,
    toStatus: rule.to,
    metadata: { actorRole: input.actorRole },
  })

  return rule.to
}
