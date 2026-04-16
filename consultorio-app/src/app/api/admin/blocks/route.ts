import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { getAuthenticatedDoctorId } from '@/lib/auth'

const createBlockSchema = z.object({
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  reason: z.string().optional(),
  type: z.enum(['BLOCKED', 'PRIVATE_RESERVED']).default('BLOCKED'),
})

export async function POST(request: Request) {
  try {
    const doctorId = await getAuthenticatedDoctorId()
    if (!doctorId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await request.json()
    const parsed = createBlockSchema.parse(body)

    const startTime = new Date(parsed.startTime)
    const endTime = new Date(parsed.endTime)
    if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
      return NextResponse.json({ error: 'Fecha/hora inválida' }, { status: 400 })
    }
    if (endTime <= startTime) {
      return NextResponse.json({ error: 'El fin debe ser mayor al inicio' }, { status: 400 })
    }

    const overlapAppointment = await prisma.appointment.findFirst({
      where: {
        doctorId,
        status: { notIn: ['CANCELLED'] },
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
      select: { id: true },
    })
    if (overlapAppointment) {
      return NextResponse.json(
        { error: 'Conflicto con cita existente. Mueve o cancela la cita primero.' },
        { status: 409 }
      )
    }

    const overlapBlock = await prisma.scheduleBlock.findFirst({
      where: {
        doctorId,
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
      select: { id: true },
    })
    if (overlapBlock) {
      return NextResponse.json({ error: 'Ya existe un bloqueo que se traslapa.' }, { status: 409 })
    }

    const date = new Date(startTime)
    date.setHours(0, 0, 0, 0)

    const block = await prisma.scheduleBlock.create({
      data: {
        doctorId,
        date,
        startTime,
        endTime,
        reason: parsed.reason,
        type: parsed.type,
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        type: true,
        reason: true,
      },
    })

    return NextResponse.json({ success: true, block }, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Payload inválido', details: error.issues }, { status: 400 })
    }
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
