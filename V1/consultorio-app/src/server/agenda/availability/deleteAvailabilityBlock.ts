import type { PrismaClient } from '@prisma/client'
import { AvailabilityNotFoundError } from '@/server/agenda/availability/errors'

type DeleteAvailabilityBlockInput = {
  doctorId: string
  blockId: string
}

export async function deleteAvailabilityBlock(
  prisma: PrismaClient,
  input: DeleteAvailabilityBlockInput,
) {
  const existing = await prisma.availabilityBlock.findFirst({
    where: { id: input.blockId, doctorId: input.doctorId },
    select: { id: true },
  })

  if (!existing) {
    throw new AvailabilityNotFoundError('Bloque de disponibilidad no encontrado.')
  }

  await prisma.availabilityBlock.delete({
    where: { id: existing.id },
  })

  return { success: true }
}

