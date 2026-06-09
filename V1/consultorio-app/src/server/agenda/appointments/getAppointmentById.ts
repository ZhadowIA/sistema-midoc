import type { PrismaClient } from '@prisma/client'
import { can, PERMISSIONS } from '@/lib/permissions'
import {
  AgendaAppointmentForbiddenError,
  AgendaAppointmentNotFoundError,
} from '@/server/agenda/appointments/errors'

type GetAppointmentByIdInput = {
  actorUserId: string
  appointmentId: string
}

export async function getAppointmentById(
  prisma: PrismaClient,
  input: GetAppointmentByIdInput,
) {
  const actor = await prisma.user.findUnique({
    where: { id: input.actorUserId },
    select: { id: true, role: true, clinicId: true },
  })
  if (!actor) {
    throw new AgendaAppointmentForbiddenError('No autorizado')
  }

  const appointment = await prisma.appointment.findFirst({
    where: { id: input.appointmentId },
    include: {
      patient: true,
      questionnaire: true,
      doctor: { select: { id: true, name: true, clinicId: true } },
      consentCaptures: { orderBy: { createdAt: 'desc' }, take: 5 },
    },
  })
  if (!appointment) {
    throw new AgendaAppointmentNotFoundError('Cita no encontrada')
  }

  const isOwnAgenda = appointment.doctorId === actor.id
  const canManageClinicDoctor =
    can(actor.role, PERMISSIONS.CLINIC_MANAGE_DOCTORS) &&
    Boolean(actor.clinicId) &&
    appointment.doctor.clinicId === actor.clinicId

  if (!isOwnAgenda && !canManageClinicDoctor) {
    throw new AgendaAppointmentForbiddenError('No autorizado')
  }

  return appointment
}

