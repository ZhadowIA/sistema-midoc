import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { addMinutes, format } from 'date-fns'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { AvailabilityService } from '@/services/AvailabilityService'
import { AppointmentType, ScheduleBlockType } from '@prisma/client'
import {
  SLOT_HOLD_REASON_PREFIX,
  SLOT_HOLD_TTL_MINUTES,
  buildSlotHoldReason,
  getSlotHoldActiveCutoff,
  getSlotHoldExpiration,
} from '@/lib/slotHold'

const holdSchema = z.object({
  doctorId: z.string().cuid(),
  startTime: z.string().datetime({ offset: true }),
  appointmentType: z.enum(['NORMAL', 'EXTENDED']),
})

const releaseSchema = z.object({
  doctorId: z.string().cuid(),
  holdToken: z.string().uuid(),
})

export async function POST(request: Request) {
  try {
    const parsed = holdSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Payload inválido', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const payload = parsed.data
    const doctor = await prisma.user.findFirst({
      where: {
        id: payload.doctorId,
        active: true,
        role: { in: ['DOCTOR', 'ADMIN'] },
      },
      select: { id: true },
    })
    if (!doctor) {
      return NextResponse.json({ error: 'Médico no disponible.' }, { status: 404 })
    }

    const config = await prisma.doctorConfig.findUnique({
      where: { doctorId: payload.doctorId },
      select: { consultationDurationMin: true, extendedConsultationEnabled: true },
    })
    if (!config) {
      return NextResponse.json({ error: 'Configuración médica no encontrada.' }, { status: 400 })
    }

    if (payload.appointmentType === 'EXTENDED' && !config.extendedConsultationEnabled) {
      return NextResponse.json({ error: 'La consulta extendida no está habilitada.' }, { status: 400 })
    }

    const startTime = new Date(payload.startTime)
    if (Number.isNaN(startTime.getTime()) || startTime <= new Date()) {
      return NextResponse.json({ error: 'Horario inválido para reservar temporalmente.' }, { status: 409 })
    }

    const durationMin =
      payload.appointmentType === AppointmentType.EXTENDED
        ? config.consultationDurationMin * 2
        : config.consultationDurationMin
    const endTime = addMinutes(startTime, durationMin)

    const dateKey = format(startTime, 'yyyy-MM-dd')
    const typeKey = payload.appointmentType === 'EXTENDED' ? 'extended' : 'normal'
    const availability = await AvailabilityService.getAvailability(payload.doctorId, dateKey, typeKey)
    const slot = availability.slots.find((item) => item.start === startTime.toISOString())
    if (!slot) {
      return NextResponse.json(
        { error: 'Ese horario ya no está disponible. Selecciona otro módulo.' },
        { status: 409 }
      )
    }

    const token = randomUUID()
    const activeCutoff = getSlotHoldActiveCutoff()
    await prisma.scheduleBlock.deleteMany({
      where: {
        doctorId: payload.doctorId,
        type: ScheduleBlockType.PRIVATE_RESERVED,
        reason: { startsWith: SLOT_HOLD_REASON_PREFIX },
        createdAt: { lt: activeCutoff },
      },
    })

    const overlapAppointment = await prisma.appointment.findFirst({
      where: {
        doctorId: payload.doctorId,
        status: { notIn: ['CANCELLED'] },
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
      select: { id: true },
    })
    if (overlapAppointment) {
      return NextResponse.json(
        { error: 'Ese horario ya fue tomado por otra cita.' },
        { status: 409 }
      )
    }

    const overlappingBlocks = await prisma.scheduleBlock.findFirst({
      where: {
        doctorId: payload.doctorId,
        startTime: { lt: endTime },
        endTime: { gt: startTime },
        NOT: {
          AND: [
            { reason: { startsWith: SLOT_HOLD_REASON_PREFIX } },
            { createdAt: { lt: activeCutoff } },
          ],
        },
      },
      select: { id: true },
    })
    if (overlappingBlocks) {
      return NextResponse.json(
        { error: 'Otro paciente está confirmando ese horario. Intenta con otro módulo.' },
        { status: 409 }
      )
    }

    const hold = await prisma.scheduleBlock.create({
      data: {
        doctorId: payload.doctorId,
        date: new Date(dateKey),
        startTime,
        endTime,
        type: ScheduleBlockType.PRIVATE_RESERVED,
        reason: buildSlotHoldReason(token),
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        createdAt: true,
      },
    })

    return NextResponse.json({
      success: true,
      holdToken: token,
      holdId: hold.id,
      startTime: hold.startTime.toISOString(),
      endTime: hold.endTime.toISOString(),
      expiresAt: getSlotHoldExpiration(hold.createdAt).toISOString(),
      ttlMinutes: SLOT_HOLD_TTL_MINUTES,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const parsed = releaseSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Payload inválido', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const reason = buildSlotHoldReason(parsed.data.holdToken)
    const deleted = await prisma.scheduleBlock.deleteMany({
      where: {
        doctorId: parsed.data.doctorId,
        reason,
        type: ScheduleBlockType.PRIVATE_RESERVED,
      },
    })

    return NextResponse.json({
      success: true,
      released: deleted.count,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
