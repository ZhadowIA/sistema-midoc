import { z } from 'zod'
import { parseDateOnlyLocal } from './dateTime.ts'

export class ContractValidationError extends Error {
  public readonly status: number
  public readonly details?: unknown

  constructor(message: string, options?: { status?: number; details?: unknown }) {
    super(message)
    this.name = 'ContractValidationError'
    this.status = options?.status ?? 400
    this.details = options?.details
  }
}

const availabilityDayQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  type: z.enum(['normal', 'extended']),
  doctorId: z.string().cuid(),
})

const availabilityMonthQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inicial inválida'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha final inválida'),
  type: z.enum(['normal', 'extended']),
  doctorId: z.string().cuid(),
})

const publicAppointmentSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'El nombre es requerido')
    .max(120, 'El nombre es demasiado largo')
    .transform((value) => value.replace(/\s+/g, ' ')),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha de nacimiento inválida'),
  phone: z
    .string()
    .min(7, 'El teléfono es requerido')
    .max(30, 'El teléfono es inválido')
    .transform((value) => value.replace(/\D+/g, ''))
    .refine((value) => /^\d{10,15}$/.test(value), 'El teléfono debe tener entre 10 y 15 dígitos'),
  email: z.union([z.string().trim().email('Correo inválido'), z.literal('')]).optional().default(''),
  bookAsGuest: z.boolean().optional().default(false),
  appointmentType: z.enum(['NORMAL', 'EXTENDED']),
  startTime: z.string().datetime({ offset: true }),
  doctorId: z.string().cuid(),
  holdToken: z.string().uuid().optional(),
})

export type AvailabilityDayQuery = z.infer<typeof availabilityDayQuerySchema>
export type AvailabilityMonthQuery = z.infer<typeof availabilityMonthQuerySchema>
export type PublicAppointmentPayload = z.infer<typeof publicAppointmentSchema>

export function parseAvailabilityDayQuery(input: unknown): AvailabilityDayQuery {
  const parsedQuery = availabilityDayQuerySchema.safeParse(input)
  if (!parsedQuery.success) {
    throw new ContractValidationError('Parámetros inválidos', { details: parsedQuery.error.issues })
  }

  const query = parsedQuery.data

  try {
    parseDateOnlyLocal(query.date)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Fecha inválida'
    throw new ContractValidationError(message)
  }

  return query
}

export function parseAvailabilityMonthQuery(
  input: unknown,
  maxRangeDays = 62
): AvailabilityMonthQuery {
  const parsedQuery = availabilityMonthQuerySchema.safeParse(input)
  if (!parsedQuery.success) {
    throw new ContractValidationError('Parámetros inválidos', { details: parsedQuery.error.issues })
  }

  const query = parsedQuery.data

  let start: Date
  let end: Date
  try {
    start = parseDateOnlyLocal(query.startDate)
    end = parseDateOnlyLocal(query.endDate)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Rango de fechas inválido'
    throw new ContractValidationError(message)
  }

  const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays <= 0 || diffDays > maxRangeDays) {
    throw new ContractValidationError(
      `Rango inválido. Usa un rango mayor a 0 y menor o igual a ${maxRangeDays} días.`
    )
  }

  return query
}

export function parsePublicAppointmentPayload(input: unknown): PublicAppointmentPayload {
  const parsedPayload = publicAppointmentSchema.safeParse(input)
  if (!parsedPayload.success) {
    throw new ContractValidationError('Datos inválidos', { details: parsedPayload.error.issues })
  }

  const payload = parsedPayload.data
  let parsedDateOfBirth: Date
  try {
    parsedDateOfBirth = parseDateOnlyLocal(payload.dateOfBirth)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Fecha de nacimiento inválida'
    throw new ContractValidationError(message)
  }
  const today = new Date()
  const oldestAllowed = new Date(today)
  oldestAllowed.setFullYear(oldestAllowed.getFullYear() - 120)

  if (parsedDateOfBirth > today) {
    throw new ContractValidationError('La fecha de nacimiento no puede ser futura.')
  }
  if (parsedDateOfBirth < oldestAllowed) {
    throw new ContractValidationError('La fecha de nacimiento es inválida para registro.')
  }

  return payload
}
