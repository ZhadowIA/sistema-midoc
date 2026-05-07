import { addMinutes } from 'date-fns'
import { Prisma, type PrismaClient } from '@prisma/client'
import { parseDateOnlyLocal } from '@/lib/dateTime'
import { AppointmentAuditService } from '@/services/AppointmentAuditService'
import { NotificationService } from '@/services/NotificationService'
import { QuestionnaireService } from '@/services/QuestionnaireService'
import { AgendaAppointmentForbiddenError, AgendaAppointmentInputError } from '@/server/agenda/appointments/errors'

const MAX_SERIALIZABLE_RETRIES = 3

function isSlotAlignedWithBlock(blockStart: Date, slotStart: Date, baseDurationMin: number): boolean {
  const slotStepMs = baseDurationMin * 60_000
  const deltaMs = slotStart.getTime() - blockStart.getTime()
  return deltaMs >= 0 && deltaMs % slotStepMs === 0
}

function isSerializableConflict(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034'
}

function resolveStructuredPatientName(input: {
  firstName: string
  lastNamePaternal: string
  lastNameMaternal?: string
}) {
  const firstName = input.firstName.trim()
  const lastNamePaternal = input.lastNamePaternal.trim()
  const lastNameMaternal = input.lastNameMaternal?.trim() || null
  return { firstName, lastNamePaternal, lastNameMaternal }
}

type CreatePatientInput = {
  firstName: string
  lastNamePaternal: string
  lastNameMaternal?: string
  phone: string
  email?: string
  dateOfBirth?: string
}

type CreateManualAppointmentInput = {
  actorUserId: string
  actorRole: string
  canManageDoctors: boolean
  doctorId?: string
  patientId?: string
  createPatient?: CreatePatientInput
  appointmentType: 'NORMAL' | 'EXTENDED'
  startTime: string
  notes?: string
  allowOutsidePublic: boolean
  appBaseUrl: string
}

export async function createManualAppointment(
  prisma: PrismaClient,
  input: CreateManualAppointmentInput,
) {
  let doctorId = input.actorUserId
  const actorUserId = input.actorUserId
  const actorRole = input.actorRole

  if (input.doctorId && input.doctorId !== input.actorUserId) {
    if (!input.canManageDoctors) {
      throw new AgendaAppointmentForbiddenError('No autorizado para gestionar agenda de otro médico.')
    }

    const actor = await prisma.user.findUnique({
      where: { id: input.actorUserId },
      select: { clinicId: true },
    })
    if (!actor?.clinicId) {
      throw new AgendaAppointmentForbiddenError('CLINIC_ADMIN sin clínica asignada.')
    }

    const targetDoctor = await prisma.user.findFirst({
      where: {
        id: input.doctorId,
        clinicId: actor.clinicId,
        active: true,
        role: { in: ['DOCTOR', 'CLINIC_ADMIN'] },
      },
      select: { id: true },
    })
    if (!targetDoctor) {
      throw new AgendaAppointmentForbiddenError('El médico seleccionado no pertenece a tu clínica.')
    }
    doctorId = targetDoctor.id
  }

  const config = await prisma.doctorConfig.findUnique({ where: { doctorId } })
  if (!config) {
    throw new AgendaAppointmentInputError('Config del médico no encontrada')
  }

  if (input.appointmentType === 'EXTENDED' && !config.extendedConsultationEnabled) {
    throw new AgendaAppointmentInputError('La consulta extendida está deshabilitada para este médico.')
  }

  const startTime = new Date(input.startTime)
  if (Number.isNaN(startTime.getTime())) {
    throw new AgendaAppointmentInputError('startTime inválido')
  }

  const durationMin =
    input.appointmentType === 'EXTENDED'
      ? config.consultationDurationMin * 2
      : config.consultationDurationMin
  const endTime = addMinutes(startTime, durationMin)
  const localDate = new Date(startTime)
  localDate.setHours(0, 0, 0, 0)

  let parsedDob: Date | null = null
  if (input.createPatient?.dateOfBirth) {
    try {
      parsedDob = parseDateOnlyLocal(input.createPatient.dateOfBirth)
    } catch {
      throw new AgendaAppointmentInputError('Fecha de nacimiento inválida')
    }
  }

  let created: { id: string; status: string } | null = null

  for (let attempt = 1; attempt <= MAX_SERIALIZABLE_RETRIES; attempt += 1) {
    try {
      created = await prisma.$transaction(
        async (tx) => {
          if (!input.allowOutsidePublic) {
            const blocks = await tx.availabilityBlock.findMany({
              where: {
                doctorId,
                isPublic: true,
                active: true,
                startTime: { lte: startTime },
                endTime: { gte: endTime },
              },
            })
            const validPublicSlot = blocks.some((block) =>
              isSlotAlignedWithBlock(block.startTime, startTime, config.consultationDurationMin),
            )
            if (!validPublicSlot) {
              throw new AgendaAppointmentInputError('El horario seleccionado no cae en bloque público válido.')
            }
          }

          const blocker = await tx.scheduleBlock.findFirst({
            where: {
              doctorId,
              startTime: { lt: endTime },
              endTime: { gt: startTime },
            },
          })
          if (blocker) {
            throw new AgendaAppointmentInputError('Ese horario está bloqueado.')
          }

          const overlap = await tx.appointment.findFirst({
            where: {
              doctorId,
              status: { notIn: ['CANCELLED'] },
              startTime: { lt: endTime },
              endTime: { gt: startTime },
            },
          })
          if (overlap) {
            throw new AgendaAppointmentInputError('Ya existe una cita en ese horario.')
          }

          let patient
          let createdPatientInThisRequest = false
          if (input.patientId) {
            patient = await tx.patient.findFirst({
              where: { id: input.patientId, ownerDoctorId: doctorId },
            })
            if (!patient) {
              throw new AgendaAppointmentInputError('Paciente no encontrado en tu directorio.')
            }
          } else {
            if (!input.createPatient) {
              throw new AgendaAppointmentInputError('Debes seleccionar un paciente existente o capturar uno nuevo.')
            }
            const structuredName = resolveStructuredPatientName(input.createPatient)
            if (!structuredName.firstName || !structuredName.lastNamePaternal) {
              throw new AgendaAppointmentInputError(
                'El nombre proporcionado debe incluir al menos nombre y apellido paterno.',
              )
            }
            const duplicate = await tx.patient.findFirst({
              where: {
                ownerDoctorId: doctorId,
                firstName: structuredName.firstName,
                lastNamePaternal: structuredName.lastNamePaternal,
                phone: input.createPatient.phone.trim(),
              },
              select: { id: true },
            })
            if (duplicate) {
              throw new AgendaAppointmentInputError(
                'Ese paciente ya existe en tu directorio. Selecciónalo en la lista.',
              )
            }

            patient = await tx.patient.create({
              data: {
                ownerDoctorId: doctorId,
                firstName: structuredName.firstName,
                lastNamePaternal: structuredName.lastNamePaternal,
                lastNameMaternal: structuredName.lastNameMaternal,
                phone: input.createPatient.phone.trim(),
                email: input.createPatient.email?.trim().toLowerCase() || undefined,
                ...(parsedDob ? { dateOfBirth: parsedDob } : {}),
              },
            })
            createdPatientInThisRequest = true
          }

          const appointment = await tx.appointment.create({
            data: {
              doctorId,
              patientId: patient.id,
              date: localDate,
              startTime,
              endTime,
              appointmentType: input.appointmentType,
              durationMin,
              source: 'DOCTOR',
              status: 'PENDING',
              notes: input.notes,
            },
            select: { id: true, status: true },
          })

          if (createdPatientInThisRequest) {
            await AppointmentAuditService.safeLog(
              {
                doctorId,
                appointmentId: appointment.id,
                patientId: patient.id,
                actorType: 'DOCTOR',
                actorUserId,
                source: 'ADMIN_PANEL',
                action: 'PATIENT_CREATED_FROM_APPOINTMENT',
                metadata: {
                  reason: 'manual_appointment_create',
                  actorRole,
                  delegatedDoctorId: doctorId !== actorUserId ? doctorId : null,
                },
              },
              tx,
            )
          }

          await AppointmentAuditService.safeLog(
            {
              doctorId,
              appointmentId: appointment.id,
              patientId: patient.id,
              actorType: 'DOCTOR',
              actorUserId,
              source: 'ADMIN_PANEL',
              action: 'APPOINTMENT_CREATED',
              fromStatus: null,
              toStatus: appointment.status,
              metadata: {
                source: 'DOCTOR',
                appointmentType: input.appointmentType,
                actorRole,
                delegatedDoctorId: doctorId !== actorUserId ? doctorId : null,
              },
            },
            tx,
          )

          return appointment
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
      break
    } catch (error: unknown) {
      if (isSerializableConflict(error) && attempt < MAX_SERIALIZABLE_RETRIES) continue
      throw error
    }
  }

  if (!created) {
    throw new Error('No se pudo crear la cita.')
  }

  if (config.whatsappConnected) {
    const questionnaireToken = await QuestionnaireService.generateToken(created.id)
    const questionnaireUrl = `${input.appBaseUrl}/cuestionario/${questionnaireToken}`
    await NotificationService.enqueueConfirmation(created.id)
    await NotificationService.enqueueQuestionnaireInvitation(created.id, questionnaireUrl)
    NotificationService.processPendingQueue({ appointmentId: created.id, limit: 10 }).catch((error) => {
      console.error('[admin/appointments] Error procesando cola de notificaciones', error)
    })
  }

  return { success: true, appointment: created }
}

