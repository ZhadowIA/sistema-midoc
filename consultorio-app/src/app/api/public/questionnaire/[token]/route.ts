import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { QuestionnaireService } from '@/services/QuestionnaireService'
import { z } from 'zod'
import { checkRateLimit, rateLimitExceededResponse } from '@/lib/rateLimit'
import { getDoctorProductAccess } from '@/lib/productAccess'
import { SUBSCRIPTION_FEATURES } from '@/lib/subscriptionFeatures'

const STANDARD_PRE_ENCOUNTER_KEYS = [
  'chiefComplaint',
  'presentIllness',
  'painMap',
  'pertinentNegatives',
  'currentMeds',
  'allergies',
  'ros',
] as const

const shortString = z.string().trim().max(1_000)

const presentIllnessSchema = z
  .object({
    onset: shortString.optional(),
    duration: shortString.optional(),
    course: shortString.optional(),
    location: shortString.optional(),
    radiation: shortString.optional(),
    characteristics: shortString.optional(),
    intensity: shortString.optional(),
    aggravatingFactors: shortString.optional(),
    relievingFactors: shortString.optional(),
    associatedSymptoms: z.array(shortString).max(50).optional(),
    previousTreatments: z.array(shortString).max(50).optional(),
    summary: shortString.optional(),
  })
  .partial()
  .passthrough()

const medicationSchema = z
  .object({
    name: shortString.optional(),
    dose: shortString.optional(),
    frequency: shortString.optional(),
    notes: shortString.optional(),
  })
  .partial()
  .passthrough()

const allergySchema = z
  .object({
    substance: shortString.optional(),
    reaction: shortString.optional(),
    severity: shortString.optional(),
  })
  .partial()
  .passthrough()

const questionnaireSchema = z.object({
  primarySymptom: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .transform((value) => value.replace(/\s+/g, ' '))
    .default('NO_ESPECIFICADO'),
  responses: z
    .record(z.string().trim().min(1).max(64), z.unknown())
    .default({})
    .superRefine((responses, context) => {
      if (Object.keys(responses).length > 120) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Demasiadas respuestas en el cuestionario.',
        })
      }

      const validators: Record<string, z.ZodTypeAny> = {
        chiefComplaint: shortString.max(300),
        presentIllness: presentIllnessSchema,
        painMap: z.record(z.string().max(64), z.unknown()),
        pertinentNegatives: z.array(shortString).max(50),
        currentMeds: z.array(medicationSchema).max(50),
        allergies: z.array(allergySchema).max(50),
        ros: z.record(z.string().max(64), z.unknown()),
      }

      for (const key of STANDARD_PRE_ENCOUNTER_KEYS) {
        if (responses[key] === undefined) continue
        const result = validators[key].safeParse(responses[key])
        if (!result.success) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['responses', key],
            message: `Formato inválido en "${key}" del cuestionario v2.`,
          })
        }
      }
    }),
})

const tokenSchema = z.string().trim().min(20).max(600)
const MAX_QUESTIONNAIRE_JSON_SIZE = 50_000
const MAX_NESTED_DEPTH = 5
const MAX_ARRAY_ITEMS = 50
const MAX_OBJECT_FIELDS = 60
const MAX_STRING_SIZE = 1_000

function sanitizeObjectKey(key: string): string {
  const normalized = key.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '')
  return normalized.slice(0, 64)
}

function sanitizeQuestionnaireValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_NESTED_DEPTH) return null

  if (typeof value === 'string') {
    return value.trim().slice(0, MAX_STRING_SIZE)
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return value
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeQuestionnaireValue(item, depth + 1))
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_OBJECT_FIELDS)
    const sanitizedEntries: Array<[string, unknown]> = []
    for (const [rawKey, rawValue] of entries) {
      const key = sanitizeObjectKey(rawKey)
      if (!key) continue
      sanitizedEntries.push([key, sanitizeQuestionnaireValue(rawValue, depth + 1)])
    }
    return Object.fromEntries(sanitizedEntries)
  }

  return null
}

export async function GET(request: Request, props: { params: Promise<{ token: string }> }) {
  const params = await props.params
  try {
    const tokenParsed = tokenSchema.safeParse(params.token)
    if (!tokenParsed.success) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 400 })
    }

    const rateLimit = await checkRateLimit(request, {
      key: 'public:questionnaire:get',
      limit: 45,
      windowMs: 5 * 60_000,
      identifier: tokenParsed.data.slice(0, 24),
    })
    if (!rateLimit.ok) return rateLimitExceededResponse(rateLimit)

    const token = tokenParsed.data
    const appointment = await QuestionnaireService.validateTokenContext(token)
    
    if (!appointment) return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })
    const access = await getDoctorProductAccess(appointment.doctorId, 'DOCTOR')
    const aiEnabled = access.features[SUBSCRIPTION_FEATURES.AI_ENABLED] === true
    const aiInterviewTextEnabled =
      aiEnabled && access.features[SUBSCRIPTION_FEATURES.AI_QUESTIONNAIRE_TEXT] === true
    const aiInterviewAudioEnabled =
      aiEnabled && access.features[SUBSCRIPTION_FEATURES.AI_QUESTIONNAIRE_AUDIO] === true

    return NextResponse.json({
      status: appointment.questionnaireAnswered ? 'ANSWERED' : 'PENDING',
      appointment: {
        id: appointment.id,
        date: appointment.date,
        type: appointment.appointmentType
      },
      capabilities: {
        aiInterviewTextEnabled,
        aiInterviewAudioEnabled,
      },
    })
  } catch {
    return NextResponse.json({ error: 'Token inválido' }, { status: 400 })
  }
}

export async function POST(request: Request, props: { params: Promise<{ token: string }> }) {
  const params = await props.params
  try {
    const tokenParsed = tokenSchema.safeParse(params.token)
    if (!tokenParsed.success) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 400 })
    }

    const rateLimit = await checkRateLimit(request, {
      key: 'public:questionnaire:post',
      limit: 6,
      windowMs: 15 * 60_000,
      identifier: tokenParsed.data.slice(0, 24),
    })
    if (!rateLimit.ok) return rateLimitExceededResponse(rateLimit)

    const token = tokenParsed.data
    const appointment = await QuestionnaireService.validateTokenContext(token)
    
    if (!appointment) return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })
    if (appointment.questionnaireAnswered) {
      return NextResponse.json({ error: 'Este cuestionario ya ha sido respondido' }, { status: 400 })
    }

    const body = await request.json()
    if (JSON.stringify(body).length > MAX_QUESTIONNAIRE_JSON_SIZE) {
      return NextResponse.json({ error: 'El cuestionario excede el tamaño máximo permitido.' }, { status: 413 })
    }

    const parsed = questionnaireSchema.parse(body)
    const sanitizedResponses = Object.fromEntries(
      Object.entries(parsed.responses).map(([key, value]) => [
        sanitizeObjectKey(key),
        sanitizeQuestionnaireValue(value),
      ])
    ) as Prisma.InputJsonValue

    const result = await QuestionnaireService.saveQuestionnaire(appointment.id, {
      primarySymptom: parsed.primarySymptom,
      responses: sanitizedResponses
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Payload de cuestionario inválido' }, { status: 400 })
    }
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
