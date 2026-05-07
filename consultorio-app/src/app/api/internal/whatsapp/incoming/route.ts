import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import {
  AppointmentStatus,
  WhatsAppIntent,
  WhatsAppMessageAction,
  WhatsAppMessageDirection,
} from '@prisma/client'
import { addDays, format, subHours } from 'date-fns'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { getServerEnv } from '@/lib/env'
import { captureError, emitMetric, logEvent } from '@/lib/observability'
import { WhatsAppMessageLogService } from '@/services/WhatsAppMessageLogService'
import { AppointmentAuditService } from '@/services/AppointmentAuditService'
import { WaitlistService } from '@/services/WaitlistService'

const incomingMessageSchema = z.object({
  doctorId: z.string().min(1),
  from: z.string().min(1),
  message: z.string().trim().min(1).max(4000),
  messageId: z.string().optional(),
  timestamp: z.number().int().optional(),
})

const POSITIVE_CONFIRM_KEYWORDS = [
  'confirmo',
  'confirmar',
  'si',
  'sí',
  'asistire',
  'asistiré',
  'ok',
  'de acuerdo',
  'acepto',
]

const NEGATIVE_CONFIRM_KEYWORDS = [
  'no confirmo',
  'no',
  'cancelo',
  'cancelar',
  'no puedo',
  'no asistire',
  'no asistiré',
]

const CANCEL_KEYWORDS = [
  'cancelo',
  'cancelar',
  'cancelacion',
  'cancelación',
  'no podre asistir',
  'no podré asistir',
  'no voy a asistir',
  'no asistire',
  'no asistiré',
]

const GREETING_KEYWORDS = ['hola', 'buen dia', 'buenos dias', 'buenas tardes', 'buenas noches']
const RESCHEDULE_KEYWORDS = [
  'reagendar',
  'reagendo',
  'reagendar cita',
  'reprogramar',
  'reprogramo',
  'cambiar cita',
  'cambiar horario',
  'mover cita',
]

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function normalizePhone(value: string) {
  const withoutSuffix = value.split('@')[0] ?? value
  let digits = withoutSuffix.replace(/\D/g, '')

  if (digits.length === 13 && digits.startsWith('521')) {
    digits = `52${digits.slice(3)}`
  } else if (digits.length === 10) {
    digits = `52${digits}`
  }

  return digits
}

function parseRescheduleDateTimeFromMessage(message: string): Date | null {
  const normalized = message.trim()
  const match = normalized.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/)
  if (!match) return null
  const [, dd, mm, yyyy, hh, min] = match
  const day = Number(dd)
  const month = Number(mm)
  const year = Number(yyyy)
  const hour = Number(hh)
  const minute = Number(min)
  const candidate = new Date(year, month - 1, day, hour, minute, 0, 0)
  if (
    Number.isNaN(candidate.getTime()) ||
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day ||
    candidate.getHours() !== hour ||
    candidate.getMinutes() !== minute
  ) {
    return null
  }
  return candidate
}

function detectIntent(message: string): WhatsAppIntent {
  const normalized = normalizeText(message)
  if (!normalized) return WhatsAppIntent.UNKNOWN

  if (CANCEL_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return WhatsAppIntent.CANCEL
  }

  if (
    POSITIVE_CONFIRM_KEYWORDS.some((keyword) => normalized === keyword || normalized.includes(keyword)) &&
    !NEGATIVE_CONFIRM_KEYWORDS.some((keyword) => normalized.includes(keyword))
  ) {
    return WhatsAppIntent.CONFIRM
  }

  if (GREETING_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return WhatsAppIntent.GREETING
  }

  if (RESCHEDULE_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return WhatsAppIntent.QUESTION
  }

  if (normalized.includes('?') || normalized.includes('que ') || normalized.includes('qué ')) {
    return WhatsAppIntent.QUESTION
  }

  return WhatsAppIntent.UNKNOWN
}

type AppointmentWithPatient = Awaited<ReturnType<typeof getCandidateAppointments>>[number]

type DoctorWhatsAppRules = {
  autoReplyEnabled: boolean
  autoConfirmEnabled: boolean
  autoCancelEnabled: boolean
}

function pickTargetAppointment(
  matches: AppointmentWithPatient[],
  intent: WhatsAppIntent
) {
  if (matches.length === 0) return null

  const ordered = [...matches].sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
  const actionable = ordered.find(
    (appointment) =>
      appointment.status === AppointmentStatus.PENDING ||
      appointment.status === AppointmentStatus.CONFIRMED
  )

  if (intent === WhatsAppIntent.CONFIRM || intent === WhatsAppIntent.CANCEL) {
    return actionable || ordered[0]
  }

  return ordered[0]
}

async function getDoctorWhatsAppRules(doctorId: string): Promise<DoctorWhatsAppRules> {
  const defaults: DoctorWhatsAppRules = {
    autoReplyEnabled: true,
    autoConfirmEnabled: true,
    autoCancelEnabled: true,
  }

  try {
    const rows = await prisma.$queryRaw<Array<{
      whatsappAutoReplyEnabled: boolean | null
      whatsappAutoConfirmEnabled: boolean | null
      whatsappAutoCancelEnabled: boolean | null
    }>>`
      SELECT
        "whatsappAutoReplyEnabled",
        "whatsappAutoConfirmEnabled",
        "whatsappAutoCancelEnabled"
      FROM "DoctorConfig"
      WHERE "doctorId" = ${doctorId}
      LIMIT 1
    `

    const row = rows[0]
    if (!row) return defaults

    return {
      autoReplyEnabled: row.whatsappAutoReplyEnabled ?? defaults.autoReplyEnabled,
      autoConfirmEnabled: row.whatsappAutoConfirmEnabled ?? defaults.autoConfirmEnabled,
      autoCancelEnabled: row.whatsappAutoCancelEnabled ?? defaults.autoCancelEnabled,
    }
  } catch {
    return defaults
  }
}

async function getCandidateAppointments(doctorId: string, now: Date) {
  return prisma.appointment.findMany({
    where: {
      doctorId,
      status: {
        in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED, AppointmentStatus.CANCELLED],
      },
      startTime: {
        gte: subHours(now, 24),
        lte: addDays(now, 14),
      },
    },
    include: {
      patient: {
        select: {
          id: true,
          firstName: true,
          lastNamePaternal: true,
          lastNameMaternal: true,
          phone: true,
        },
      },
    },
    orderBy: { startTime: 'asc' },
  })
}

function formatDateTime(date: Date) {
  return format(date, 'dd/MM/yyyy HH:mm')
}

export async function POST(request: Request) {
  try {
    emitMetric({ domain: 'whatsapp', metric: 'incoming_message_received' })
    const env = getServerEnv()
    const expectedSecret = env.WHATSAPP_WEBHOOK_SECRET
    if (!expectedSecret) {
      return NextResponse.json(
        { error: 'No está configurado WHATSAPP_WEBHOOK_SECRET' },
        { status: 503 }
      )
    }

    const providedSecret = request.headers.get('x-whatsapp-secret') ?? ''
    const expected = Buffer.from(expectedSecret)
    const provided = Buffer.from(providedSecret)
    const secretValid =
      provided.length === expected.length && timingSafeEqual(provided, expected)
    if (!secretValid) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const parsed = incomingMessageSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Payload inválido', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const doctorId = parsed.data.doctorId
    const incomingPhone = normalizePhone(parsed.data.from)
    const message = parsed.data.message.trim()
    const intent = detectIntent(message)
    emitMetric({ domain: 'whatsapp', metric: 'incoming_intent_detected', tags: { intent } })
    const normalizedMessage = normalizeText(message)
    const wantsReschedule = RESCHEDULE_KEYWORDS.some((keyword) => normalizedMessage.includes(keyword))
    const now = new Date()

    const rules = await getDoctorWhatsAppRules(doctorId)
    const candidateAppointments = await getCandidateAppointments(doctorId, now)

    const matches = candidateAppointments.filter(
      (appointment) => normalizePhone(appointment.patient.phone) === incomingPhone
    )
    const matchedAppointment = pickTargetAppointment(matches, intent)

    let replyMessage: string | null = null
    let action: WhatsAppMessageAction = WhatsAppMessageAction.NO_CHANGE

    if (intent === WhatsAppIntent.CONFIRM) {
      if (!matchedAppointment) {
        replyMessage =
          'Recibimos tu confirmación, pero no encontramos una cita próxima con este número. ' +
          'Por favor contacta al consultorio para ayudarte.'
        action = WhatsAppMessageAction.NO_APPOINTMENT
      } else if (matchedAppointment.status === AppointmentStatus.CONFIRMED) {
        replyMessage =
          `Tu cita del ${formatDateTime(matchedAppointment.startTime)} ya estaba confirmada. ` +
          '¡Te esperamos!'
        action = WhatsAppMessageAction.ALREADY_CONFIRMED
      } else if (matchedAppointment.status === AppointmentStatus.CANCELLED) {
        replyMessage =
          `La cita del ${formatDateTime(matchedAppointment.startTime)} aparece cancelada. ` +
          'Si necesitas reactivarla, comunícate al consultorio.'
        action = WhatsAppMessageAction.NO_CHANGE
      } else if (!rules.autoConfirmEnabled) {
        replyMessage =
          'Recibimos tu mensaje. El consultorio validará tu confirmación manualmente en breve.'
        action = WhatsAppMessageAction.NO_CHANGE
      } else {
        await prisma.appointment.update({
          where: { id: matchedAppointment.id },
          data: { status: AppointmentStatus.CONFIRMED },
        })

        await AppointmentAuditService.safeLog({
          doctorId,
          appointmentId: matchedAppointment.id,
          patientId: matchedAppointment.patient.id,
          actorType: 'BOT',
          source: 'WHATSAPP_BOT',
          action: 'APPOINTMENT_STATUS_CHANGED',
          fromStatus: matchedAppointment.status,
          toStatus: AppointmentStatus.CONFIRMED,
          metadata: {
            trigger: 'patient_whatsapp_message',
            intent: intent,
            messageId: parsed.data.messageId ?? null,
          },
        })

        replyMessage =
          `Gracias, tu cita del ${formatDateTime(matchedAppointment.startTime)} quedó confirmada correctamente. ` +
          '¡Te esperamos!'
        action = WhatsAppMessageAction.APPOINTMENT_CONFIRMED

        logEvent('info', 'whatsapp.appointment.confirmed_from_message', {
          appointmentId: matchedAppointment.id,
          doctorId,
          patientId: matchedAppointment.patient.id,
          messageId: parsed.data.messageId ?? null,
        })
      }
    } else if (intent === WhatsAppIntent.CANCEL) {
      if (!matchedAppointment) {
        replyMessage =
          'Recibimos tu mensaje, pero no encontramos una cita próxima con este número. ' +
          'Por favor contacta al consultorio para ayudarte.'
        action = WhatsAppMessageAction.NO_APPOINTMENT
      } else if (matchedAppointment.status === AppointmentStatus.CANCELLED) {
        replyMessage =
          `Tu cita del ${formatDateTime(matchedAppointment.startTime)} ya estaba cancelada.`
        action = WhatsAppMessageAction.ALREADY_CANCELLED
      } else if (!rules.autoCancelEnabled) {
        replyMessage =
          'Recibimos tu solicitud. El consultorio revisará la cancelación manualmente.'
        action = WhatsAppMessageAction.NO_CHANGE
      } else {
        await prisma.appointment.update({
          where: { id: matchedAppointment.id },
          data: { status: AppointmentStatus.CANCELLED },
        })

        await WaitlistService.processVacancy({
          doctorId,
          clinicId: matchedAppointment.clinicId,
          sourceAppointmentId: matchedAppointment.id,
          slotStartTime: matchedAppointment.startTime,
          slotEndTime: matchedAppointment.endTime,
          actorType: 'BOT',
          source: 'WHATSAPP_BOT',
          trigger: 'CANCELLATION',
        })

        await AppointmentAuditService.safeLog({
          doctorId,
          appointmentId: matchedAppointment.id,
          patientId: matchedAppointment.patient.id,
          actorType: 'BOT',
          source: 'WHATSAPP_BOT',
          action: 'APPOINTMENT_CANCELLED',
          fromStatus: matchedAppointment.status,
          toStatus: AppointmentStatus.CANCELLED,
          metadata: {
            trigger: 'patient_whatsapp_message',
            intent: intent,
            messageId: parsed.data.messageId ?? null,
          },
        })

        replyMessage =
          `Tu cita del ${formatDateTime(matchedAppointment.startTime)} fue cancelada correctamente. ` +
          'Si deseas reagendar, responde a este mensaje o contacta al consultorio.'
        action = WhatsAppMessageAction.APPOINTMENT_CANCELLED

        logEvent('info', 'whatsapp.appointment.cancelled_from_message', {
          appointmentId: matchedAppointment.id,
          doctorId,
          patientId: matchedAppointment.patient.id,
          messageId: parsed.data.messageId ?? null,
        })
      }
    } else if (rules.autoReplyEnabled) {
      if (wantsReschedule) {
        if (!matchedAppointment) {
          replyMessage =
            'Recibimos tu solicitud para reagendar, pero no encontramos una cita próxima con este número. ' +
            'Comparte tu nombre completo y la fecha aproximada de la cita para ayudarte.'
        } else {
          const parsedNewStart = parseRescheduleDateTimeFromMessage(message)
          if (!parsedNewStart) {
            replyMessage =
              `Recibimos tu solicitud para reagendar la cita del ${formatDateTime(matchedAppointment.startTime)}. ` +
              'Envíanos la nueva fecha y hora en formato DD/MM/AAAA HH:mm para validar disponibilidad.'
          } else if (parsedNewStart <= now) {
            replyMessage =
              'La nueva fecha/hora debe ser futura. Envíala en formato DD/MM/AAAA HH:mm.'
          } else if (matchedAppointment.status === AppointmentStatus.CANCELLED) {
            replyMessage =
              `La cita del ${formatDateTime(matchedAppointment.startTime)} aparece cancelada. ` +
              'Por favor solicita una nueva cita al consultorio.'
          } else {
            const newEnd = new Date(parsedNewStart.getTime() + matchedAppointment.durationMin * 60_000)
            const overlapAppointment = await prisma.appointment.findFirst({
              where: {
                doctorId,
                id: { not: matchedAppointment.id },
                status: { notIn: [AppointmentStatus.CANCELLED] },
                startTime: { lt: newEnd },
                endTime: { gt: parsedNewStart },
              },
              select: { id: true },
            })

            const overlapBlock = overlapAppointment
              ? null
              : await prisma.scheduleBlock.findFirst({
                  where: {
                    doctorId,
                    startTime: { lt: newEnd },
                    endTime: { gt: parsedNewStart },
                  },
                  select: { id: true },
                })

            if (overlapAppointment || overlapBlock) {
              replyMessage =
                'Ese horario no está disponible. Envíanos otra opción en formato DD/MM/AAAA HH:mm.'
            } else {
              const localDate = new Date(parsedNewStart)
              localDate.setHours(0, 0, 0, 0)
              const previousStatus = matchedAppointment.status
              const updated = await prisma.appointment.update({
                where: { id: matchedAppointment.id },
                data: {
                  date: localDate,
                  startTime: parsedNewStart,
                  endTime: newEnd,
                  status: previousStatus === AppointmentStatus.PENDING ? AppointmentStatus.PENDING : AppointmentStatus.CONFIRMED,
                },
              })

              await AppointmentAuditService.safeLog({
                doctorId,
                appointmentId: updated.id,
                patientId: matchedAppointment.patient.id,
                actorType: 'BOT',
                source: 'WHATSAPP_BOT',
                action: 'APPOINTMENT_RESCHEDULED',
                fromStatus: previousStatus,
                toStatus: updated.status,
                metadata: {
                  trigger: 'patient_whatsapp_message',
                  intent: 'RESCHEDULE_REQUEST',
                  messageId: parsed.data.messageId ?? null,
                  previousStartTime: matchedAppointment.startTime.toISOString(),
                  previousEndTime: matchedAppointment.endTime.toISOString(),
                  nextStartTime: updated.startTime.toISOString(),
                  nextEndTime: updated.endTime.toISOString(),
                },
              })

              replyMessage =
                `Tu cita fue reagendada al ${formatDateTime(updated.startTime)}. ` +
                'Si deseas otro cambio, responde con la nueva fecha y hora.'
              logEvent('info', 'whatsapp.appointment.rescheduled_from_message', {
                appointmentId: updated.id,
                doctorId,
                patientId: matchedAppointment.patient.id,
                messageId: parsed.data.messageId ?? null,
              })
            }
          }
        }
        action = WhatsAppMessageAction.NO_CHANGE
      } else if (matchedAppointment) {
        replyMessage =
          `Tu próxima cita es el ${formatDateTime(matchedAppointment.startTime)}. ` +
          'Si deseas confirmarla responde "CONFIRMO". Si deseas cancelarla responde "CANCELAR". Si deseas reagendar responde "REAGENDAR".'
      } else {
        replyMessage =
          'Hola, gracias por escribir al consultorio. Te responderemos a la brevedad. ' +
          'Si deseas confirmar una cita, responde "CONFIRMO". Para cancelar, responde "CANCELAR". Para reagendar, responde "REAGENDAR".'
      }
      if (!wantsReschedule) {
        action = WhatsAppMessageAction.AUTO_REPLY
      }
    }

    await WhatsAppMessageLogService.create({
      doctorId,
      appointmentId: matchedAppointment?.id ?? null,
      patientId: matchedAppointment?.patient.id ?? null,
      phone: incomingPhone,
      message,
      direction: WhatsAppMessageDirection.INBOUND,
      intent,
      action,
    })

    if (replyMessage) {
      await WhatsAppMessageLogService.create({
        doctorId,
        appointmentId: matchedAppointment?.id ?? null,
        patientId: matchedAppointment?.patient.id ?? null,
        phone: incomingPhone,
        message: replyMessage,
        direction: WhatsAppMessageDirection.OUTBOUND,
        intent,
        action,
      })
    }

    emitMetric({
      domain: 'whatsapp',
      metric: 'incoming_message_processed',
      tags: {
        action,
        hasMatchedAppointment: Boolean(matchedAppointment),
      },
    })

    return NextResponse.json({
      success: true,
      action,
      appointmentId: matchedAppointment?.id ?? null,
      replyMessage,
    })
  } catch (error: unknown) {
    captureError('whatsapp.incoming.error', error)
    emitMetric({ domain: 'whatsapp', metric: 'incoming_message_error' })
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
