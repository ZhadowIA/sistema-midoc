import { addMinutes, format, startOfDay, endOfDay } from 'date-fns'
import {
  AppointmentStatus,
  AuditAction,
  WaitlistEntry,
  WaitlistEntryStatus,
  WaitlistOfferStatus,
  WaitlistOfferType,
} from '@prisma/client'
import prisma from '@/lib/prisma'
import { sendSms } from '@/lib/smsProvider'
import { sendEmail } from '@/lib/emailProvider'
import { AppointmentAuditService } from '@/services/AppointmentAuditService'
import { formatPatientName } from '@/lib/patientName'

type CreateWaitlistEntryInput = {
  doctorId: string
  clinicId?: string | null
  patientId: string
  appointmentType?: 'NORMAL' | 'EXTENDED' | null
  preferredWeekdays?: number[] | null
  preferredStartMinute?: number | null
  preferredEndMinute?: number | null
  priority?: number
  notes?: string | null
}

type ProcessVacancyInput = {
  doctorId: string
  clinicId?: string | null
  sourceAppointmentId?: string | null
  slotStartTime: Date
  slotEndTime: Date
  actorType: 'DOCTOR' | 'PATIENT' | 'BOT' | 'SYSTEM'
  actorUserId?: string | null
  source: 'ADMIN_PANEL' | 'PATIENT_PORTAL' | 'WHATSAPP_BOT' | 'SYSTEM' | 'AUTOMATION'
  trigger: 'CANCELLATION' | 'EXPIRATION' | 'MANUAL' | 'UNCONFIRMED'
}

const UNCONFIRMED_LEAD_MINUTES_DEFAULT = 180
const UNCONFIRMED_MARKER_PREFIX = 'WAITLIST_UNCONFIRMED_TRIGGERED:'

const OFFER_TTL_MINUTES = 15
const WAITLIST_BLOCK_REASON_PREFIX = 'WAITLIST_OFFER:'

function minutesFromDate(date: Date) {
  return date.getHours() * 60 + date.getMinutes()
}

function slotMatchesPreferences(entry: WaitlistEntry, slotStart: Date) {
  const minute = minutesFromDate(slotStart)
  const weekday = slotStart.getDay()
  const weekdayAsIso = weekday === 0 ? 7 : weekday

  const weekdays = Array.isArray(entry.preferredWeekdays) ? entry.preferredWeekdays : null
  if (weekdays && weekdays.length > 0 && !weekdays.includes(weekdayAsIso)) {
    return false
  }

  if (entry.preferredStartMinute !== null && entry.preferredStartMinute !== undefined) {
    if (minute < entry.preferredStartMinute) return false
  }

  if (entry.preferredEndMinute !== null && entry.preferredEndMinute !== undefined) {
    if (minute > entry.preferredEndMinute) return false
  }

  return true
}

export class WaitlistService {
  static async createEntry(input: CreateWaitlistEntryInput) {
    return prisma.waitlistEntry.create({
      data: {
        doctorId: input.doctorId,
        clinicId: input.clinicId ?? null,
        patientId: input.patientId,
        appointmentType: input.appointmentType ?? null,
        preferredWeekdays: input.preferredWeekdays ?? undefined,
        preferredStartMinute: input.preferredStartMinute ?? null,
        preferredEndMinute: input.preferredEndMinute ?? null,
        priority: input.priority ?? 100,
        notes: input.notes ?? null,
      },
    })
  }

  static async expireDueOffers(now = new Date()) {
    const dueOffers = await prisma.waitlistOffer.findMany({
      where: {
        status: WaitlistOfferStatus.SENT,
        expiresAt: { lte: now },
      },
      include: {
        waitlistEntry: true,
      },
    })

    for (const offer of dueOffers) {
      await prisma.waitlistOffer.update({
        where: { id: offer.id },
        data: {
          status: WaitlistOfferStatus.EXPIRED,
          expiredAt: now,
        },
      })

      await AppointmentAuditService.safeLog({
        doctorId: offer.doctorId,
        appointmentId: offer.sourceAppointmentId,
        patientId: offer.patientId,
        actorType: 'SYSTEM',
        source: 'AUTOMATION',
        action: AuditAction.WAITLIST_OFFER_EXPIRED,
        metadata: {
          waitlistOfferId: offer.id,
          waitlistEntryId: offer.waitlistEntryId,
          slotStartTime: offer.slotStartTime.toISOString(),
          slotEndTime: offer.slotEndTime.toISOString(),
        },
      })

      await this.processVacancy({
        doctorId: offer.doctorId,
        clinicId: offer.clinicId,
        sourceAppointmentId: offer.sourceAppointmentId,
        slotStartTime: offer.slotStartTime,
        slotEndTime: offer.slotEndTime,
        actorType: 'SYSTEM',
        source: 'AUTOMATION',
        trigger: 'EXPIRATION',
      })
    }

    return dueOffers.length
  }

  static async processVacancy(input: ProcessVacancyInput) {
    await this.expireOverlappingOffers(input)

    const existingSentForSlot = await prisma.waitlistOffer.findFirst({
      where: {
        doctorId: input.doctorId,
        status: WaitlistOfferStatus.SENT,
        slotStartTime: input.slotStartTime,
        slotEndTime: input.slotEndTime,
      },
      select: { id: true },
    })

    if (existingSentForSlot) {
      return { offered: false, reason: 'ACTIVE_OFFER_EXISTS' as const }
    }

    const entries = await prisma.waitlistEntry.findMany({
      where: {
        doctorId: input.doctorId,
        clinicId: input.clinicId ?? null,
        status: WaitlistEntryStatus.ACTIVE,
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastNamePaternal: true,
            lastNameMaternal: true,
            phone: true,
            email: true,
          },
        },
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    })

    for (const entry of entries) {
      if (!slotMatchesPreferences(entry, input.slotStartTime)) {
        continue
      }

      const hasActiveOffer = await prisma.waitlistOffer.findFirst({
        where: {
          waitlistEntryId: entry.id,
          status: WaitlistOfferStatus.SENT,
        },
        select: { id: true },
      })
      if (hasActiveOffer) continue

      const overlaps = await prisma.appointment.findFirst({
        where: {
          patientId: entry.patientId,
          status: { notIn: [AppointmentStatus.CANCELLED] },
          startTime: { lt: input.slotEndTime },
          endTime: { gt: input.slotStartTime },
        },
        select: { id: true },
      })
      if (overlaps) continue

      const created = await prisma.$transaction(async (tx) => {
        const offer = await tx.waitlistOffer.create({
          data: {
            offerType: WaitlistOfferType.WAITLIST,
            waitlistEntryId: entry.id,
            doctorId: entry.doctorId,
            clinicId: entry.clinicId,
            patientId: entry.patientId,
            sourceAppointmentId: input.sourceAppointmentId ?? null,
            slotStartTime: input.slotStartTime,
            slotEndTime: input.slotEndTime,
            expiresAt: addMinutes(new Date(), OFFER_TTL_MINUTES),
            status: WaitlistOfferStatus.SENT,
            notifiedChannels: ['SMS', 'EMAIL', 'PORTAL'],
            metadata: {
              trigger: input.trigger,
            },
          },
        })

        const existingBlock = await tx.scheduleBlock.findFirst({
          where: {
            doctorId: input.doctorId,
            startTime: input.slotStartTime,
            endTime: input.slotEndTime,
            reason: `${WAITLIST_BLOCK_REASON_PREFIX}${offer.id}`,
            type: 'PRIVATE_RESERVED',
          },
          select: { id: true },
        })

        if (!existingBlock) {
          const date = new Date(input.slotStartTime)
          date.setHours(0, 0, 0, 0)
          await tx.scheduleBlock.create({
            data: {
              doctorId: input.doctorId,
              date,
              startTime: input.slotStartTime,
              endTime: input.slotEndTime,
              type: 'PRIVATE_RESERVED',
              reason: `${WAITLIST_BLOCK_REASON_PREFIX}${offer.id}`,
            },
          })
        }

        return offer
      })

      await AppointmentAuditService.safeLog({
        doctorId: input.doctorId,
        appointmentId: input.sourceAppointmentId,
        patientId: entry.patient.id,
        actorType: input.actorType,
        actorUserId: input.actorUserId ?? null,
        source: input.source,
        action: AuditAction.WAITLIST_OFFER_SENT,
        metadata: {
          waitlistOfferId: created.id,
          waitlistEntryId: entry.id,
          slotStartTime: input.slotStartTime.toISOString(),
          slotEndTime: input.slotEndTime.toISOString(),
          expiresAt: created.expiresAt.toISOString(),
          trigger: input.trigger,
        },
      })

      await this.sendOfferNotification({
        to: entry.patient.phone,
        email: entry.patient.email ?? undefined,
        patientName: formatPatientName(entry.patient),
        offerId: created.id,
        slotStartTime: input.slotStartTime,
        expiresAt: created.expiresAt,
        messageType: 'WAITLIST',
      })

      return { offered: true, offerId: created.id }
    }

    return { offered: false, reason: 'NO_MATCHING_PATIENT' as const }
  }

  static async respondToOffer(params: {
    offerId: string
    decision: 'ACCEPT' | 'REJECT'
    actorType: 'DOCTOR' | 'PATIENT' | 'BOT' | 'SYSTEM'
    actorUserId?: string | null
    source: 'ADMIN_PANEL' | 'PATIENT_PORTAL' | 'WHATSAPP_BOT' | 'SYSTEM' | 'AUTOMATION'
  }) {
    const offer = await prisma.waitlistOffer.findUnique({
      where: { id: params.offerId },
      include: { waitlistEntry: true },
    })

    if (!offer) throw new Error('WAITLIST_OFFER_NOT_FOUND')
    if (offer.status !== WaitlistOfferStatus.SENT) throw new Error('WAITLIST_OFFER_NOT_ACTIONABLE')

    const now = new Date()
    if (offer.expiresAt <= now) {
      await prisma.waitlistOffer.update({
        where: { id: offer.id },
        data: { status: WaitlistOfferStatus.EXPIRED, expiredAt: now },
      })
      throw new Error('WAITLIST_OFFER_EXPIRED')
    }

    if (params.decision === 'REJECT') {
      await prisma.waitlistOffer.update({
        where: { id: offer.id },
        data: {
          status: WaitlistOfferStatus.REJECTED,
          rejectedAt: now,
        },
      })

      await prisma.scheduleBlock.deleteMany({
        where: {
          doctorId: offer.doctorId,
          startTime: offer.slotStartTime,
          endTime: offer.slotEndTime,
          reason: `${WAITLIST_BLOCK_REASON_PREFIX}${offer.id}`,
          type: 'PRIVATE_RESERVED',
        },
      })

      await AppointmentAuditService.safeLog({
        doctorId: offer.doctorId,
        appointmentId: offer.sourceAppointmentId,
        patientId: offer.patientId,
        actorType: params.actorType,
        actorUserId: params.actorUserId ?? null,
        source: params.source,
        action: AuditAction.WAITLIST_OFFER_REJECTED,
        metadata: {
          waitlistOfferId: offer.id,
          waitlistEntryId: offer.waitlistEntryId,
        },
      })

      await this.processVacancy({
        doctorId: offer.doctorId,
        clinicId: offer.clinicId,
        sourceAppointmentId: offer.sourceAppointmentId,
        slotStartTime: offer.slotStartTime,
        slotEndTime: offer.slotEndTime,
        actorType: 'SYSTEM',
        source: 'AUTOMATION',
        trigger: 'MANUAL',
      })

      return { status: 'REJECTED' as const }
    }

    const durationMin = Math.max(15, Math.round((offer.slotEndTime.getTime() - offer.slotStartTime.getTime()) / 60000))
    const newSlotDate = new Date(offer.slotStartTime)
    newSlotDate.setHours(0, 0, 0, 0)

    if (offer.offerType === WaitlistOfferType.SAME_DAY_ADVANCE) {
      if (!offer.existingAppointmentId) throw new Error('WAITLIST_OFFER_INVALID')

      const existingAppt = await prisma.appointment.findUnique({
        where: { id: offer.existingAppointmentId },
        select: { id: true, startTime: true, endTime: true, appointmentType: true, durationMin: true },
      })
      if (!existingAppt) throw new Error('WAITLIST_EXISTING_APPOINTMENT_NOT_FOUND')

      const vacatedSlotStart = existingAppt.startTime
      const vacatedSlotEnd = existingAppt.endTime

      const rescheduledAppointment = await prisma.$transaction(async (tx) => {
        const overlap = await tx.appointment.findFirst({
          where: {
            doctorId: offer.doctorId,
            id: { not: offer.existingAppointmentId! },
            status: { notIn: [AppointmentStatus.CANCELLED] },
            startTime: { lt: offer.slotEndTime },
            endTime: { gt: offer.slotStartTime },
          },
          select: { id: true },
        })
        if (overlap) throw new Error('WAITLIST_SLOT_TAKEN')

        await tx.waitlistOffer.update({
          where: { id: offer.id },
          data: { status: WaitlistOfferStatus.ACCEPTED, acceptedAt: now },
        })

        await tx.waitlistOffer.updateMany({
          where: {
            id: { not: offer.id },
            doctorId: offer.doctorId,
            slotStartTime: offer.slotStartTime,
            slotEndTime: offer.slotEndTime,
            status: WaitlistOfferStatus.SENT,
          },
          data: { status: WaitlistOfferStatus.EXPIRED, expiredAt: now },
        })

        await tx.scheduleBlock.deleteMany({
          where: {
            doctorId: offer.doctorId,
            startTime: offer.slotStartTime,
            endTime: offer.slotEndTime,
            type: 'PRIVATE_RESERVED',
          },
        })

        return tx.appointment.update({
          where: { id: offer.existingAppointmentId! },
          data: {
            date: newSlotDate,
            startTime: offer.slotStartTime,
            endTime: offer.slotEndTime,
            status: 'CONFIRMED',
            notes: `Adelantada desde lista de espera (offerId: ${offer.id})`,
          },
        })
      })

      await AppointmentAuditService.safeLog({
        doctorId: offer.doctorId,
        appointmentId: rescheduledAppointment.id,
        patientId: offer.patientId,
        actorType: params.actorType,
        actorUserId: params.actorUserId ?? null,
        source: params.source,
        action: AuditAction.WAITLIST_OFFER_ACCEPTED,
        metadata: { waitlistOfferId: offer.id, offerType: 'SAME_DAY_ADVANCE' },
      })

      await AppointmentAuditService.safeLog({
        doctorId: offer.doctorId,
        appointmentId: rescheduledAppointment.id,
        patientId: offer.patientId,
        actorType: params.actorType,
        actorUserId: params.actorUserId ?? null,
        source: params.source,
        action: AuditAction.WAITLIST_SLOT_REASSIGNED,
        metadata: {
          waitlistOfferId: offer.id,
          previousSlotStart: vacatedSlotStart.toISOString(),
          previousSlotEnd: vacatedSlotEnd.toISOString(),
        },
      })

      // El slot vacío del paciente puede ser tomado por alguien más
      await this.processVacancy({
        doctorId: offer.doctorId,
        clinicId: offer.clinicId,
        sourceAppointmentId: rescheduledAppointment.id,
        slotStartTime: vacatedSlotStart,
        slotEndTime: vacatedSlotEnd,
        actorType: 'SYSTEM',
        source: 'AUTOMATION',
        trigger: 'MANUAL',
      })

      return { status: 'ACCEPTED' as const, appointmentId: rescheduledAppointment.id }
    }

    // WAITLIST: crear nueva cita
    const appointmentType = offer.waitlistEntry?.appointmentType ?? 'NORMAL'

    const createdAppointment = await prisma.$transaction(async (tx) => {
      const overlap = await tx.appointment.findFirst({
        where: {
          doctorId: offer.doctorId,
          status: { notIn: [AppointmentStatus.CANCELLED] },
          startTime: { lt: offer.slotEndTime },
          endTime: { gt: offer.slotStartTime },
        },
        select: { id: true },
      })
      if (overlap) throw new Error('WAITLIST_SLOT_TAKEN')

      await tx.waitlistOffer.update({
        where: { id: offer.id },
        data: { status: WaitlistOfferStatus.ACCEPTED, acceptedAt: now },
      })

      await tx.waitlistOffer.updateMany({
        where: {
          id: { not: offer.id },
          doctorId: offer.doctorId,
          slotStartTime: offer.slotStartTime,
          slotEndTime: offer.slotEndTime,
          status: WaitlistOfferStatus.SENT,
        },
        data: { status: WaitlistOfferStatus.EXPIRED, expiredAt: now },
      })

      if (offer.waitlistEntryId) {
        await tx.waitlistEntry.update({
          where: { id: offer.waitlistEntryId },
          data: { status: WaitlistEntryStatus.BOOKED },
        })
      }

      await tx.scheduleBlock.deleteMany({
        where: {
          doctorId: offer.doctorId,
          startTime: offer.slotStartTime,
          endTime: offer.slotEndTime,
          type: 'PRIVATE_RESERVED',
        },
      })

      return tx.appointment.create({
        data: {
          doctorId: offer.doctorId,
          clinicId: offer.clinicId,
          patientId: offer.patientId,
          date: newSlotDate,
          startTime: offer.slotStartTime,
          endTime: offer.slotEndTime,
          appointmentType,
          durationMin,
          source: 'DOCTOR',
          status: 'CONFIRMED',
          notes: `Asignada desde lista de espera (offerId: ${offer.id})`,
        },
      })
    })

    await AppointmentAuditService.safeLog({
      doctorId: offer.doctorId,
      appointmentId: createdAppointment.id,
      patientId: offer.patientId,
      actorType: params.actorType,
      actorUserId: params.actorUserId ?? null,
      source: params.source,
      action: AuditAction.WAITLIST_OFFER_ACCEPTED,
      metadata: { waitlistOfferId: offer.id, waitlistEntryId: offer.waitlistEntryId },
    })

    await AppointmentAuditService.safeLog({
      doctorId: offer.doctorId,
      appointmentId: createdAppointment.id,
      patientId: offer.patientId,
      actorType: params.actorType,
      actorUserId: params.actorUserId ?? null,
      source: params.source,
      action: AuditAction.WAITLIST_SLOT_REASSIGNED,
      metadata: { waitlistOfferId: offer.id, sourceAppointmentId: offer.sourceAppointmentId },
    })

    return { status: 'ACCEPTED' as const, appointmentId: createdAppointment.id }
  }

  static async processUnconfirmedVacancies(options: { leadMinutes?: number } = {}) {
    const leadMinutes = options.leadMinutes ?? UNCONFIRMED_LEAD_MINUTES_DEFAULT
    const now = new Date()
    const cutoff = addMinutes(now, leadMinutes)

    const unconfirmed = await prisma.appointment.findMany({
      where: {
        status: AppointmentStatus.PENDING,
        startTime: { gt: now, lte: cutoff },
        externalId: { not: { startsWith: UNCONFIRMED_MARKER_PREFIX } },
      },
      select: {
        id: true,
        doctorId: true,
        clinicId: true,
        startTime: true,
        endTime: true,
      },
    })

    let processed = 0
    for (const appt of unconfirmed) {
      await prisma.appointment.update({
        where: { id: appt.id },
        data: { externalId: `${UNCONFIRMED_MARKER_PREFIX}${appt.id}` },
      })

      await this.processVacancy({
        doctorId: appt.doctorId,
        clinicId: appt.clinicId,
        sourceAppointmentId: appt.id,
        slotStartTime: appt.startTime,
        slotEndTime: appt.endTime,
        actorType: 'SYSTEM',
        source: 'AUTOMATION',
        trigger: 'UNCONFIRMED',
      })

      await this.processSameDayAdvanceOffers({
        doctorId: appt.doctorId,
        clinicId: appt.clinicId,
        unconfirmedAppointmentId: appt.id,
        slotStartTime: appt.startTime,
        slotEndTime: appt.endTime,
      })

      processed++
    }

    return { processed }
  }

  private static async processSameDayAdvanceOffers(input: {
    doctorId: string
    clinicId?: string | null
    unconfirmedAppointmentId: string
    slotStartTime: Date
    slotEndTime: Date
  }) {
    const dayStart = startOfDay(input.slotStartTime)
    const dayEnd = endOfDay(input.slotStartTime)

    const sameDayPatients = await prisma.appointment.findMany({
      where: {
        doctorId: input.doctorId,
        id: { not: input.unconfirmedAppointmentId },
        status: { in: [AppointmentStatus.CONFIRMED, AppointmentStatus.PENDING] },
        startTime: { gt: input.slotEndTime, gte: dayStart, lte: dayEnd },
      },
      select: {
        id: true,
        patientId: true,
        startTime: true,
        endTime: true,
        patient: { select: { id: true, firstName: true, lastNamePaternal: true, lastNameMaternal: true, phone: true, email: true } },
      },
      orderBy: { startTime: 'asc' },
    })

    for (const appt of sameDayPatients) {
      const alreadyOffered = await prisma.waitlistOffer.findFirst({
        where: {
          patientId: appt.patientId,
          doctorId: input.doctorId,
          offerType: WaitlistOfferType.SAME_DAY_ADVANCE,
          slotStartTime: input.slotStartTime,
          status: WaitlistOfferStatus.SENT,
        },
        select: { id: true },
      })
      if (alreadyOffered) continue

      const offer = await prisma.waitlistOffer.create({
        data: {
          offerType: WaitlistOfferType.SAME_DAY_ADVANCE,
          existingAppointmentId: appt.id,
          doctorId: input.doctorId,
          clinicId: input.clinicId ?? null,
          patientId: appt.patientId,
          sourceAppointmentId: input.unconfirmedAppointmentId,
          slotStartTime: input.slotStartTime,
          slotEndTime: input.slotEndTime,
          expiresAt: addMinutes(new Date(), OFFER_TTL_MINUTES),
          status: WaitlistOfferStatus.SENT,
          notifiedChannels: ['SMS', 'EMAIL', 'PORTAL'],
          metadata: { trigger: 'UNCONFIRMED', existingSlotStart: appt.startTime.toISOString() },
        },
      })

      await this.sendOfferNotification({
        to: appt.patient.phone,
        email: appt.patient.email ?? undefined,
        patientName: formatPatientName(appt.patient),
        offerId: offer.id,
        slotStartTime: input.slotStartTime,
        expiresAt: offer.expiresAt,
        messageType: 'SAME_DAY_ADVANCE',
        currentSlotTime: appt.startTime,
      })

      await AppointmentAuditService.safeLog({
        doctorId: input.doctorId,
        appointmentId: input.unconfirmedAppointmentId,
        patientId: appt.patientId,
        actorType: 'SYSTEM',
        source: 'AUTOMATION',
        action: AuditAction.WAITLIST_OFFER_SENT,
        metadata: {
          waitlistOfferId: offer.id,
          offerType: 'SAME_DAY_ADVANCE',
          existingAppointmentId: appt.id,
          slotStartTime: input.slotStartTime.toISOString(),
        },
      })

      // Solo notificamos al primero en aceptar — si acepta, el slot queda tomado
      return
    }
  }

  private static async sendOfferNotification(input: {
    to: string
    email?: string
    patientName: string
    offerId: string
    slotStartTime: Date
    expiresAt: Date
    messageType: 'WAITLIST' | 'SAME_DAY_ADVANCE'
    currentSlotTime?: Date
  }) {
    const formattedSlot = format(input.slotStartTime, 'dd/MM/yyyy HH:mm')
    const formattedExpiry = format(input.expiresAt, 'HH:mm')

    const smsBody = input.messageType === 'SAME_DAY_ADVANCE'
      ? `Hola ${input.patientName}, hay un espacio disponible a las ${format(input.slotStartTime, 'HH:mm')} hoy, antes de tu cita de las ${format(input.currentSlotTime!, 'HH:mm')}. Si quieres adelantar, acepta en el portal antes de las ${formattedExpiry} (ID: ${input.offerId}).`
      : `Hola ${input.patientName}, se liberó un espacio para consulta el ${formattedSlot}. Acepta en el portal antes de las ${formattedExpiry} (ID: ${input.offerId}).`

    try {
      await sendSms(input.to, smsBody)
    } catch (error) {
      console.error('[WaitlistService] Error enviando SMS de oferta', error)
    }

    if (input.email) {
      const subject = input.messageType === 'SAME_DAY_ADVANCE'
        ? 'Espacio disponible para adelantar tu cita de hoy'
        : `Espacio disponible para consulta el ${formattedSlot}`
      try {
        await sendEmail({ to: input.email, subject, text: smsBody })
      } catch (error) {
        console.error('[WaitlistService] Error enviando email de oferta', error)
      }
    }
  }

  private static async expireOverlappingOffers(input: ProcessVacancyInput) {
    const now = new Date()
    await prisma.waitlistOffer.updateMany({
      where: {
        doctorId: input.doctorId,
        status: WaitlistOfferStatus.SENT,
        OR: [
          { expiresAt: { lte: now } },
          {
            slotStartTime: input.slotStartTime,
            slotEndTime: input.slotEndTime,
          },
        ],
      },
      data: {
        status: WaitlistOfferStatus.EXPIRED,
        expiredAt: now,
      },
    })
  }

  private static async sendOfferWhatsApp(input: {
    doctorId: string
    to: string
    patientName: string
    offerId: string
    slotStartTime: Date
    expiresAt: Date
  }) {
    const msg =
      `Hola *${input.patientName}*, se liberó un espacio para consulta el *${format(input.slotStartTime, 'dd/MM/yyyy HH:mm')}*. ` +
      `Responde en portal para tomarlo antes de *${format(input.expiresAt, 'HH:mm')}* (ID oferta: ${input.offerId}).`

    try {
      await fetch(getWhatsAppProviderSendUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorId: input.doctorId,
          to: input.to,
          message: msg,
        }),
      })
    } catch (error) {
      console.error('[WaitlistService] No se pudo enviar oferta por WhatsApp', error)
    }
  }
}
