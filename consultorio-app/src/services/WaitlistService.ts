import { addMinutes, format } from 'date-fns'
import {
  AppointmentStatus,
  AuditAction,
  WaitlistEntry,
  WaitlistEntryStatus,
  WaitlistOfferStatus,
} from '@prisma/client'
import prisma from '@/lib/prisma'
import { getWhatsAppProviderSendUrl } from '@/lib/whatsappProvider'
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
  trigger: 'CANCELLATION' | 'EXPIRATION' | 'MANUAL'
}

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
            waitlistEntryId: entry.id,
            doctorId: entry.doctorId,
            clinicId: entry.clinicId,
            patientId: entry.patientId,
            sourceAppointmentId: input.sourceAppointmentId ?? null,
            slotStartTime: input.slotStartTime,
            slotEndTime: input.slotEndTime,
            expiresAt: addMinutes(new Date(), OFFER_TTL_MINUTES),
            status: WaitlistOfferStatus.SENT,
            notifiedChannels: ['WHATSAPP', 'PORTAL'],
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

      await this.sendOfferWhatsApp({
        doctorId: input.doctorId,
        to: entry.patient.phone,
        patientName: formatPatientName(entry.patient),
        offerId: created.id,
        slotStartTime: input.slotStartTime,
        expiresAt: created.expiresAt,
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

    const appointmentType = offer.waitlistEntry.appointmentType ?? 'NORMAL'
    const durationMin = Math.max(15, Math.round((offer.slotEndTime.getTime() - offer.slotStartTime.getTime()) / 60000))

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
        data: {
          status: WaitlistOfferStatus.ACCEPTED,
          acceptedAt: now,
        },
      })

      await tx.waitlistOffer.updateMany({
        where: {
          id: { not: offer.id },
          doctorId: offer.doctorId,
          slotStartTime: offer.slotStartTime,
          slotEndTime: offer.slotEndTime,
          status: WaitlistOfferStatus.SENT,
        },
        data: {
          status: WaitlistOfferStatus.EXPIRED,
          expiredAt: now,
        },
      })

      await tx.waitlistEntry.update({
        where: { id: offer.waitlistEntryId },
        data: { status: WaitlistEntryStatus.BOOKED },
      })

      await tx.scheduleBlock.deleteMany({
        where: {
          doctorId: offer.doctorId,
          startTime: offer.slotStartTime,
          endTime: offer.slotEndTime,
          type: 'PRIVATE_RESERVED',
        },
      })

      const date = new Date(offer.slotStartTime)
      date.setHours(0, 0, 0, 0)

      return tx.appointment.create({
        data: {
          doctorId: offer.doctorId,
          clinicId: offer.clinicId,
          patientId: offer.patientId,
          date,
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
      metadata: {
        waitlistOfferId: offer.id,
        waitlistEntryId: offer.waitlistEntryId,
      },
    })

    await AppointmentAuditService.safeLog({
      doctorId: offer.doctorId,
      appointmentId: createdAppointment.id,
      patientId: offer.patientId,
      actorType: params.actorType,
      actorUserId: params.actorUserId ?? null,
      source: params.source,
      action: AuditAction.WAITLIST_SLOT_REASSIGNED,
      metadata: {
        waitlistOfferId: offer.id,
        sourceAppointmentId: offer.sourceAppointmentId,
      },
    })

    return {
      status: 'ACCEPTED' as const,
      appointmentId: createdAppointment.id,
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
