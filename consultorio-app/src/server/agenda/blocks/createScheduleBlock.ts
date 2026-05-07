import type { PrismaClient } from '@prisma/client'
import {
  AgendaBlockConflictError,
  AgendaBlockForbiddenError,
  AgendaBlockInputError,
} from '@/server/agenda/blocks/errors'

type CreateScheduleBlockInput = {
  actorUserId: string
  canManageDoctors: boolean
  doctorId?: string
  startTime: string
  endTime: string
  reason?: string
  type: 'BLOCKED' | 'PRIVATE_RESERVED'
}

export async function createScheduleBlock(
  prisma: PrismaClient,
  input: CreateScheduleBlockInput,
) {
  let doctorId = input.actorUserId

  if (input.doctorId && input.doctorId !== input.actorUserId) {
    if (!input.canManageDoctors) {
      throw new AgendaBlockForbiddenError('No autorizado para bloquear agenda de otro médico.')
    }

    const actor = await prisma.user.findUnique({
      where: { id: input.actorUserId },
      select: { clinicId: true },
    })
    if (!actor?.clinicId) {
      throw new AgendaBlockForbiddenError('CLINIC_ADMIN sin clínica asignada.')
    }

    const targetDoctor = await prisma.user.findFirst({
      where: {
        id: input.doctorId,
        clinicId: actor.clinicId,
        active: true,
        role: { in: ['DOCTOR', 'CLINIC_ADMIN'] },
      },
      select: { id: true },
    })
    if (!targetDoctor) {
      throw new AgendaBlockForbiddenError('El médico seleccionado no pertenece a tu clínica.')
    }

    doctorId = targetDoctor.id
  }

  const startTime = new Date(input.startTime)
  const endTime = new Date(input.endTime)
  if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
    throw new AgendaBlockInputError('Fecha/hora inválida')
  }
  if (endTime <= startTime) {
    throw new AgendaBlockInputError('El fin debe ser mayor al inicio')
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
    throw new AgendaBlockConflictError('Conflicto con cita existente. Mueve o cancela la cita primero.')
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
    throw new AgendaBlockConflictError('Ya existe un bloqueo que se traslapa.')
  }

  const date = new Date(startTime)
  date.setHours(0, 0, 0, 0)

  const block = await prisma.scheduleBlock.create({
    data: {
      doctorId,
      date,
      startTime,
      endTime,
      reason: input.reason,
      type: input.type,
    },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      type: true,
      reason: true,
    },
  })

  return { success: true, block }
}

