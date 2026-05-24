import { addMinutes, format } from 'date-fns'
import type { AppointmentStatus, PrismaClient } from '@prisma/client'
import { getWhatsAppProviderJsonHeaders, getWhatsAppProviderSendUrl } from '@/lib/whatsappProvider'
import { formatPatientName } from '@/lib/patientName'
import { AppointmentAuditService } from '@/services/AppointmentAuditService'
import {
  AgendaAppointmentConflictError,
  AgendaAppointmentInputError,
} from '@/server/agenda/appointments/errors'

type ExistingAppointment = {
  id: string
  doctorId: string
  patientId: string
  status: AppointmentStatus
  durationMin: number
  startTime: Date
  endTime: Date
  notes: string | null
}

type RescheduleAppointmentInput = {
  prisma: PrismaClient
  appointmentId: string
  doctorId: string
  existing: ExistingAppointment
  actorUserId: string
  actorRole: string
  ipAddress: string | null
  userAgent: string | null
  newStartTime: unknown
  notes: unknown
}

export async function rescheduleAppointment(input: RescheduleAppointmentInput) {
  if (input.existing.status === 'CANCELLED' || input.existing.status === 'COMPLETED') {
    throw new AgendaAppointmentConflictError(
      'INVALID_STATE',
      'No se puede reagendar una cita cancelada o completada.',
    )
  }

  if (!input.newStartTime || typeof input.newStartTime !== 'string') {
    throw new AgendaAppointmentInputError('Falta newStartTime')
  }

  const newStart = new Date(input.newStartTime)
  if (Number.isNaN(newStart.getTime())) {
    throw new AgendaAppointmentInputError('Fecha/hora inválida')
  }
  const newEnd = addMinutes(newStart, input.existing.durationMin)

  const overlapAppointment = await input.prisma.appointment.findFirst({
    where: {
      doctorId: input.doctorId,
      id: { not: input.appointmentId },
      status: { notIn: ['CANCELLED'] },
      startTime: { lt: newEnd },
      endTime: { gt: newStart },
    },
  })
  if (overlapAppointment) {
    throw new AgendaAppointmentConflictError('OVERLAP', 'Ya hay una cita agendada en este horario.')
  }

  const overlapBlock = await input.prisma.scheduleBlock.findFirst({
    where: {
      doctorId: input.doctorId,
      startTime: { lt: newEnd },
      endTime: { gt: newStart },
    },
  })
  if (overlapBlock) {
    throw new AgendaAppointmentConflictError('BLOCKED', 'Ese horario está bloqueado en agenda.')
  }

  const localDate = new Date(newStart)
  localDate.setHours(0, 0, 0, 0)

  const updated = await input.prisma.appointment.update({
    where: { id: input.appointmentId },
    data: {
      date: localDate,
      startTime: newStart,
      endTime: newEnd,
      notes: input.notes !== undefined ? (input.notes as string | null) : input.existing.notes,
      status: input.existing.status === 'PENDING' ? 'PENDING' : 'CONFIRMED',
    },
    include: { patient: true, questionnaire: true, doctor: true },
  })

  await AppointmentAuditService.safeLog({
    doctorId: input.doctorId,
    appointmentId: updated.id,
    patientId: updated.patientId,
    actorType: 'DOCTOR',
    actorUserId: input.actorUserId,
    source: 'ADMIN_PANEL',
    action: 'APPOINTMENT_RESCHEDULED',
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    fromStatus: input.existing.status,
    toStatus: updated.status,
    metadata: {
      previousStartTime: input.existing.startTime.toISOString(),
      previousEndTime: input.existing.endTime.toISOString(),
      nextStartTime: updated.startTime.toISOString(),
      nextEndTime: updated.endTime.toISOString(),
      actorRole: input.actorRole,
      delegatedDoctorId: input.doctorId !== input.actorUserId ? input.doctorId : null,
    },
  })

  const config = await input.prisma.doctorConfig.findUnique({ where: { doctorId: input.doctorId } })
  if (config?.whatsappConnected) {
    const msg = `Hola *${formatPatientName(updated.patient)}*, te informamos que tu cita fue reagendada. Nueva fecha y hora: *${format(updated.startTime, 'dd/MM/yyyy HH:mm')}*.`
    try {
      await fetch(getWhatsAppProviderSendUrl(), {
        method: 'POST',
        headers: getWhatsAppProviderJsonHeaders(),
        body: JSON.stringify({ doctorId: input.doctorId, to: updated.patient.phone, message: msg }),
      })
    } catch (err) {
      console.error('Error WA Admin:', err)
    }
  }

  return updated
}
