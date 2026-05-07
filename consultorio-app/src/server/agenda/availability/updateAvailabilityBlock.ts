import type { PrismaClient } from '@prisma/client'
import {
  AvailabilityConflictError,
  AvailabilityInputError,
  AvailabilityNotFoundError,
} from '@/server/agenda/availability/errors'
import {
  parseDateTimeInput,
  toAvailabilityBlockDto,
  validateAvailabilityWindow,
} from '@/server/agenda/availability/shared'

type UpdateAvailabilityBlockInput = {
  doctorId: string
  blockId: string
  date?: string
  startTime?: string
  endTime?: string
  isPublic?: boolean
  active?: boolean
}

export async function updateAvailabilityBlock(
  prisma: PrismaClient,
  input: UpdateAvailabilityBlockInput,
) {
  const existing = await prisma.availabilityBlock.findFirst({
    where: { id: input.blockId, doctorId: input.doctorId },
  })

  if (!existing) {
    throw new AvailabilityNotFoundError('Bloque de disponibilidad no encontrado.')
  }

  const config = await prisma.doctorConfig.findUnique({
    where: { doctorId: input.doctorId },
    select: { consultationDurationMin: true },
  })

  if (!config) {
    throw new AvailabilityInputError('Configuración del médico no encontrada.')
  }

  const startTime = input.startTime
    ? parseDateTimeInput(input.startTime, 'startTime')
    : existing.startTime
  const endTime = input.endTime
    ? parseDateTimeInput(input.endTime, 'endTime')
    : existing.endTime

  const localDate = validateAvailabilityWindow(
    startTime,
    endTime,
    config.consultationDurationMin,
    input.date,
  )

  const overlap = await prisma.availabilityBlock.findFirst({
    where: {
      doctorId: input.doctorId,
      id: { not: existing.id },
      active: true,
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
    select: { id: true },
  })

  if (overlap) {
    throw new AvailabilityConflictError('El bloque se traslapa con otro bloque de disponibilidad activo.')
  }

  const updated = await prisma.availabilityBlock.update({
    where: { id: existing.id },
    data: {
      date: localDate,
      startTime,
      endTime,
      isPublic: input.isPublic ?? existing.isPublic,
      active: input.active ?? existing.active,
    },
  })

  return {
    success: true,
    block: toAvailabilityBlockDto(updated),
  }
}

