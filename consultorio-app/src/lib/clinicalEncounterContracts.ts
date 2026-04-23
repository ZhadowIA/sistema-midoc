import { z } from 'zod'

export const clinicalEncounterSourceSchema = z.enum([
  'APPOINTMENT',
  'STANDALONE',
  'MIGRATION',
])

export const createClinicalEncounterSchema = z
  .object({
    patientId: z.string().min(1, 'patientId es requerido'),
    appointmentId: z.string().min(1).optional(),
    source: clinicalEncounterSourceSchema.optional(),
  })
  .transform((value) => ({
    patientId: value.patientId.trim(),
    appointmentId: value.appointmentId?.trim() || undefined,
    source: value.source ?? (value.appointmentId ? 'APPOINTMENT' : 'STANDALONE'),
  }))

export type CreateClinicalEncounterInput = z.infer<
  typeof createClinicalEncounterSchema
>
