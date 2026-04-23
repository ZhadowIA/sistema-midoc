import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { addDays, format } from 'date-fns'
import { z } from 'zod'
import { requireAgendaDoctorApiAccess } from '@/lib/medicalApi'

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/
const DEFAULT_HORIZON_DAYS = 365

const scheduleDaySchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    active: z.boolean(),
    start: z.string().regex(TIME_PATTERN, 'Hora inicio inválida. Usa HH:mm.'),
    end: z.string().regex(TIME_PATTERN, 'Hora fin inválida. Usa HH:mm.'),
    hasBreak: z.boolean().optional().default(false),
    breakStart: z.string().regex(TIME_PATTERN, 'Hora inicio de receso inválida.').optional(),
    breakEnd: z.string().regex(TIME_PATTERN, 'Hora fin de receso inválida.').optional(),
  })
  .superRefine((value, ctx) => {
    const toMinutes = (time: string): number => {
      const [h, m] = time.split(':').map(Number)
      return h * 60 + m
    }

    const start = toMinutes(value.start)
    const end = toMinutes(value.end)

    if (value.active && start >= end) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'La hora de inicio debe ser menor a la de fin.',
        path: ['start'],
      })
    }

    if (value.hasBreak) {
      if (!value.breakStart || !value.breakEnd) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Debes enviar breakStart y breakEnd cuando hasBreak es true.',
          path: ['hasBreak'],
        })
        return
      }

      const breakStart = toMinutes(value.breakStart)
      const breakEnd = toMinutes(value.breakEnd)
      if (!(start < breakStart && breakStart < breakEnd && breakEnd < end)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'El receso debe estar dentro del horario y en orden válido.',
          path: ['breakStart'],
        })
      }
    }
  })

const requestSchema = z.object({
  schedule: z.array(scheduleDaySchema).min(1, 'Debes enviar al menos un día de configuración.'),
  horizonDays: z.number().int().min(30).max(365).optional(),
})

function applyTime(baseDate: Date, time: string): Date {
  const [hour, minute] = time.split(':').map(Number)
  const withTime = new Date(baseDate)
  withTime.setHours(hour, minute, 0, 0)
  return withTime
}

export async function POST(request: Request) {
  try {
    const access = await requireAgendaDoctorApiAccess()
    if (access.response) return access.response

    const payload = requestSchema.parse(await request.json())
    const schedule = payload.schedule
    const horizonDays = payload.horizonDays ?? DEFAULT_HORIZON_DAYS

    const doctorId = access.context.doctorId

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const endDateExclusive = addDays(today, horizonDays)

    const protectedAppointments = await prisma.appointment.findMany({
      where: {
        doctorId,
        status: { notIn: ['CANCELLED'] },
        startTime: { gte: today, lt: endDateExclusive },
      },
      select: { startTime: true },
    })

    const protectedDates = new Set(
      protectedAppointments.map((apt) => format(apt.startTime, 'yyyy-MM-dd'))
    )

    const existingBlocks = await prisma.availabilityBlock.findMany({
      where: {
        doctorId,
        isPublic: true,
        date: { gte: today, lt: endDateExclusive },
      },
      select: { id: true, date: true },
    })

    const idsToDelete = existingBlocks
      .filter((block) => !protectedDates.has(format(block.date, 'yyyy-MM-dd')))
      .map((block) => block.id)

    if (idsToDelete.length > 0) {
      await prisma.availabilityBlock.deleteMany({
        where: {
          doctorId,
          id: { in: idsToDelete },
        },
      })
    }

    const scheduleByDay = new Map(schedule.map((day) => [day.dayOfWeek, day]))
    const newBlocks: Prisma.AvailabilityBlockCreateManyInput[] = []

    for (let i = 0; i < horizonDays; i += 1) {
      const iterDate = addDays(today, i)
      const localDateKey = format(iterDate, 'yyyy-MM-dd')

      // Conservamos días con citas para no mover ventanas activas por accidente.
      if (protectedDates.has(localDateKey)) {
        continue
      }

      const dayConfig = scheduleByDay.get(iterDate.getDay())

      if (dayConfig && dayConfig.active) {
        const startTime = applyTime(iterDate, dayConfig.start)
        const endTime = applyTime(iterDate, dayConfig.end)

        if (dayConfig.hasBreak) {
          if (!dayConfig.breakStart || !dayConfig.breakEnd) {
            continue
          }

          const breakStart = applyTime(iterDate, dayConfig.breakStart)
          const breakEnd = applyTime(iterDate, dayConfig.breakEnd)

          newBlocks.push({
            doctorId,
            date: iterDate,
            startTime,
            endTime: breakStart,
            isPublic: true,
            active: true,
          })

          newBlocks.push({
            doctorId,
            date: iterDate,
            startTime: breakEnd,
            endTime,
            isPublic: true,
            active: true,
          })
        } else {
          newBlocks.push({
            doctorId,
            date: iterDate,
            startTime,
            endTime,
            isPublic: true,
            active: true,
          })
        }
      }
    }

    if (newBlocks.length > 0) {
      await prisma.availabilityBlock.createMany({
        data: newBlocks,
      })
    }

    return NextResponse.json({
      success: true,
      horizonDays,
      generatedBlocks: newBlocks.length,
      deletedBlocks: idsToDelete.length,
      skippedDaysWithAppointments: protectedDates.size,
    })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Payload inválido', details: error.issues }, { status: 400 })
    }
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
