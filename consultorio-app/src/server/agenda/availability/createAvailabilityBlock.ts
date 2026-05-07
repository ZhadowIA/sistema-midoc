import type { PrismaClient } from '@prisma/client'
import { AvailabilityConflictError, AvailabilityInputError } from '@/server/agenda/availability/errors'
import {
  parseDateTimeInput,
  toAvailabilityBlockDto,
  validateAvailabilityWindow,
} from '@/server/agenda/availability/shared'

type CreateAvailabilityBlockInput = {
  doctorId: string
  date?: string
  startTime: string
  endTime: string
  isPublic: boolean
  active: boolean
}

export async function createAvailabilityBlock(
  prisma: PrismaClient,
  input: CreateAvailabilityBlockInput,
) {
  const config = await prisma.doctorConfig.findUnique({
    where: { doctorId: input.doctorId },
    select: { consultationDurationMin: true },
  })

  if (!config) {
    throw new AvailabilityInputError('Configuración del médico no encontrada.')
  }

  const startTime = parseDateTimeInput(input.startTime, 'startTime')
  const endTime = parseDateTimeInput(input.endTime, 'endTime')
  const localDate = validateAvailabilityWindow(
    startTime,
    endTime,
    config.consultationDurationMin,
    input.date,
  )

  const overlap = await prisma.availabilityBlock.findFirst({
    where: {
      doctorId: input.doctorId,
      active: true,
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
    select: { id: true },
  })

  if (overlap) {
    throw new AvailabilityConflictError('El bloque se traslapa con otro bloque de disponibilidad activo.')
  }

  const created = await prisma.availabilityBlock.create({
    data: {
      doctorId: input.doctorId,
      date: localDate,
      startTime,
      endTime,
      isPublic: input.isPublic,
      active: input.active,
    },
  })

  return {
    success: true,
    block: toAvailabilityBlockDto(created),
  }
}

