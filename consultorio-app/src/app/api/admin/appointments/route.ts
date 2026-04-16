import { NextResponse } from 'next/server'
import { addMinutes } from 'date-fns'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { getAuthenticatedDoctorId } from '@/lib/auth'
import { parseDateOnlyLocal } from '@/lib/dateTime'
import { NotificationService } from '@/services/NotificationService'
import { QuestionnaireService } from '@/services/QuestionnaireService'
import { AppointmentAuditService } from '@/services/AppointmentAuditService'
import { getServerEnv } from '@/lib/env'

const env = getServerEnv()

const createPatientSchema = z.object({
  fullName: z.string().min(1, 'Nombre del paciente requerido'),
  phone: z.string().min(1, 'Teléfono requerido'),
  email: z.string().email().optional().or(z.literal('')),
  dateOfBirth: z.string().optional().or(z.literal('')),
})

const createManualAppointmentSchema = z.object({
  patientId: z.string().min(1).optional(),
  createPatient: createPatientSchema.optional(),
  appointmentType: z.enum(['NORMAL', 'EXTENDED']),
  startTime: z.string().min(1, 'startTime requerido'),
  notes: z.string().optional(),
  allowOutsidePublic: z.boolean().optional().default(true),
}).superRefine((value, ctx) => {
  const hasPatientId = Boolean(value.patientId)
  const hasCreatePatient = Boolean(value.createPatient)

  if (hasPatientId === hasCreatePatient) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Debes seleccionar un paciente existente o capturar uno nuevo.',
      path: ['patientId'],
    })
  }
})

const legacyCreateManualAppointmentSchema = z.object({
  patient: z.object({
    fullName: z.string().min(1, 'Nombre del paciente requerido'),
    phone: z.string().min(1, 'Teléfono requerido'),
    email: z.string().email().optional().or(z.literal('')),
    dateOfBirth: z.string().optional().or(z.literal('')),
  }),
  appointmentType: z.enum(['NORMAL', 'EXTENDED']),
  startTime: z.string().min(1, 'startTime requerido'),
  notes: z.string().optional(),
  allowOutsidePublic: z.boolean().optional().default(true),
})

const MAX_SERIALIZABLE_RETRIES = 3

function isSlotAlignedWithBlock(
  blockStart: Date,
  slotStart: Date,
  baseDurationMin: number
): boolean {
  const slotStepMs = baseDurationMin * 60_000
  const deltaMs = slotStart.getTime() - blockStart.getTime()
  return deltaMs >= 0 && deltaMs % slotStepMs === 0
}

function isSerializableConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2034'
  )
}

export async function POST(request: Request) {
  try {
    const doctorId = await getAuthenticatedDoctorId()
    if (!doctorId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await request.json()
    const parsed = createManualAppointmentSchema.safeParse(body)
    const parsedLegacy = parsed.success ? null : legacyCreateManualAppointmentSchema.safeParse(body)

    if (!parsed.success && !parsedLegacy?.success) {
      const issues = parsed.error.issues
      return NextResponse.json({ error: 'Payload inválido', details: issues }, { status: 400 })
    }
    const legacyData = parsedLegacy?.success ? parsedLegacy.data : null

    const normalized = parsed.success
      ? parsed.data
      : {
          patientId: undefined,
          createPatient: legacyData!.patient,
          appointmentType: legacyData!.appointmentType,
          startTime: legacyData!.startTime,
          notes: legacyData!.notes,
          allowOutsidePublic: legacyData!.allowOutsidePublic,
        }

    const config = await prisma.doctorConfig.findUnique({ where: { doctorId } })
    if (!config) {
      return NextResponse.json({ error: 'Config del médico no encontrada' }, { status: 400 })
    }

    if (normalized.appointmentType === 'EXTENDED' && !config.extendedConsultationEnabled) {
      return NextResponse.json(
        { error: 'La consulta extendida está deshabilitada para este médico.' },
        { status: 400 }
      )
    }

    const startTime = new Date(normalized.startTime)
    if (Number.isNaN(startTime.getTime())) {
      return NextResponse.json({ error: 'startTime inválido' }, { status: 400 })
    }

    const durationMin =
      normalized.appointmentType === 'EXTENDED'
        ? config.consultationDurationMin * 2
        : config.consultationDurationMin
    const endTime = addMinutes(startTime, durationMin)
    const localDate = new Date(startTime)
    localDate.setHours(0, 0, 0, 0)

    const createPatientInput = normalized.createPatient
    let parsedDob: Date | null = null
    if (createPatientInput?.dateOfBirth) {
      try {
        parsedDob = parseDateOnlyLocal(createPatientInput.dateOfBirth)
      } catch {
        return NextResponse.json({ error: 'Fecha de nacimiento inválida' }, { status: 400 })
      }
    }

    let created: { id: string; status: string } | null = null

    for (let attempt = 1; attempt <= MAX_SERIALIZABLE_RETRIES; attempt += 1) {
      try {
        created = await prisma.$transaction(
          async (tx) => {
            if (!normalized.allowOutsidePublic) {
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
                isSlotAlignedWithBlock(block.startTime, startTime, config.consultationDurationMin)
              )
              if (!validPublicSlot) {
                throw new Error('El horario seleccionado no cae en bloque público válido.')
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
              throw new Error('Ese horario está bloqueado.')
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
              throw new Error('Ya existe una cita en ese horario.')
            }

            let patient
            let createdPatientInThisRequest = false
            if (normalized.patientId) {
              patient = await tx.patient.findFirst({
                where: {
                  id: normalized.patientId,
                  ownerDoctorId: doctorId,
                },
              })

              if (!patient) {
                throw new Error('Paciente no encontrado en tu directorio.')
              }
            } else {
              const patientInput = normalized.createPatient!
              const duplicate = await tx.patient.findFirst({
                where: {
                  ownerDoctorId: doctorId,
                  fullName: patientInput.fullName.trim(),
                  phone: patientInput.phone.trim(),
                },
                select: { id: true },
              })
              if (duplicate) {
                throw new Error('Ese paciente ya existe en tu directorio. Selecciónalo en la lista.')
              }

              patient = await tx.patient.create({
                data: {
                  ownerDoctorId: doctorId,
                  fullName: patientInput.fullName.trim(),
                  phone: patientInput.phone.trim(),
                  email: patientInput.email?.trim().toLowerCase() || undefined,
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
                appointmentType: normalized.appointmentType,
                durationMin,
                source: 'DOCTOR',
                status: 'PENDING',
                notes: normalized.notes,
              },
              select: {
                id: true,
                status: true,
              },
            })

            if (createdPatientInThisRequest) {
              await AppointmentAuditService.safeLog(
                {
                  doctorId,
                  appointmentId: appointment.id,
                  patientId: patient.id,
                  actorType: 'DOCTOR',
                  actorUserId: doctorId,
                  source: 'ADMIN_PANEL',
                  action: 'PATIENT_CREATED_FROM_APPOINTMENT',
                  metadata: {
                    reason: 'manual_appointment_create',
                  },
                },
                tx
              )
            }

            await AppointmentAuditService.safeLog(
              {
                doctorId,
                appointmentId: appointment.id,
                patientId: patient.id,
                actorType: 'DOCTOR',
                actorUserId: doctorId,
                source: 'ADMIN_PANEL',
                action: 'APPOINTMENT_CREATED',
                fromStatus: null,
                toStatus: appointment.status,
                metadata: {
                  source: 'DOCTOR',
                  appointmentType: normalized.appointmentType,
                },
              },
              tx
            )

            return appointment
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
        )
        break
      } catch (error: unknown) {
        if (isSerializableConflict(error) && attempt < MAX_SERIALIZABLE_RETRIES) {
          continue
        }
        throw error
      }
    }

    if (!created) {
      return NextResponse.json({ error: 'No se pudo crear la cita.' }, { status: 500 })
    }

    if (config.whatsappConnected) {
      const questionnaireToken = await QuestionnaireService.generateToken(created.id)
      const questionnaireUrl = `${env.APP_BASE_URL}/cuestionario/${questionnaireToken}`

      await NotificationService.enqueueConfirmation(created.id)
      await NotificationService.enqueueQuestionnaireInvitation(created.id, questionnaireUrl)

      NotificationService.processPendingQueue({
        appointmentId: created.id,
        limit: 10,
      }).catch((error) => {
        console.error('[admin/appointments] Error procesando cola de notificaciones', error)
      })
    }

    return NextResponse.json({ success: true, appointment: created }, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
