import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { getAuthenticatedDoctorId } from '@/lib/auth'
import { getDayRangeLocal, parseDateOnlyLocal, toLocalDateKey } from '@/lib/dateTime'

const createAvailabilitySchema = z.object({
  date: z.string().optional(),
  startTime: z.string().min(1, 'startTime requerido'),
  endTime: z.string().min(1, 'endTime requerido'),
  isPublic: z.boolean().optional().default(true),
  active: z.boolean().optional().default(true),
})

function parseDateTimeInput(value: string, field: string): Date {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${field} inválido`)
  }
  return parsed
}

function validateAvailabilityWindow(
  startTime: Date,
  endTime: Date,
  baseDuration: number,
  explicitDate?: string
): Date {
  if (endTime <= startTime) {
    throw new Error('endTime debe ser mayor que startTime')
  }

  if (toLocalDateKey(startTime) !== toLocalDateKey(endTime)) {
    throw new Error('El bloque de disponibilidad debe iniciar y terminar el mismo día local.')
  }

  const windowMs = endTime.getTime() - startTime.getTime()
  if (windowMs % 60_000 !== 0) {
    throw new Error('El bloque debe tener precisión en minutos.')
  }

  const durationMinutes = windowMs / 60_000
  if (durationMinutes % baseDuration !== 0) {
    throw new Error(
      `El bloque debe ser múltiplo exacto de ${baseDuration} minutos.`
    )
  }

  if (explicitDate) {
    const parsedDate = parseDateOnlyLocal(explicitDate)
    if (toLocalDateKey(parsedDate) !== toLocalDateKey(startTime)) {
      throw new Error('La fecha no coincide con el startTime enviado.')
    }
  }

  const localDate = new Date(startTime)
  localDate.setHours(0, 0, 0, 0)
  return localDate
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const isPublic = searchParams.get('isPublic')
  const active = searchParams.get('active')

  try {
    const doctorId = await getAuthenticatedDoctorId()
    if (!doctorId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const where: Prisma.AvailabilityBlockWhereInput = { doctorId }

    if (isPublic !== null) where.isPublic = isPublic === 'true'
    if (active !== null) where.active = active === 'true'

    if (date) {
      const { start, endExclusive } = getDayRangeLocal(date)
      where.startTime = { lt: endExclusive }
      where.endTime = { gt: start }
    } else if (from || to) {
      if (!from || !to) {
        return NextResponse.json(
          { error: 'Para usar rango debes enviar ambos parámetros: from y to (YYYY-MM-DD).' },
          { status: 400 }
        )
      }
      const start = getDayRangeLocal(from).start
      const endExclusive = getDayRangeLocal(to).endExclusive
      if (endExclusive <= start) {
        return NextResponse.json(
          { error: 'Rango inválido. "to" debe ser posterior a "from".' },
          { status: 400 }
        )
      }
      where.startTime = { lt: endExclusive }
      where.endTime = { gt: start }
    }

    const blocks = await prisma.availabilityBlock.findMany({
      where,
      orderBy: { startTime: 'asc' },
    })

    return NextResponse.json({
      blocks: blocks.map((block) => ({
        id: block.id,
        dateLocal: toLocalDateKey(block.startTime),
        startTime: block.startTime,
        endTime: block.endTime,
        isPublic: block.isPublic,
        active: block.active,
      })),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const doctorId = await getAuthenticatedDoctorId()
    if (!doctorId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const payload = createAvailabilitySchema.parse(await request.json())

    const config = await prisma.doctorConfig.findUnique({
      where: { doctorId },
      select: { consultationDurationMin: true },
    })

    if (!config) {
      return NextResponse.json({ error: 'Configuración del médico no encontrada.' }, { status: 400 })
    }

    const startTime = parseDateTimeInput(payload.startTime, 'startTime')
    const endTime = parseDateTimeInput(payload.endTime, 'endTime')
    const localDate = validateAvailabilityWindow(
      startTime,
      endTime,
      config.consultationDurationMin,
      payload.date
    )

    const overlap = await prisma.availabilityBlock.findFirst({
      where: {
        doctorId,
        active: true,
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
      select: { id: true },
    })

    if (overlap) {
      return NextResponse.json(
        { error: 'El bloque se traslapa con otro bloque de disponibilidad activo.' },
        { status: 409 }
      )
    }

    const created = await prisma.availabilityBlock.create({
      data: {
        doctorId,
        date: localDate,
        startTime,
        endTime,
        isPublic: payload.isPublic,
        active: payload.active,
      },
    })

    return NextResponse.json(
      {
        success: true,
        block: {
          id: created.id,
          dateLocal: toLocalDateKey(created.startTime),
          startTime: created.startTime,
          endTime: created.endTime,
          isPublic: created.isPublic,
          active: created.active,
        },
      },
      { status: 201 }
    )
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Payload inválido', details: error.issues }, { status: 400 })
    }
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
