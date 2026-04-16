import { NextResponse } from 'next/server'
import { QuestionnaireService } from '@/services/QuestionnaireService'
import { z } from 'zod'
import { checkRateLimit, rateLimitExceededResponse } from '@/lib/rateLimit'

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

    const rateLimit = checkRateLimit(request, {
      key: 'public:questionnaire:get',
      limit: 45,
      windowMs: 5 * 60_000,
      identifier: tokenParsed.data.slice(0, 24),
    })
    if (!rateLimit.ok) return rateLimitExceededResponse(rateLimit)

    const token = tokenParsed.data
    const appointment = await QuestionnaireService.validateTokenContext(token)
    
    if (!appointment) return NextResponse.json({ error: 'Cita no encontrada' }, { status: 404 })

    return NextResponse.json({
      status: appointment.questionnaireAnswered ? 'ANSWERED' : 'PENDING',
      appointment: { 
        id: appointment.id,
        date: appointment.date,
        type: appointment.appointmentType
      }
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

    const rateLimit = checkRateLimit(request, {
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
    )

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
