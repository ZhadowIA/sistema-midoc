import { z } from 'zod'

const ClinicalDocStatus = z.enum(['DRAFT', 'IN_REVIEW', 'FINAL', 'SIGNED'])
const JsonObject = z.record(z.string(), z.unknown())

const PresentIllnessSchema = z
  .object({
    onset: z.string().optional(),
    duration: z.string().optional(),
    course: z.string().optional(),
    location: z.string().optional(),
    radiation: z.string().optional(),
    characteristics: z.string().optional(),
    intensity: z.string().optional(),
    aggravatingFactors: z.string().optional(),
    relievingFactors: z.string().optional(),
    associatedSymptoms: z.array(z.string()).optional(),
    previousTreatments: z.array(z.string()).optional(),
    summary: z.string().optional(),
  })
  .passthrough()

const AssessmentItemSchema = z.object({
  diagnosis: z.string().min(1),
  probabilityPct: z.number().int().min(0).max(100).optional(),
  basis: z.string().optional(),
  studiesToConfirm: z.array(z.string()).optional(),
})

export const EncounterHistoryPayloadSchema = z.object({
  chiefComplaint: z.string(),
  presentIllness: PresentIllnessSchema,
  pertinentNegatives: z.array(z.string()),
  reviewOfSystems: JsonObject,
  vitals: JsonObject,
  physicalExam: JsonObject,
  assessment: z.array(AssessmentItemSchema),
  diagnosticPlan: JsonObject,
  treatmentPlan: JsonObject,
  followUp: JsonObject,
  completionPct: z.number().int().min(0).max(100),
  status: ClinicalDocStatus,
})

export type EncounterHistoryPayload = z.infer<typeof EncounterHistoryPayloadSchema>
