import type { PrismaClient } from '@prisma/client'
import { AppointmentAuditService } from '@/services/AppointmentAuditService'

type ExistingPatient = {
  firstName: string
  lastNamePaternal: string
  lastNameMaternal: string | null
  phone: string
  email: string | null
  userId: string | null
  dateOfBirth: Date | null
}

type CreateAndAssignPatientInput = {
  prisma: PrismaClient
  appointmentId: string
  doctorId: string
  existingPatientId: string
  existingPatient: ExistingPatient
  actorUserId: string
  actorRole: string
  ipAddress: string | null
  userAgent: string | null
}

export async function createAndAssignPatientToAppointment(input: CreateAndAssignPatientInput) {
  const normalizedFirstName = input.existingPatient.firstName.trim()
  const normalizedLastNamePaternal = input.existingPatient.lastNamePaternal.trim()
  const normalizedLastNameMaternal = input.existingPatient.lastNameMaternal?.trim() || null
  const normalizedPhone = input.existingPatient.phone.trim()

  const updated = await input.prisma.$transaction(async (tx) => {
    let createdPatientInAction = false
    let targetPatient = await tx.patient.findFirst({
      where: {
        ownerDoctorId: input.doctorId,
        firstName: normalizedFirstName,
        lastNamePaternal: normalizedLastNamePaternal,
        phone: normalizedPhone,
      },
    })

    if (!targetPatient) {
      targetPatient = await tx.patient.create({
        data: {
          ownerDoctorId: input.doctorId,
          userId: input.existingPatient.userId || undefined,
          firstName: normalizedFirstName,
          lastNamePaternal: normalizedLastNamePaternal,
          lastNameMaternal: normalizedLastNameMaternal,
          phone: normalizedPhone,
          email: input.existingPatient.email?.trim().toLowerCase() || undefined,
          dateOfBirth: input.existingPatient.dateOfBirth ?? undefined,
        },
      })
      createdPatientInAction = true
    } else if (!targetPatient.userId && input.existingPatient.userId) {
      targetPatient = await tx.patient.update({
        where: { id: targetPatient.id },
        data: { userId: input.existingPatient.userId },
      })
    }

    await tx.appointment.update({
      where: { id: input.appointmentId },
      data: { patientId: targetPatient.id },
    })

    await tx.clinicalNote.updateMany({
      where: { appointmentId: input.appointmentId },
      data: { patientId: targetPatient.id },
    })

    if (createdPatientInAction) {
      await AppointmentAuditService.safeLog(
        {
          doctorId: input.doctorId,
          appointmentId: input.appointmentId,
          patientId: targetPatient.id,
          actorType: 'DOCTOR',
          actorUserId: input.actorUserId,
          source: 'ADMIN_PANEL',
          action: 'PATIENT_CREATED_FROM_APPOINTMENT',
          ipAddress: input.ipAddress,
          userAgent: input.userAgent,
          metadata: {
            firstName: normalizedFirstName,
            lastNamePaternal: normalizedLastNamePaternal,
            lastNameMaternal: normalizedLastNameMaternal,
            phone: normalizedPhone,
            actorRole: input.actorRole,
            delegatedDoctorId: input.doctorId !== input.actorUserId ? input.doctorId : null,
          },
        },
        tx,
      )
    }

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
          createdPatientInAction,
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
    throw new Error('No fue posible crear y vincular el paciente.')
  }

  return updated
}
