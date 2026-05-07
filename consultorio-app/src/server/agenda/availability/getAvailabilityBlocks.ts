import { Prisma, type PrismaClient } from '@prisma/client'
import { getDayRangeLocal } from '@/lib/dateTime'
import { AvailabilityInputError } from '@/server/agenda/availability/errors'
import { toAvailabilityBlockDto } from '@/server/agenda/availability/shared'

type GetAvailabilityBlocksInput = {
  doctorId: string
  date: string | null
  from: string | null
  to: string | null
  isPublic: string | null
  active: string | null
}

export async function getAvailabilityBlocks(
  prisma: PrismaClient,
  input: GetAvailabilityBlocksInput,
) {
  const where: Prisma.AvailabilityBlockWhereInput = { doctorId: input.doctorId }

  if (input.isPublic !== null) where.isPublic = input.isPublic === 'true'
  if (input.active !== null) where.active = input.active === 'true'

  if (input.date) {
    const { start, endExclusive } = getDayRangeLocal(input.date)
    where.startTime = { lt: endExclusive }
    where.endTime = { gt: start }
  } else if (input.from || input.to) {
    if (!input.from || !input.to) {
      throw new AvailabilityInputError('Para usar rango debes enviar ambos parámetros: from y to (YYYY-MM-DD).')
    }
    const start = getDayRangeLocal(input.from).start
    const endExclusive = getDayRangeLocal(input.to).endExclusive
    if (endExclusive <= start) {
      throw new AvailabilityInputError('Rango inválido. "to" debe ser posterior a "from".')
    }
    where.startTime = { lt: endExclusive }
    where.endTime = { gt: start }
  }

  const blocks = await prisma.availabilityBlock.findMany({
    where,
    orderBy: { startTime: 'asc' },
  })

  return {
    blocks: blocks.map(toAvailabilityBlockDto),
  }
}

