import { z } from 'zod'

const ClinicalDocStatus = z.enum(['DRAFT', 'IN_REVIEW', 'FINAL', 'SIGNED'])

const IdentificationSchema = z
  .object({
    sex: z.string().nullish(),
    gender: z.string().nullish(),
    maritalStatus: z.string().nullish(),
    occupation: z.string().nullish(),
    address: z.string().nullish(),
    bloodType: z.string().nullish(),
  })
  .passthrough()

const JsonObject = z.record(z.string(), z.unknown())
const JsonObjectArray = z.array(z.record(z.string(), z.unknown()))

export const ClinicalHistoryPayloadSchema = z.object({
  identification: IdentificationSchema,
  familyHistory: JsonObject,
  nonPathologicalHistory: JsonObject,
  pathologicalHistory: JsonObject,
  gynecoObstetricHistory: JsonObject.nullable().optional(),
  andrologicHistory: JsonObject.nullable().optional(),
  currentMedications: JsonObjectArray,
  allergies: JsonObjectArray,
  alerts: JsonObjectArray,
  completionPct: z.number().int().min(0).max(100),
  status: ClinicalDocStatus,
})

export type ClinicalHistoryPayload = z.infer<typeof ClinicalHistoryPayloadSchema>

export const ClinicalHistoryPayloadPartialSchema = ClinicalHistoryPayloadSchema.partial()
