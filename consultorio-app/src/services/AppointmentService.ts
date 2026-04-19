import prisma from '../lib/prisma'
import { Prisma } from '@prisma/client'
type AppointmentType = 'NORMAL' | 'EXTENDED'
type PatientSex = 'MALE' | 'FEMALE' | 'INTERSEX'
type PatientGender =
  | 'NOT_SPECIFIED'
  | 'MASCULINE'
  | 'FEMININE'
  | 'TRANSGENDER'
  | 'TRANSSEXUAL'
  | 'TRAVESTI'
  | 'INTERSEX'
  | 'OTHER'
type PatientRelation =
  | 'SELF'
  | 'SPOUSE'
  | 'PARENT'
  | 'CHILD'
  | 'SIBLING'
  | 'FRIEND'
  | 'CAREGIVER'
  | 'OTHER'
import { addMinutes } from 'date-fns'
import { QuestionnaireService } from './QuestionnaireService'
import { NotificationService } from './NotificationService'
import { AppointmentAuditService } from './AppointmentAuditService'
import { getServerEnv } from '@/lib/env'
import { buildSlotHoldReason, getSlotHoldActiveCutoff, SLOT_HOLD_REASON_PREFIX } from '@/lib/slotHold'
import { ConsentCaptureService } from './ConsentCaptureService'
import { AuditLogService } from './AuditLogService'
import { buildFullName } from '@/lib/patientName'

type ContactInput = {
  relation: PatientRelation
  firstName: string
  lastNamePaternal: string
  lastNameMaternal?: string | null
  phone: string
  email?: string | null
}

type CreatePublicAppointmentInput = {
  firstName: string
  lastNamePaternal: string
  lastNameMaternal?: string | null
  sex?: PatientSex | null
  gender?: PatientGender | null
  fullName: string
  dateOfBirth: string
  userId?: string
  phone: string
  email?: string
  appointmentType: AppointmentType
  startTime: string
  doctorId: string
  holdToken?: string
  privacyConsentAccepted: boolean
  contact?: ContactInput | null
  ipAddress?: string | null
  userAgent?: string | null
}

type CreatedAppointmentResult = {
  appointmentId: string
  status: string
  appointment: {
    id: string
    startTime: string
    endTime: string
    appointmentType: AppointmentType
    durationMin: number
    doctor: {
      id: string
      name: string
      specialty: string | null
      clinicAddress: string | null
    }
  }
  questionnaire: {
    recommended: true
    optional: true
    url: string
  }
}

const MAX_SERIALIZABLE_RETRIES = 3
const env = getServerEnv()

export class AppointmentService {
  private static isSlotAlignedWithBlock(
    blockStart: Date,
    slotStart: Date,
    baseDurationMin: number
  ): boolean {
    const slotStepMs = baseDurationMin * 60_000
    const deltaMs = slotStart.getTime() - blockStart.getTime()
    return deltaMs >= 0 && deltaMs % slotStepMs === 0
  }

  private static isSerializableConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2034'
    )
  }

  static async createPublicAppointment(data: CreatePublicAppointmentInput): Promise<CreatedAppointmentResult> {
    const config = await prisma.doctorConfig.findUnique({ where: { doctorId: data.doctorId } })
    if (!config) throw new Error("Sistema no configurado para este médico")

    if (data.appointmentType === 'EXTENDED' && !config.extendedConsultationEnabled) {
      throw new Error('La consulta extendida no está habilitada para este médico.')
    }

    const doctorId = data.doctorId
    const startTimeDate = new Date(data.startTime)
    if (Number.isNaN(startTimeDate.getTime())) {
      throw new Error('Fecha y hora de cita inválidas.')
    }
    if (startTimeDate < new Date()) {
      throw new Error('No es posible agendar en horarios pasados.')
    }

    const dateOfBirth = new Date(data.dateOfBirth)
    if (Number.isNaN(dateOfBirth.getTime())) {
      throw new Error('Fecha de nacimiento inválida.')
    }

    const baseDuration = config.consultationDurationMin
    if (baseDuration < 15 || baseDuration > 120) {
      throw new Error('Configuración de duración base inválida.')
    }

    const slotDuration = data.appointmentType === 'EXTENDED' ? baseDuration * 2 : baseDuration
    const endTimeDate = addMinutes(startTimeDate, slotDuration)
    const startOfAptDay = new Date(startTimeDate)
    startOfAptDay.setHours(0, 0, 0, 0)

    let createdAppointmentId = ''
    let createdAppointmentStatus = ''

    for (let attempt = 1; attempt <= MAX_SERIALIZABLE_RETRIES; attempt += 1) {
      try {
        const appointment = await prisma.$transaction(
          async (tx: Prisma.TransactionClient) => {
            const publicBlocks = await tx.availabilityBlock.findMany({
              where: {
                doctorId,
                isPublic: true,
                active: true,
                startTime: { lte: startTimeDate },
                endTime: { gte: endTimeDate },
              },
              orderBy: { startTime: 'asc' },
            })

            const hasValidPublicSlot = publicBlocks.some((block) =>
              this.isSlotAlignedWithBlock(block.startTime, startTimeDate, baseDuration)
            )

            if (!hasValidPublicSlot) {
              throw new Error('El horario seleccionado no pertenece a un bloque público válido.')
            }

            const activeHoldCutoff = getSlotHoldActiveCutoff()
            const overlappingBlockers = await tx.scheduleBlock.count({
              where: {
                doctorId,
                AND: [
                  { startTime: { lt: endTimeDate } },
                  { endTime: { gt: startTimeDate } },
                ],
                NOT: [
                  {
                    AND: [
                      { reason: { startsWith: SLOT_HOLD_REASON_PREFIX } },
                      { createdAt: { lt: activeHoldCutoff } },
                    ],
                  },
                  data.holdToken ? { reason: buildSlotHoldReason(data.holdToken) } : {},
                ].filter((condition) => Object.keys(condition).length > 0) as Prisma.ScheduleBlockWhereInput[],
              },
            })

            if (overlappingBlockers > 0) {
              throw new Error('El horario seleccionado ha sido bloqueado recientemente.')
            }

            if (data.holdToken) {
              const holdReason = buildSlotHoldReason(data.holdToken)
              const hold = await tx.scheduleBlock.findFirst({
                where: {
                  doctorId,
                  reason: holdReason,
                  type: 'PRIVATE_RESERVED',
                  createdAt: { gte: activeHoldCutoff },
                  startTime: { lte: startTimeDate },
                  endTime: { gte: endTimeDate },
                },
                select: { id: true },
              })

              if (!hold) {
                throw new Error('El tiempo de reserva del horario expiró. Selecciona nuevamente el horario.')
              }
            }

            const overlappingAppointments = await tx.appointment.count({
              where: {
                doctorId,
                status: { notIn: ['CANCELLED'] },
                AND: [
                  { startTime: { lt: endTimeDate } },
                  { endTime: { gt: startTimeDate } },
                ],
              },
            })

            if (overlappingAppointments > 0) {
              throw new Error('El horario seleccionado ya no está disponible.')
            }

            let patient = null

            if (data.userId) {
              patient = await tx.patient.findFirst({
                where: {
                  userId: data.userId,
                  ownerDoctorId: null,
                  appointments: {
                    some: { doctorId },
                  },
                },
              })
            }

            if (!patient) {
              patient = await tx.patient.findFirst({
                where: {
                  fullName: data.fullName,
                  phone: data.phone,
                  ownerDoctorId: null,
                  appointments: {
                    some: { doctorId },
                  },
                },
              })
            }

            const structuredFullName = buildFullName({
              firstName: data.firstName,
              lastNamePaternal: data.lastNamePaternal,
              lastNameMaternal: data.lastNameMaternal ?? null,
            }) || data.fullName.trim()

            if (!patient) {
              patient = await tx.patient.create({
                data: {
                  userId: data.userId,
                  fullName: structuredFullName,
                  firstName: data.firstName.trim(),
                  lastNamePaternal: data.lastNamePaternal.trim(),
                  lastNameMaternal: data.lastNameMaternal?.trim() || null,
                  sex: data.sex ?? null,
                  gender: data.gender ?? null,
                  dateOfBirth,
                  phone: data.phone.trim(),
                  email: data.email?.trim().toLowerCase() || undefined,
                },
              })
            } else {
              const patch: Prisma.PatientUpdateInput = {}
              if (data.userId && !patient.userId) patch.user = { connect: { id: data.userId } }
              if (!patient.firstName) patch.firstName = data.firstName.trim()
              if (!patient.lastNamePaternal) patch.lastNamePaternal = data.lastNamePaternal.trim()
              if (!patient.lastNameMaternal && data.lastNameMaternal) {
                patch.lastNameMaternal = data.lastNameMaternal.trim()
              }
              if (!patient.sex && data.sex) patch.sex = data.sex
              if (!patient.gender && data.gender) patch.gender = data.gender
              if (patient.fullName !== structuredFullName) patch.fullName = structuredFullName
              if (Object.keys(patch).length > 0) {
                patient = await tx.patient.update({ where: { id: patient.id }, data: patch })
              }
            }

            let contactId: string | null = null
            if (data.contact) {
              const contactPhone = data.contact.phone.trim()
              const existingContact = await tx.patientContact.findFirst({
                where: {
                  patientId: patient.id,
                  relation: data.contact.relation,
                  phone: contactPhone,
                },
                select: { id: true },
              })

              if (existingContact) {
                contactId = existingContact.id
              } else {
                const totalContacts = await tx.patientContact.count({
                  where: { patientId: patient.id },
                })
                const created = await tx.patientContact.create({
                  data: {
                    patientId: patient.id,
                    relation: data.contact.relation,
                    firstName: data.contact.firstName.trim(),
                    lastNamePaternal: data.contact.lastNamePaternal.trim(),
                    lastNameMaternal: data.contact.lastNameMaternal?.trim() || null,
                    phone: contactPhone,
                    email: data.contact.email?.trim().toLowerCase() || null,
                    isPrimary: totalContacts === 0,
                  },
                  select: { id: true },
                })
                contactId = created.id
              }
            }

            const appointment = await tx.appointment.create({
              data: {
                doctorId,
                patientId: patient.id,
                contactId,
                date: startOfAptDay,
                startTime: startTimeDate,
                endTime: endTimeDate,
                appointmentType: data.appointmentType,
                durationMin: slotDuration,
                source: 'PATIENT',
                status: 'PENDING',
              },
            })

            await AppointmentAuditService.safeLog(
              {
                doctorId,
                appointmentId: appointment.id,
                patientId: patient.id,
                actorType: data.userId ? 'PATIENT' : 'SYSTEM',
                actorUserId: data.userId ?? null,
                source: 'PUBLIC_BOOKING',
                action: 'APPOINTMENT_CREATED',
                fromStatus: null,
                toStatus: 'PENDING',
                metadata: {
                  appointmentType: data.appointmentType,
                  source: 'PATIENT',
                  holdTokenUsed: Boolean(data.holdToken),
                  privacyConsentAccepted: true,
                },
                ipAddress: data.ipAddress,
                userAgent: data.userAgent,
              },
              tx
            )

            await ConsentCaptureService.capture(
              {
                appointmentId: appointment.id,
                doctorId,
                patientId: patient.id,
                capturedByUserId: data.userId ?? null,
                type: 'BOOKING_PRIVACY_NOTICE',
                ipAddress: data.ipAddress,
                userAgent: data.userAgent,
                metadata: {
                  source: 'public_booking',
                  linkedAccount: Boolean(data.userId),
                },
              },
              tx
            )

            await AuditLogService.safeLog(
              {
                doctorId,
                appointmentId: appointment.id,
                patientId: patient.id,
                actorUserId: data.userId ?? null,
                action: 'PUBLIC_BOOKING_CREATED',
                ipAddress: data.ipAddress,
                userAgent: data.userAgent,
                metadata: {
                  appointmentType: data.appointmentType,
                },
              },
              tx
            )

            if (data.holdToken) {
              await tx.scheduleBlock.deleteMany({
                where: {
                  doctorId,
                  reason: buildSlotHoldReason(data.holdToken),
                  type: 'PRIVATE_RESERVED',
                },
              })
            }

            return appointment
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        )

        createdAppointmentId = appointment.id
        createdAppointmentStatus = appointment.status
        break
      } catch (error: unknown) {
        const shouldRetry = this.isSerializableConflict(error) && attempt < MAX_SERIALIZABLE_RETRIES
        if (shouldRetry) {
          continue
        }
        throw error
      }
    }

    if (!createdAppointmentId) {
      throw new Error('No fue posible crear la cita en este momento.')
    }

    const token = await QuestionnaireService.generateToken(createdAppointmentId)
    const tokenUrl = `${env.APP_BASE_URL}/cuestionario/${token}`

    await NotificationService.enqueueConfirmation(createdAppointmentId)
    await NotificationService.enqueueQuestionnaireInvitation(createdAppointmentId, tokenUrl)

    NotificationService.processPendingQueue({
      appointmentId: createdAppointmentId,
      limit: 10,
    }).catch((error) => {
      console.error('[AppointmentService] Error procesando cola de notificaciones', error)
    })

    const doctor = await prisma.user.findUnique({
      where: { id: doctorId },
      select: { id: true, name: true, specialty: true, clinicAddress: true },
    })

    return {
      appointmentId: createdAppointmentId,
      status: createdAppointmentStatus,
      appointment: {
        id: createdAppointmentId,
        startTime: startTimeDate.toISOString(),
        endTime: endTimeDate.toISOString(),
        appointmentType: data.appointmentType,
        durationMin: slotDuration,
        doctor: {
          id: doctorId,
          name: doctor?.name ?? 'Médico',
          specialty: doctor?.specialty ?? null,
          clinicAddress: doctor?.clinicAddress ?? null,
        },
      },
      questionnaire: {
        recommended: true,
        optional: true,
        url: tokenUrl,
      },
    }
  }
}
