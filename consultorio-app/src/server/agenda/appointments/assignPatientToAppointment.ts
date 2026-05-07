import type { PrismaClient } from '@prisma/client'
import { AppointmentAuditService } from '@/services/AppointmentAuditService'
import {
  AgendaAppointmentInputError,
  AgendaAppointmentNotFoundError,
} from '@/server/agenda/appointments/errors'

type AssignPatientInput = {
  prisma: PrismaClient
  appointmentId: string
  doctorId: string
  existingPatientId: string
  actorUserId: string
  actorRole: string
  ipAddress: string | null
  userAgent: string | null
  patientId: unknown
}

export async function assignPatientToAppointment(input: AssignPatientInput) {
  if (!input.patientId || typeof input.patientId !== 'string') {
    throw new AgendaAppointmentInputError('Falta patientId')
  }

  const targetPatient = await input.prisma.patient.findFirst({
    where: { id: input.patientId, ownerDoctorId: input.doctorId },
    select: { id: true },
  })
  if (!targetPatient) {
    throw new AgendaAppointmentNotFoundError('No se encontró el paciente en tu directorio.')
  }

  const updated = await input.prisma.$transaction(async (tx) => {
    await tx.appointment.update({
      where: { id: input.appointmentId },
      data: { patientId: targetPatient.id },
    })

    await tx.clinicalNote.updateMany({
      where: { appointmentId: input.appointmentId },
      data: { patientId: targetPatient.id },
    })

    await AppointmentAuditService.safeLog(
      {
        doctorId: input.doctorId,
        appointmentId: input.appointmentId,
        patientId: targetPatient.id,
        actorType: 'DOCTOR',
        actorUserId: input.actorUserId,
        source: 'ADMIN_PANEL',
        action: 'PATIENT_ASSIGNED_TO_APPOINTMENT',
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        metadata: {
          previousPatientId: input.existingPatientId,
          nextPatientId: targetPatient.id,
          actorRole: input.actorRole,
          delegatedDoctorId: input.doctorId !== input.actorUserId ? input.doctorId : null,
        },
      },
      tx,
    )

    return tx.appointment.findUnique({
      where: { id: input.appointmentId },
      include: { patient: true, questionnaire: true, doctor: true },
    })
  })

  if (!updated) {
    throw new Error('No fue posible asignar la cita.')
  }

  return updated
}

