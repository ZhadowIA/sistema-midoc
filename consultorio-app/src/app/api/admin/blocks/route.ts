import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { requireAgendaDoctorApiAccess } from '@/lib/medicalApi'

const createBlockSchema = z.object({
  doctorId: z.string().min(1).optional(),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  reason: z.string().optional(),
  type: z.enum(['BLOCKED', 'PRIVATE_RESERVED']).default('BLOCKED'),
})

export async function POST(request: Request) {
  try {
    const access = await requireAgendaDoctorApiAccess({ allowSecretary: false })
    if (access.response) return access.response
    const authUser = access.context.user
    if (authUser.role !== 'DOCTOR' && authUser.role !== 'ADMIN' && authUser.role !== 'CLINIC_ADMIN') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = createBlockSchema.parse(body)
    let doctorId = authUser.id

    if (parsed.doctorId && parsed.doctorId !== authUser.id) {
      if (authUser.role !== 'CLINIC_ADMIN') {
        return NextResponse.json({ error: 'No autorizado para bloquear agenda de otro médico.' }, { status: 403 })
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
          id: parsed.doctorId,
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
