import { z } from 'zod'
import { parseDateOnlyLocal } from './dateTime.ts'
import { buildFullName } from './patientName.ts'
import { PATIENT_GENDER_VALUES, PATIENT_RELATION_VALUES, PATIENT_SEX_VALUES } from './bookingOptions.ts'

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

const phoneSchema = z
  .string()
  .min(7, 'El teléfono es requerido')
  .max(30, 'El teléfono es inválido')
  .transform((value) => value.replace(/\D+/g, ''))
  .refine((value) => /^\d{10,15}$/.test(value), 'El teléfono debe tener entre 10 y 15 dígitos')

const optionalPhoneSchema = z
  .string()
  .optional()
  .default('')
  .transform((value) => (typeof value === 'string' ? value.replace(/\D+/g, '') : ''))
  .refine((value) => value === '' || /^\d{10,15}$/.test(value), 'El teléfono debe tener entre 10 y 15 dígitos')

const emailSchema = z
  .union([z.string().trim().email('Correo inválido'), z.literal('')])
  .optional()
  .default('')

const contactSchema = z.object({
  relation: z.enum(PATIENT_RELATION_VALUES),
  firstName: z.string().trim().min(1, 'Nombre del contacto requerido').max(60),
  lastNamePaternal: z.string().trim().min(1, 'Apellido paterno del contacto requerido').max(60),
  lastNameMaternal: z
    .string()
    .trim()
    .max(60)
    .optional()
    .nullable()
    .transform((value) => (value && value.length > 0 ? value : null)),
  phone: phoneSchema,
  email: emailSchema,
})

const publicAppointmentSchema = z.object({
  // Campos estructurados (obligatorios)
  firstName: z.string().trim().min(1).max(60),
  lastNamePaternal: z.string().trim().min(1).max(60),
  lastNameMaternal: z
    .string()
    .trim()
    .max(60)
    .optional()
    .nullable()
    .transform((value) => (value && value.length > 0 ? value : null)),
  sex: z.enum(PATIENT_SEX_VALUES).optional().nullable(),
  gender: z.enum(PATIENT_GENDER_VALUES).optional().nullable(),

  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha de nacimiento inválida'),
  phone: optionalPhoneSchema,
  email: emailSchema,
  bookAsGuest: z.boolean().optional().default(false),
  appointmentType: z.enum(['NORMAL', 'EXTENDED']),
  startTime: z.string().datetime({ offset: true }),
  doctorId: z.string().cuid(),
  holdToken: z.string().uuid().optional(),

  contact: contactSchema.optional().nullable(),
  recaptchaToken: z
    .union([z.string().min(1), z.literal('')])
    .optional()
    .nullable()
    .transform((value) => (typeof value === 'string' && value.trim().length === 0 ? null : value)),

  privacyConsentAccepted: z
    .boolean()
    .refine(
      (value) => value === true,
      'Debes aceptar el aviso de privacidad y el uso operativo de tus datos para agendar.'
    ),
})

type RawPublicAppointmentPayload = z.infer<typeof publicAppointmentSchema>

export type PublicAppointmentPayload = Omit<
  RawPublicAppointmentPayload,
  'firstName' | 'lastNamePaternal' | 'lastNameMaternal'
> & {
  firstName: string
  lastNamePaternal: string
  lastNameMaternal: string | null
  fullName: string
}

export type AvailabilityDayQuery = z.infer<typeof availabilityDayQuerySchema>
export type AvailabilityMonthQuery = z.infer<typeof availabilityMonthQuerySchema>

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
  const firstName = payload.firstName
  const lastNamePaternal = payload.lastNamePaternal
  const lastNameMaternal = payload.lastNameMaternal ?? null
  const fullName = buildFullName({ firstName, lastNamePaternal, lastNameMaternal })

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

  return {
    ...payload,
    firstName,
    lastNamePaternal,
    lastNameMaternal,
    fullName,
  }
}
