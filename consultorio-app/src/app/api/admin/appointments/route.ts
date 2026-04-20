import { NextResponse } from 'next/server'
import { addMinutes } from 'date-fns'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/auth'
import { parseDateOnlyLocal } from '@/lib/dateTime'
import { NotificationService } from '@/services/NotificationService'
import { QuestionnaireService } from '@/services/QuestionnaireService'
import { AppointmentAuditService } from '@/services/AppointmentAuditService'
import { getServerEnv } from '@/lib/env'

const env = getServerEnv()

const createPatientSchema = z.object({
  firstName: z.string().trim().min(1),
  lastNamePaternal: z.string().trim().min(1),
  lastNameMaternal: z.string().trim().optional().or(z.literal('')),
  phone: z.string().min(1, 'Teléfono requerido'),
  email: z.string().email().optional().or(z.literal('')),
  dateOfBirth: z.string().optional().or(z.literal('')),
})

const createManualAppointmentSchema = z.object({
  doctorId: z.string().min(1).optional(),
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

function resolveStructuredPatientName(input: z.infer<typeof createPatientSchema>) {
  const firstName = input.firstName.trim()
  const lastNamePaternal = input.lastNamePaternal.trim()
  const lastNameMaternal = input.lastNameMaternal?.trim() || null

  return { firstName, lastNamePaternal, lastNameMaternal }
}

export async function POST(request: Request) {
  try {
    const authUser = await getAuthenticatedUser()
    if (!authUser) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    if (authUser.role !== 'DOCTOR' && authUser.role !== 'ADMIN' && authUser.role !== 'CLINIC_ADMIN') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const parsed = createManualAppointmentSchema.safeParse(await request.json())
    if (!parsed.success) {
      const issues = parsed.error.issues
      return NextResponse.json({ error: 'Payload inválido', details: issues }, { status: 400 })
    }
    const normalized = parsed.data
    let doctorId = authUser.id
    const actorUserId = authUser.id
    const actorRole = authUser.role

    if (normalized.doctorId && normalized.doctorId !== authUser.id) {
      if (authUser.role !== 'CLINIC_ADMIN') {
        return NextResponse.json({ error: 'No autorizado para gestionar agenda de otro médico.' }, { status: 403 })
      }

      const actor = await prisma.user.findUnique({
        where: { id: authUser.id },
        select: { clinicId: true },
      })

      if (!actor?.clinicId) {
        return NextResponse.json({ error: 'CLINIC_ADMIN sin clínica asignada.' }, { status: 403 })
      }

      const targetDoctor = await prisma.user.findFirst({
        where: {
          id: normalized.doctorId,
          clinicId: actor.clinicId,
          active: true,
          role: { in: ['DOCTOR', 'CLINIC_ADMIN'] },
        },
        select: { id: true },
      })

      if (!targetDoctor) {
        return NextResponse.json({ error: 'El médico seleccionado no pertenece a tu clínica.' }, { status: 403 })
      }

      doctorId = targetDoctor.id
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
              const structuredName = resolveStructuredPatientName(patientInput)
              if (!structuredName.firstName || !structuredName.lastNamePaternal) {
                throw new Error('El nombre proporcionado debe incluir al menos nombre y apellido paterno.')
              }
              const duplicate = await tx.patient.findFirst({
                where: {
                  ownerDoctorId: doctorId,
                  firstName: structuredName.firstName,
                  lastNamePaternal: structuredName.lastNamePaternal,
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
                  firstName: structuredName.firstName,
                  lastNamePaternal: structuredName.lastNamePaternal,
                  lastNameMaternal: structuredName.lastNameMaternal,
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
                  actorUserId,
                  source: 'ADMIN_PANEL',
                  action: 'PATIENT_CREATED_FROM_APPOINTMENT',
                  metadata: {
                    reason: 'manual_appointment_create',
                    actorRole,
                    delegatedDoctorId: doctorId !== actorUserId ? doctorId : null,
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
                actorUserId,
                source: 'ADMIN_PANEL',
                action: 'APPOINTMENT_CREATED',
                fromStatus: null,
                toStatus: appointment.status,
                metadata: {
                  source: 'DOCTOR',
                  appointmentType: normalized.appointmentType,
                  actorRole,
                  delegatedDoctorId: doctorId !== actorUserId ? doctorId : null,
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
