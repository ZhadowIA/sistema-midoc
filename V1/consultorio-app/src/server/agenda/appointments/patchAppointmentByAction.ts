import type { PrismaClient } from '@prisma/client'
import { assignPatientToAppointment } from '@/server/agenda/appointments/assignPatientToAppointment'
import { createAndAssignPatientToAppointment } from '@/server/agenda/appointments/createAndAssignPatientToAppointment'
import { rescheduleAppointment } from '@/server/agenda/appointments/rescheduleAppointment'
import { resolveAppointmentPatchContext } from '@/server/agenda/appointments/resolveAppointmentPatchContext'
import { updateAppointmentStatus } from '@/server/agenda/appointments/updateAppointmentStatus'

type PatchAppointmentByActionInput = {
  prisma: PrismaClient
  actorUserId: string
  appointmentId: string
  body: Record<string, unknown>
  ipAddress: string | null
  userAgent: string | null
}

export async function patchAppointmentByAction(input: PatchAppointmentByActionInput) {
  const context = await resolveAppointmentPatchContext(input.prisma, {
    actorUserId: input.actorUserId,
    appointmentId: input.appointmentId,
  })

  if (input.body.action === 'ASSIGN_PATIENT') {
    return assignPatientToAppointment({
      prisma: input.prisma,
      appointmentId: input.appointmentId,
      doctorId: context.doctorId,
      existingPatientId: context.existing.patientId,
      actorUserId: context.actor.id,
      actorRole: context.actor.role,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      patientId: input.body.patientId,
    })
  }

  if (input.body.action === 'CREATE_AND_ASSIGN_PATIENT') {
    return createAndAssignPatientToAppointment({
      prisma: input.prisma,
      appointmentId: input.appointmentId,
      doctorId: context.doctorId,
      existingPatientId: context.existing.patientId,
      existingPatient: {
        firstName: context.existing.patient.firstName,
        lastNamePaternal: context.existing.patient.lastNamePaternal,
        lastNameMaternal: context.existing.patient.lastNameMaternal,
        phone: context.existing.patient.phone,
        email: context.existing.patient.email,
        userId: context.existing.patient.userId,
        dateOfBirth: context.existing.patient.dateOfBirth,
      },
      actorUserId: context.actor.id,
      actorRole: context.actor.role,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    })
  }

  if (input.body.action === 'RESCHEDULE') {
    return rescheduleAppointment({
      prisma: input.prisma,
      appointmentId: input.appointmentId,
      doctorId: context.doctorId,
      existing: {
        id: context.existing.id,
        doctorId: context.existing.doctorId,
        patientId: context.existing.patientId,
        status: context.existing.status,
        durationMin: context.existing.durationMin,
        startTime: context.existing.startTime,
        endTime: context.existing.endTime,
        notes: context.existing.notes,
      },
      actorUserId: context.actor.id,
      actorRole: context.actor.role,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      newStartTime: input.body.newStartTime,
      notes: input.body.notes,
    })
  }

  return updateAppointmentStatus({
    prisma: input.prisma,
    appointmentId: input.appointmentId,
    doctorId: context.doctorId,
    existing: {
      id: context.existing.id,
      doctorId: context.existing.doctorId,
      patientId: context.existing.patientId,
      status: context.existing.status,
      startTime: context.existing.startTime,
      endTime: context.existing.endTime,
    },
    actorUserId: context.actor.id,
    actorRole: context.actor.role,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
    status: input.body.status,
    notes: input.body.notes,
  })
}
