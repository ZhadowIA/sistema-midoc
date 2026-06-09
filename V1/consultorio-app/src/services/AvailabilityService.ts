import prisma from '../lib/prisma'
import { addMinutes, areIntervalsOverlapping } from 'date-fns'
import {
  alignToSlotGrid,
  getDayRangeLocal,
  parseDateOnlyLocal,
  toLocalDateKey,
} from '../lib/dateTime'
import {
  SLOT_HOLD_REASON_PREFIX,
  getSlotHoldActiveCutoff,
  isActiveTemporarySlotHold,
  isTemporarySlotHoldBlock,
} from '@/lib/slotHold'

export class AvailabilityService {
  private static async cleanupExpiredSlotHolds(doctorId: string) {
    await prisma.scheduleBlock.deleteMany({
      where: {
        doctorId,
        type: 'PRIVATE_RESERVED',
        reason: { startsWith: SLOT_HOLD_REASON_PREFIX },
        createdAt: { lt: getSlotHoldActiveCutoff() },
      },
    })
  }

  static async getAvailability(doctorId: string, dateStr: string, type: 'normal' | 'extended') {
    await this.cleanupExpiredSlotHolds(doctorId)

    const config = await prisma.doctorConfig.findUnique({ where: { doctorId } })
    if (!config) throw new Error("Configuración no encontrada")

    if (type === 'extended' && !config.extendedConsultationEnabled) {
      return {
        date: dateStr,
        consultationDurationMin: config.consultationDurationMin,
        extendedConsultationDurationMin: config.consultationDurationMin * 2,
        slots: [],
      }
    }

    const baseDuration = config.consultationDurationMin
    const extendedDuration = baseDuration * 2
    const duration = type === 'extended' ? extendedDuration : baseDuration

    const { start, endExclusive } = getDayRangeLocal(dateStr)

    // Obtenemos bloques públicos activos
    const blocks = await prisma.availabilityBlock.findMany({
      where: {
        doctorId,
        isPublic: true,
        active: true,
        startTime: { lt: endExclusive },
        endTime: { gt: start },
      },
      orderBy: { startTime: 'asc' },
    })

    // Obtenemos citas del día (no canceladas)
    const appointments = await prisma.appointment.findMany({
      where: {
        doctorId,
        status: { notIn: ['CANCELLED'] },
        startTime: { lt: endExclusive },
        endTime: { gt: start },
      },
    })

    // Obtenemos bloqueos manuales
    const blockers = await prisma.scheduleBlock.findMany({
      where: {
        doctorId,
        startTime: { lt: endExclusive },
        endTime: { gt: start },
      },
    })

    const effectiveBlockers = blockers.filter((block) => {
      if (!isTemporarySlotHoldBlock(block)) return true
      return isActiveTemporarySlotHold(block)
    })

    const availableSlots: Array<{ start: string; end: string; type: 'normal' | 'extended' }> = []

    for (const block of blocks) {
      const boundedStart = block.startTime < start ? start : block.startTime
      const boundedEnd = block.endTime > endExclusive ? endExclusive : block.endTime
      let current = alignToSlotGrid(block.startTime, boundedStart, baseDuration)

      // Avanzamos en intervalos de baseDuration
      while (addMinutes(current, duration) <= boundedEnd) {
        const slotEnd = addMinutes(current, duration)

        // Verificamos si el horario ya pasó en la vida real
        const now = new Date()
        if (current >= now) {
          // Verificamos traslapes con citas
          const hasAptOverlap = appointments.some((apt) =>
            areIntervalsOverlapping(
              { start: apt.startTime, end: apt.endTime },
              { start: current, end: slotEnd }
            )
          )

          // Verificamos traslapes con bloqueos
          const hasBlockOverlap = effectiveBlockers.some((b) =>
            areIntervalsOverlapping(
              { start: b.startTime, end: b.endTime },
              { start: current, end: slotEnd }
            )
          )

          if (!hasAptOverlap && !hasBlockOverlap) {
            availableSlots.push({
              start: current.toISOString(),
              end: slotEnd.toISOString(),
              type
            })
          }
        }

        current = addMinutes(current, baseDuration)
      }
    }

    return {
      date: dateStr,
      consultationDurationMin: baseDuration,
      extendedConsultationDurationMin: extendedDuration,
      slots: availableSlots
    }
  }

  static async getAvailableDatesInMonth(doctorId: string, startDateStr: string, endDateStr: string, type: 'normal' | 'extended') {
    await this.cleanupExpiredSlotHolds(doctorId)

    const config = await prisma.doctorConfig.findUnique({ where: { doctorId } })
    if (!config) return []

    if (type === 'extended' && !config.extendedConsultationEnabled) {
      return []
    }

    const baseDuration = config.consultationDurationMin
    const duration = type === 'extended' ? baseDuration * 2 : baseDuration

    const startDate = parseDateOnlyLocal(startDateStr)
    const endDate = parseDateOnlyLocal(endDateStr)

    const blocks = await prisma.availabilityBlock.findMany({
      where: {
        doctorId,
        isPublic: true,
        active: true,
        startTime: { lt: endDate },
        endTime: { gt: startDate },
      },
      orderBy: { date: 'asc' }
    })

    const appointments = await prisma.appointment.findMany({
      where: {
        doctorId,
        status: { notIn: ['CANCELLED'] },
        startTime: { lt: endDate },
        endTime: { gt: startDate },
      }
    })

    const blockers = await prisma.scheduleBlock.findMany({
      where: {
        doctorId,
        startTime: { lt: endDate },
        endTime: { gt: startDate },
      },
    })

    const effectiveBlockers = blockers.filter((block) => {
      if (!isTemporarySlotHoldBlock(block)) return true
      return isActiveTemporarySlotHold(block)
    })

    const datesWithSlots = new Set<string>()

    for (const block of blocks) {
      const boundedStart = block.startTime < startDate ? startDate : block.startTime
      const boundedEnd = block.endTime > endDate ? endDate : block.endTime
      let current = alignToSlotGrid(block.startTime, boundedStart, baseDuration)

      const now = new Date()
      if (boundedEnd < now) continue

      while (addMinutes(current, duration) <= boundedEnd) {
        const slotEnd = addMinutes(current, duration)
        if (current >= now) {
          const hasApt = appointments.some((apt) =>
            areIntervalsOverlapping({ start: apt.startTime, end: apt.endTime }, { start: current, end: slotEnd })
          )
          const hasBlock = effectiveBlockers.some((b) =>
            areIntervalsOverlapping({ start: b.startTime, end: b.endTime }, { start: current, end: slotEnd })
          )

          if (!hasApt && !hasBlock) {
            datesWithSlots.add(toLocalDateKey(current))
            break // We just need to know if there's AT LEAST one slot
          }
        }
        current = addMinutes(current, baseDuration)
      }
    }

    return Array.from(datesWithSlots)
  }
}
