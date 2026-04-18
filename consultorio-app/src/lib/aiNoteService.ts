import OpenAI from 'openai'
import { z } from 'zod'
import { pseudonymizeClinicalText, pseudonymizeStructuredData } from './pseudonymization'

const SOAP_TEXT_FALLBACK = 'No se menciona en la consulta'
const TRANSCRIPT_MAX_CHARS = 20_000
const INSIGHTS_CONTEXT_MAX_CHARS = 30_000
const OPENAI_TIMEOUT_MS = 25_000
const OPENAI_MAX_RETRIES = 2
const OPENAI_RETRY_BASE_DELAY_MS = 700

const soapSchema = z.object({
  subjective: z.string().trim().min(1).max(12_000),
  objective: z.string().trim().min(1).max(12_000),
  assessment: z.string().trim().min(1).max(12_000),
  plan: z.string().trim().min(1).max(12_000),
})

const insightDiagnosisSchema = z.object({
  diagnosis: z.string().trim().min(1).max(500),
  reasoning: z.string().trim().min(1).max(2_000),
})

const insightTreatmentSchema = z.object({
  treatment: z.string().trim().min(1).max(500),
  instructions: z.string().trim().min(1).max(2_000),
})

const insightsSchema = z.object({
  diagnoses: z.array(insightDiagnosisSchema).max(20).default([]),
  treatments: z.array(insightTreatmentSchema).max(20).default([]),
  allowedFoods: z.array(z.string().trim().min(1).max(200)).max(80).default([]),
  forbiddenFoods: z.array(z.string().trim().min(1).max(200)).max(80).default([]),
})

const prescriptionAlertSchema = z.object({
  severity: z.enum(['high', 'medium']),
  message: z.string().trim().min(1).max(800),
  recommendation: z.string().trim().min(1).max(1_500),
})

const prescriptionAlertsResponseSchema = z.object({
  alerts: z.array(prescriptionAlertSchema).max(50).default([]),
})

const prescriptionInputSchema = z.object({
  medication: z.string().trim().min(1).max(200),
  dosage: z.string().trim().max(200).optional().default(''),
  frequency: z.string().trim().max(200).optional().default(''),
  duration: z.string().trim().max(200).optional().default(''),
  instructions: z.string().trim().max(1_000).optional().default(''),
})

const aiContextSchema = z.object({
  soap: z.unknown().optional(),
  questionnaire: z.unknown().optional(),
  medicalRecord: z.unknown().optional(),
})

export type AIStructuredSOAP = z.infer<typeof soapSchema>
export type AIInsights = z.infer<typeof insightsSchema>
export type PrescriptionAlert = z.infer<typeof prescriptionAlertSchema>
export type IdentifierContext = {
  patientName?: string | null
  doctorName?: string | null
}

const AUDIO_EXT_BY_MIME: Record<string, string> = {
  'audio/webm': 'webm',
  'video/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
}

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || apiKey.trim().length < 20) {
    throw new Error('Configuración de IA incompleta: falta OPENAI_API_KEY')
  }

  return new OpenAI({ apiKey, maxRetries: 0 })
}

function resolveAudioFilename(fileName: string | undefined, mimeType: string): string {
  const cleanName = (fileName ?? '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '_')
  if (cleanName.includes('.')) return cleanName
  const ext = AUDIO_EXT_BY_MIME[mimeType] ?? 'webm'
  const base = cleanName || 'audio'
  return `${base}.${ext}`
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getRetryDelayMs(attempt: number) {
  const exponential = OPENAI_RETRY_BASE_DELAY_MS * 2 ** attempt
  const jitter = Math.floor(Math.random() * 250)
  return exponential + jitter
}

function isRetriableOpenAIError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const withMeta = error as { status?: unknown; code?: unknown; message?: unknown }
  const status = typeof withMeta.status === 'number' ? withMeta.status : null
  if (status !== null && [408, 409, 425, 429, 500, 502, 503, 504].includes(status)) return true

  const code = typeof withMeta.code === 'string' ? withMeta.code.toLowerCase() : ''
  if (
    ['etimedout', 'timeout', 'api_connection_error', 'rate_limit_exceeded', 'econnreset', 'eai_again'].includes(code)
  ) {
    return true
  }

  const message = typeof withMeta.message === 'string' ? withMeta.message.toLowerCase() : ''
  return message.includes('timed out') || message.includes('timeout') || message.includes('network')
}

function createTimeoutError(context: string) {
  const error = new Error(`Tiempo de espera agotado al llamar a IA (${context}).`)
  ;(error as Error & { code?: string }).code = 'ETIMEDOUT'
  return error
}

async function runOpenAIRequest<T>(context: string, action: () => Promise<T>): Promise<T> {
  let lastError: unknown = null

  for (let attempt = 0; attempt <= OPENAI_MAX_RETRIES; attempt += 1) {
    let timer: ReturnType<typeof setTimeout> | null = null

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(createTimeoutError(context)), OPENAI_TIMEOUT_MS)
      })
      const result = await Promise.race([action(), timeoutPromise])
      if (timer) clearTimeout(timer)
      return result
    } catch (error) {
      if (timer) clearTimeout(timer)
      lastError = error
      const shouldRetry = attempt < OPENAI_MAX_RETRIES && isRetriableOpenAIError(error)
      if (!shouldRetry) break
      await sleep(getRetryDelayMs(attempt))
    }
  }

  throw lastError ?? new Error(`No se pudo completar la llamada de IA (${context}).`)
}

function truncateText(value: string, maxChars: number) {
  if (value.length <= maxChars) return value
  return value.slice(0, maxChars)
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function safeJsonParse(raw: string, context: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error(`La IA devolvió un JSON inválido (${context}).`)
  }
}

function extractResponseJsonText(content: string | null | undefined, context: string): unknown {
  if (!content || !content.trim()) {
    throw new Error(`La IA no devolvió contenido (${context}).`)
  }
  return safeJsonParse(content, context)
}

function serializeContextForPrompt(value: unknown, maxChars: number): string {
  const serialized = JSON.stringify(value ?? {})
  return truncateText(serialized, maxChars)
}

function toFoodKey(value: string): string {
  return normalizeText(value).replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
}

function sanitizeFoodItems(items: string[]): string[] {
  const seen = new Set<string>()
  const cleaned: string[] = []

  for (const item of items) {
    const normalized = item.replace(/\s+/g, ' ').trim()
    if (!normalized) continue
    const key = toFoodKey(normalized)
    if (!key || seen.has(key)) continue
    seen.add(key)
    cleaned.push(normalized)
  }

  return cleaned
}

function sanitizeInsights(rawInsights: AIInsights): AIInsights {
  const forbiddenFoods = sanitizeFoodItems(rawInsights.forbiddenFoods)
  const forbiddenKeys = new Set(forbiddenFoods.map(toFoodKey))
  const allowedFoods = sanitizeFoodItems(rawInsights.allowedFoods).filter(
    (item) => !forbiddenKeys.has(toFoodKey(item))
  )

  return {
    diagnoses: rawInsights.diagnoses,
    treatments: rawInsights.treatments,
    allowedFoods,
    forbiddenFoods,
  }
}

function normalizeSoapOutput(raw: unknown): AIStructuredSOAP {
  const parsed = soapSchema.safeParse(raw)
  if (parsed.success) return parsed.data

  // fallback controlado si el modelo omitió campos
  const rawObj = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const fallback = {
    subjective:
      typeof rawObj.subjective === 'string' && rawObj.subjective.trim() ? rawObj.subjective.trim() : SOAP_TEXT_FALLBACK,
    objective:
      typeof rawObj.objective === 'string' && rawObj.objective.trim() ? rawObj.objective.trim() : SOAP_TEXT_FALLBACK,
    assessment:
      typeof rawObj.assessment === 'string' && rawObj.assessment.trim() ? rawObj.assessment.trim() : SOAP_TEXT_FALLBACK,
    plan: typeof rawObj.plan === 'string' && rawObj.plan.trim() ? rawObj.plan.trim() : SOAP_TEXT_FALLBACK,
  }

  return soapSchema.parse(fallback)
}

function dedupeAlerts(alerts: PrescriptionAlert[]): PrescriptionAlert[] {
  const seen = new Set<string>()
  const deduped: PrescriptionAlert[] = []

  for (const alert of alerts) {
    const key = `${alert.severity}|${normalizeText(alert.message)}|${normalizeText(alert.recommendation)}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(alert)
  }

  return deduped
}

function deterministicPrescriptionAlerts(params: {
  prescriptions: Array<z.infer<typeof prescriptionInputSchema>>
  medicalRecord: unknown
  questionnaire: unknown
}): PrescriptionAlert[] {
  const alerts: PrescriptionAlert[] = []

  const medications = params.prescriptions.map((item) => ({
    raw: item.medication,
    normalized: normalizeText(item.medication),
  }))

  const grouped = new Map<string, { count: number; raw: string }>()
  for (const medication of medications) {
    const existing = grouped.get(medication.normalized)
    if (existing) {
      existing.count += 1
    } else {
      grouped.set(medication.normalized, { count: 1, raw: medication.raw })
    }
  }

  for (const [, info] of grouped.entries()) {
    if (info.count > 1) {
      alerts.push({
        severity: 'medium',
        message: `Medicamento potencialmente duplicado: ${info.raw}.`,
        recommendation: 'Verifica si es duplicidad terapéutica o ajuste de presentación/dosis.',
      })
    }
  }

  const serializedMedicalRecord = normalizeText(JSON.stringify(params.medicalRecord ?? {}))
  const serializedQuestionnaire = normalizeText(JSON.stringify(params.questionnaire ?? {}))
  const clinicalContext = `${serializedMedicalRecord} ${serializedQuestionnaire}`

  const allergyGroupChecks: Array<{ trigger: string; meds: string[]; label: string }> = [
    { trigger: 'penicilin', meds: ['amoxicilina', 'ampicilina', 'dicloxacilina', 'penicilina'], label: 'penicilinas' },
    { trigger: 'sulfa', meds: ['trimetoprim', 'sulfametoxazol'], label: 'sulfonamidas' },
    { trigger: 'aine', meds: ['ibuprofeno', 'diclofenaco', 'naproxeno', 'ketorolaco'], label: 'AINEs' },
  ]

  for (const check of allergyGroupChecks) {
    if (!clinicalContext.includes(check.trigger)) continue
    const matched = medications.find((medication) =>
      check.meds.some((keyword) => medication.normalized.includes(keyword))
    )
    if (matched) {
      alerts.push({
        severity: 'high',
        message: `Posible contraindicación por antecedente de alergia a ${check.label}.`,
        recommendation: `Revalora el uso de "${matched.raw}" y confirma antecedentes de alergia antes de prescribir.`,
      })
    }
  }

  const hasAnticoagulant = medications.some((medication) =>
    ['warfarina', 'acenocumarol', 'apixaban', 'rivaroxaban', 'dabigatran'].some((keyword) =>
      medication.normalized.includes(keyword)
    )
  )
  const hasNsaid = medications.some((medication) =>
    ['ibuprofeno', 'diclofenaco', 'naproxeno', 'ketorolaco'].some((keyword) =>
      medication.normalized.includes(keyword)
    )
  )

  if (hasAnticoagulant && hasNsaid) {
    alerts.push({
      severity: 'high',
      message: 'Combinación de anticoagulante con AINE detectada.',
      recommendation: 'Evalúa riesgo hemorrágico y considera alternativa analgésica de menor riesgo.',
    })
  }

  const hasRenalContext =
    clinicalContext.includes('renal') || clinicalContext.includes('rino') || clinicalContext.includes('rinon')

  if (hasRenalContext && hasNsaid) {
    alerts.push({
      severity: 'high',
      message: 'Uso de AINE con posible antecedente renal.',
      recommendation: 'Valora función renal actual y considera opciones terapéuticas alternativas.',
    })
  }

  return dedupeAlerts(alerts)
}

export async function transcribeAudio(params: {
  audioBuffer: Buffer
  mimeType: string
  fileName?: string
}): Promise<string> {
  const openai = getOpenAIClient()
  const normalizedMime = params.mimeType.trim().toLowerCase()
  const resolvedFileName = resolveAudioFilename(params.fileName, normalizedMime)
  const file = new File([new Uint8Array(params.audioBuffer)], resolvedFileName, {
    type: normalizedMime || 'audio/webm',
  })

  const transcription = await runOpenAIRequest('transcripción de audio', () =>
    openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
    })
  )

  return (transcription.text || '').trim()
}

export async function generateSOAPFromTranscript(
  transcript: string,
  identifiers?: IdentifierContext,
  clinicalContext?: {
    clinicalHistory?: unknown
    encounterHistory?: unknown
    questionnaire?: unknown
  }
): Promise<AIStructuredSOAP> {
  const openai = getOpenAIClient()
  const normalizedTranscript = truncateText(
    pseudonymizeClinicalText(transcript.trim(), identifiers),
    TRANSCRIPT_MAX_CHARS
  )
  if (!normalizedTranscript) {
    throw new Error('La transcripción está vacía.')
  }

  const safeContext = clinicalContext
    ? pseudonymizeStructuredData(clinicalContext, identifiers)
    : null
  const contextBlock = safeContext
    ? `\n\nContexto clínico estructurado (no inventes datos fuera de esto ni del audio):\n${serializeContextForPrompt(
        safeContext,
        INSIGHTS_CONTEXT_MAX_CHARS
      )}`
    : ''

  const response = await runOpenAIRequest('generación de nota SOAP', () =>
    openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'Eres un asistente clínico. Resume exclusivamente en formato SOAP. ' +
            'Respuesta estricta JSON con llaves: subjective, objective, assessment, plan. ' +
            'Si falta información en un campo usa: "No se menciona en la consulta". ' +
            'Usa el contexto clínico estructurado sólo como apoyo; la fuente primaria es el audio. ' +
            'No agregues texto fuera del JSON.',
        },
        {
          role: 'user',
          content: `Transcripción clínica:\n${normalizedTranscript}${contextBlock}`,
        },
      ],
      response_format: { type: 'json_object' },
    })
  )

  const raw = extractResponseJsonText(response.choices?.[0]?.message?.content, 'SOAP')
  return normalizeSoapOutput(raw)
}

export async function generateComprehensiveInsights(context: {
  soap?: Partial<AIStructuredSOAP>
  questionnaire?: unknown
  medicalRecord?: unknown
}, identifiers?: IdentifierContext): Promise<AIInsights> {
  const openai = getOpenAIClient()
  const safeContext = aiContextSchema.parse(pseudonymizeStructuredData(context, identifiers))

  const response = await runOpenAIRequest('generación de insights clínicos', () =>
    openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'Eres un consultor clínico de apoyo. Debes devolver SOLO JSON con llaves: diagnoses, treatments, allowedFoods, forbiddenFoods. ' +
            'diagnoses: [{diagnosis, reasoning}] máximo 8. treatments: [{treatment, instructions}] máximo 10. ' +
            'No inventes certezas; expresa sugerencias para validación médica.',
        },
        {
          role: 'user',
          content: `Contexto clínico:\n${serializeContextForPrompt(safeContext, INSIGHTS_CONTEXT_MAX_CHARS)}`,
        },
      ],
      response_format: { type: 'json_object' },
    })
  )

  const raw = extractResponseJsonText(response.choices?.[0]?.message?.content, 'insights')
  return sanitizeInsights(insightsSchema.parse(raw))
}

export async function validatePrescription(params: {
  prescriptions: unknown[]
  medicalRecord: unknown
  questionnaire: unknown
}, identifiers?: IdentifierContext): Promise<PrescriptionAlert[]> {
  const openai = getOpenAIClient()
  const parsedPrescriptions = z.array(prescriptionInputSchema).max(50).parse(params.prescriptions)
  const medicalRecord = pseudonymizeStructuredData(params.medicalRecord, identifiers)
  const questionnaire = pseudonymizeStructuredData(params.questionnaire, identifiers)

  const llmResponse = await runOpenAIRequest('validación farmacológica', () =>
    openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content:
            'Eres un asistente de farmacovigilancia. Devuelve SOLO JSON con llave alerts: [{severity, message, recommendation}]. ' +
            'severity solo puede ser high o medium.',
        },
        {
          role: 'user',
          content:
            `Prescripciones: ${JSON.stringify(parsedPrescriptions)}\n` +
            `Expediente: ${JSON.stringify(medicalRecord ?? {})}\n` +
            `Cuestionario: ${JSON.stringify(questionnaire ?? {})}`,
        },
      ],
      response_format: { type: 'json_object' },
    })
  )

  const raw = extractResponseJsonText(llmResponse.choices?.[0]?.message?.content, 'validatePrescription')
  const llmAlerts = prescriptionAlertsResponseSchema.parse(raw).alerts
  const deterministicAlerts = deterministicPrescriptionAlerts({
    prescriptions: parsedPrescriptions,
    medicalRecord,
    questionnaire,
  })

  return dedupeAlerts([...deterministicAlerts, ...llmAlerts])
}

export async function generateQuestionnaireFollowUp(params: {
  transcript: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
}): Promise<{ question?: string; isFinished: boolean; summary?: string }> {
  const openai = getOpenAIClient()
  const historyContext = params.history
    .map((h) => `${h.role === 'user' ? 'Paciente' : 'IA'}: ${h.content}`)
    .join('\n')

  const response = await runOpenAIRequest('seguimiento de cuestionario', () =>
    openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content:
            'Eres un asistente médico recolectando síntomas de un paciente. ' +
            'Tu objetivo es entender el motivo de consulta para ayudar al doctor. ' +
            'REGLAS:\n' +
            '1. Haz UNA sola pregunta clara y empática a la vez.\n' +
            '2. Máximo 5 preguntas en total (considera el historial).\n' +
            '3. Si ya tienes suficiente información clínica (motivo, duración, síntomas asociados), termina.\n' +
            '4. Al terminar, devuelve un resumen estructurado útil para el médico.\n' +
            '5. Formato de respuesta: JSON con llaves: question (string), isFinished (boolean), summary (string, solo si isFinished es true).',
        },
        {
          role: 'user',
          content: `Historial previo:\n${historyContext}\n\nNueva entrada del paciente: ${params.transcript}`,
        },
      ],
      response_format: { type: 'json_object' },
    })
  )

  const raw = extractResponseJsonText(response.choices?.[0]?.message?.content, 'questionnaireFollowUp') as {
    question?: string
    isFinished: boolean
    summary?: string
  }

  return {
    question: raw.question,
    isFinished: Boolean(raw.isFinished),
    summary: raw.summary,
  }
}
