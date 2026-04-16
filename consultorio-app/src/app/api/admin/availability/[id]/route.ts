import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { getAuthenticatedDoctorId } from '@/lib/auth'
import { parseDateOnlyLocal, toLocalDateKey } from '@/lib/dateTime'

const updateAvailabilitySchema = z
  .object({
    date: z.string().optional(),
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    isPublic: z.boolean().optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.date !== undefined ||
      data.startTime !== undefined ||
      data.endTime !== undefined ||
      data.isPublic !== undefined ||
      data.active !== undefined,
    { message: 'No hay campos para actualizar.' }
  )

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

export async function PUT(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params
  try {
    const doctorId = await getAuthenticatedDoctorId()
    if (!doctorId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const existing = await prisma.availabilityBlock.findFirst({
      where: { id: params.id, doctorId },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Bloque de disponibilidad no encontrado.' }, { status: 404 })
    }

    const payload = updateAvailabilitySchema.parse(await request.json())

    const config = await prisma.doctorConfig.findUnique({
      where: { doctorId },
      select: { consultationDurationMin: true },
    })

    if (!config) {
      return NextResponse.json({ error: 'Configuración del médico no encontrada.' }, { status: 400 })
    }

    const startTime = payload.startTime
      ? parseDateTimeInput(payload.startTime, 'startTime')
      : existing.startTime
    const endTime = payload.endTime
      ? parseDateTimeInput(payload.endTime, 'endTime')
      : existing.endTime

    const localDate = validateAvailabilityWindow(
      startTime,
      endTime,
      config.consultationDurationMin,
      payload.date
    )

    const overlap = await prisma.availabilityBlock.findFirst({
      where: {
        doctorId,
        id: { not: existing.id },
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

    const updated = await prisma.availabilityBlock.update({
      where: { id: existing.id },
      data: {
        date: localDate,
        startTime,
        endTime,
        isPublic: payload.isPublic ?? existing.isPublic,
        active: payload.active ?? existing.active,
      },
    })

    return NextResponse.json({
      success: true,
      block: {
        id: updated.id,
        dateLocal: toLocalDateKey(updated.startTime),
        startTime: updated.startTime,
        endTime: updated.endTime,
        isPublic: updated.isPublic,
        active: updated.active,
      },
    })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Payload inválido', details: error.issues }, { status: 400 })
    }
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params
  try {
    const doctorId = await getAuthenticatedDoctorId()
    if (!doctorId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const existing = await prisma.availabilityBlock.findFirst({
      where: { id: params.id, doctorId },
      select: { id: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Bloque de disponibilidad no encontrado.' }, { status: 404 })
    }

    await prisma.availabilityBlock.delete({
      where: { id: existing.id },
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
