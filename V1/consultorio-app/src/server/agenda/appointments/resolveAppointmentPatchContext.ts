import type { PrismaClient } from '@prisma/client'
import { can, PERMISSIONS } from '@/lib/permissions'
import {
  AgendaAppointmentForbiddenError,
  AgendaAppointmentNotFoundError,
} from '@/server/agenda/appointments/errors'

type ResolveAppointmentPatchContextInput = {
  actorUserId: string
  appointmentId: string
}

export async function resolveAppointmentPatchContext(
  prisma: PrismaClient,
  input: ResolveAppointmentPatchContextInput,
) {
  const actor = await prisma.user.findUnique({
    where: { id: input.actorUserId },
    select: { id: true, role: true, clinicId: true },
  })

  if (!actor) {
    throw new AgendaAppointmentForbiddenError('No autorizado')
  }

  const existing = await prisma.appointment.findFirst({
    where: { id: input.appointmentId },
    include: {
      patient: true,
      doctor: { select: { id: true, clinicId: true } },
    },
  })

  if (!existing) {
    throw new AgendaAppointmentNotFoundError('Cita no encontrada')
  }

  const isOwnAgenda = existing.doctorId === actor.id
  const canManageClinicDoctor =
    can(actor.role, PERMISSIONS.CLINIC_MANAGE_DOCTORS) &&
    Boolean(actor.clinicId) &&
    existing.doctor.clinicId === actor.clinicId

  if (!isOwnAgenda && !canManageClinicDoctor) {
    throw new AgendaAppointmentForbiddenError('No autorizado')
  }

  return {
    actor,
    existing,
    doctorId: existing.doctorId,
  }
}

