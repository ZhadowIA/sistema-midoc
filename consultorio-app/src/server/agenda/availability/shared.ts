import { parseDateOnlyLocal, toLocalDateKey } from '@/lib/dateTime'
import { AvailabilityInputError } from '@/server/agenda/availability/errors'

export type AvailabilityBlockDto = {
  id: string
  dateLocal: string
  startTime: Date
  endTime: Date
  isPublic: boolean
  active: boolean
}

export function toAvailabilityBlockDto(block: {
  id: string
  startTime: Date
  endTime: Date
  isPublic: boolean
  active: boolean
}): AvailabilityBlockDto {
  return {
    id: block.id,
    dateLocal: toLocalDateKey(block.startTime),
    startTime: block.startTime,
    endTime: block.endTime,
    isPublic: block.isPublic,
    active: block.active,
  }
}

export function parseDateTimeInput(value: string, field: string): Date {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new AvailabilityInputError(`${field} inválido`)
  }
  return parsed
}

export function validateAvailabilityWindow(
  startTime: Date,
  endTime: Date,
  baseDuration: number,
  explicitDate?: string,
): Date {
  if (endTime <= startTime) {
    throw new AvailabilityInputError('endTime debe ser mayor que startTime')
  }

  if (toLocalDateKey(startTime) !== toLocalDateKey(endTime)) {
    throw new AvailabilityInputError('El bloque de disponibilidad debe iniciar y terminar el mismo día local.')
  }

  const windowMs = endTime.getTime() - startTime.getTime()
  if (windowMs % 60_000 !== 0) {
    throw new AvailabilityInputError('El bloque debe tener precisión en minutos.')
  }

  const durationMinutes = windowMs / 60_000
  if (durationMinutes % baseDuration !== 0) {
    throw new AvailabilityInputError(`El bloque debe ser múltiplo exacto de ${baseDuration} minutos.`)
  }

  if (explicitDate) {
    const parsedDate = parseDateOnlyLocal(explicitDate)
    if (toLocalDateKey(parsedDate) !== toLocalDateKey(startTime)) {
      throw new AvailabilityInputError('La fecha no coincide con el startTime enviado.')
    }
  }

  const localDate = new Date(startTime)
  localDate.setHours(0, 0, 0, 0)
  return localDate
}

