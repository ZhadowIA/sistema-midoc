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

const encounterPartialSchema = z
  .object({
    chiefComplaint: z.string().trim().max(2_000).optional(),
    presentIllness: z
      .object({
        onset: z.string().trim().max(500).optional(),
        duration: z.string().trim().max(500).optional(),
        course: z.string().trim().max(500).optional(),
        location: z.string().trim().max(500).optional(),
        radiation: z.string().trim().max(500).optional(),
        characteristics: z.string().trim().max(1_000).optional(),
        intensity: z.string().trim().max(500).optional(),
        aggravatingFactors: z.string().trim().max(1_000).optional(),
        relievingFactors: z.string().trim().max(1_000).optional(),
        associatedSymptoms: z.array(z.string().trim().min(1).max(300)).max(40).optional(),
        previousTreatments: z.array(z.string().trim().min(1).max(300)).max(40).optional(),
        summary: z.string().trim().max(4_000).optional(),
      })
      .partial()
      .optional(),
    pertinentNegatives: z.array(z.string().trim().min(1).max(300)).max(40).optional(),
    reviewOfSystems: z.record(z.string(), z.string().trim().max(1_500)).optional(),
    vitals: z
      .record(
        z.string(),
        z.union([z.string().trim().max(120), z.number()]).transform((v) =>
          typeof v === 'number' ? String(v) : v
        )
      )
      .optional(),
    physicalExam: z.record(z.string(), z.string().trim().max(2_000)).optional(),
    assessment: z
      .array(
        z.object({
          diagnosis: z.string().trim().min(1).max(500),
          probabilityPct: z.number().int().min(0).max(100).optional(),
          basis: z.string().trim().max(2_000).optional(),
          studiesToConfirm: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
        })
      )
      .max(10)
      .optional(),
    diagnosticPlan: z.record(z.string(), z.string().trim().max(2_000)).optional(),
    treatmentPlan: z.record(z.string(), z.string().trim().max(2_000)).optional(),
    followUp: z.record(z.string(), z.string().trim().max(2_000)).optional(),
  })
  .partial()

export type AIEncounterPartial = z.infer<typeof encounterPartialSchema>
export type AIDictationResult = { soap: AIStructuredSOAP; encounter: AIEncounterPartial }
export type PrescriptionAlert = z.infer<typeof prescriptionAlertSchema>
export type LLMUsageSnapshot = {
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
}
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

const MEDICATION_DEDUPE_STOPWORDS = new Set([
  'mg',
  'ml',
  'mcg',
  'g',
  'gr',
  'ui',
  'tableta',
  'tabletas',
  'tab',
  'tabs',
  'capsula',
  'capsulas',
  'cap',
  'caps',
  'comprimido',
  'comprimidos',
  'ampolleta',
  'ampolletas',
  'jarabe',
  'suspension',
  'solucion',
  'inyectable',
  'inyeccion',
  'vo',
  'iv',
  'im',
  'cada',
  'c',
  'hr',
  'hrs',
  'hora',
  'horas',
  'dia',
  'dias',
  'x',
  'por',
])

function normalizeAlertText(value: string) {
  return normalizeText(value)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function buildMedicationDedupKey(value: string) {
  const normalized = normalizeText(value).replace(/[^\p{L}\p{N}\s]/gu, ' ')
  const tokens = normalized
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => {
      if (MEDICATION_DEDUPE_STOPWORDS.has(token)) return false
      if (/^\d+([.,]\d+)?$/.test(token)) return false
      if (/^\d+([.,]\d+)?(mg|ml|mcg|g|gr|ui|%)$/.test(token)) return false
      return true
    })

  const key = tokens.join(' ').trim()
  return key || normalizeText(value)
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

export function dedupeAlerts(alerts: PrescriptionAlert[]): PrescriptionAlert[] {
  const seen = new Set<string>()
  const deduped: PrescriptionAlert[] = []

  for (const alert of alerts) {
    const key = `${alert.severity}|${normalizeAlertText(alert.message)}|${normalizeAlertText(alert.recommendation)}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(alert)
  }

  return deduped
}

export function deterministicPrescriptionAlerts(params: {
  prescriptions: Array<z.infer<typeof prescriptionInputSchema>>
  medicalRecord: unknown
  questionnaire: unknown
}): PrescriptionAlert[] {
  const alerts: PrescriptionAlert[] = []

  const medications = params.prescriptions.map((item) => ({
    raw: item.medication,
    normalized: normalizeText(item.medication),
    dedupeKey: buildMedicationDedupKey(item.medication),
  }))

  const grouped = new Map<string, { count: number; raw: string }>()
  for (const medication of medications) {
    const existing = grouped.get(medication.dedupeKey)
    if (existing) {
      existing.count += 1
    } else {
      grouped.set(medication.dedupeKey, { count: 1, raw: medication.raw })
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

  const hasAceOrArb = medications.some((medication) =>
    ['enalapril', 'losartan', 'valsartan', 'captopril', 'lisinopril'].some((keyword) =>
      medication.normalized.includes(keyword)
    )
  )
  const hasDiuretic = medications.some((medication) =>
    ['furosemida', 'hidroclorotiazida', 'espironolactona', 'torasemida'].some((keyword) =>
      medication.normalized.includes(keyword)
    )
  )

  if (hasAceOrArb && hasDiuretic && hasNsaid) {
    alerts.push({
      severity: 'high',
      message: 'Posible triple combinación de riesgo renal (AINE + IECA/ARA-II + diurético).',
      recommendation:
        'Confirma indicación, vigila función renal/electrolitos y considera alternativa analgésica.',
    })
  }

  const hasSerotonergicAgent = medications.some((medication) =>
    ['sertralina', 'fluoxetina', 'paroxetina', 'citalopram', 'escitalopram', 'venlafaxina', 'duloxetina'].some(
      (keyword) => medication.normalized.includes(keyword)
    )
  )
  const hasTramadol = medications.some((medication) => medication.normalized.includes('tramadol'))
  if (hasSerotonergicAgent && hasTramadol) {
    alerts.push({
      severity: 'high',
      message: 'Combinación con potencial riesgo serotoninérgico detectada (tramadol + antidepresivo serotoninérgico).',
      recommendation:
        'Revalora combinación, educa signos de alarma neurológica/autonómica y ajusta tratamiento si aplica.',
    })
  }

  return dedupeAlerts(alerts)
}

function toUsageSnapshot(response: { model?: string | null; usage?: { prompt_tokens?: number | null; completion_tokens?: number | null; total_tokens?: number | null } | null }): LLMUsageSnapshot {
  const promptTokens = Number(response.usage?.prompt_tokens ?? 0)
  const completionTokens = Number(response.usage?.completion_tokens ?? 0)
  const totalTokens = Number(response.usage?.total_tokens ?? promptTokens + completionTokens)
  return {
    model: response.model ?? 'unknown',
    promptTokens: Number.isFinite(promptTokens) ? promptTokens : 0,
    completionTokens: Number.isFinite(completionTokens) ? completionTokens : 0,
    totalTokens: Number.isFinite(totalTokens) ? totalTokens : 0,
  }
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

export async function generateDictationFromTranscript(
  transcript: string,
  identifiers?: IdentifierContext,
  clinicalContext?: {
    clinicalHistory?: unknown
    encounterHistory?: unknown
    questionnaire?: unknown
    specialty?: string | null
  }
): Promise<AIDictationResult> {
  const result = await generateDictationFromTranscriptWithTelemetry(transcript, identifiers, clinicalContext)
  return { soap: result.soap, encounter: result.encounter }
}

export async function generateDictationFromTranscriptWithTelemetry(
  transcript: string,
  identifiers?: IdentifierContext,
  clinicalContext?: {
    clinicalHistory?: unknown
    encounterHistory?: unknown
    questionnaire?: unknown
    specialty?: string | null
  }
): Promise<AIDictationResult & { usage: LLMUsageSnapshot }> {
  const openai = getOpenAIClient()
  const normalizedTranscript = truncateText(
    pseudonymizeClinicalText(transcript.trim(), identifiers),
    TRANSCRIPT_MAX_CHARS
  )
  if (!normalizedTranscript) {
    throw new Error('La transcripción está vacía.')
  }

  const specialty = clinicalContext?.specialty ?? null
  const { specialty: _specialty, ...contextWithoutSpecialty } = clinicalContext ?? {}
  const safeContext = Object.keys(contextWithoutSpecialty).length > 0
    ? pseudonymizeStructuredData(contextWithoutSpecialty, identifiers)
    : null
  const contextBlock = safeContext
    ? `\n\nContexto clínico estructurado (referencia, no inventes datos fuera de esto ni del audio):\n${serializeContextForPrompt(
        safeContext,
        INSIGHTS_CONTEXT_MAX_CHARS
      )}`
    : ''
  const specialtyHintSoap = specialty
    ? `El médico es especialista en ${specialty}; adapta la terminología, las secciones de revisión por sistemas y el plan a esa especialidad. `
    : ''

  const response = await runOpenAIRequest('generación de dictado clínico', () =>
    openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'Eres un asistente clínico que estructura la consulta médica a partir del audio transcrito. ' +
            specialtyHintSoap +
            'La transcripción puede incluir diarización con etiquetas [Doctor]: y [Paciente]: al inicio de cada intervención. ' +
            'Usa esas etiquetas para atribuir correctamente: lo que dice el paciente va a subjective; lo que el doctor observa/examina va a objective; ' +
            'órdenes, planes y recomendaciones del doctor van a plan. Ignora las etiquetas en el texto final; no las copies. ' +
            'Devuelves SOLO JSON con dos llaves de nivel superior: "soap" y "encounter". ' +
            'soap: {subjective, objective, assessment, plan} con strings; si falta info usa "No se menciona en la consulta". ' +
            'encounter: objeto parcial con las llaves opcionales: chiefComplaint (string corto), ' +
            'presentIllness {onset, duration, course, location, radiation, characteristics, intensity, aggravatingFactors, relievingFactors, associatedSymptoms[], previousTreatments[], summary}, ' +
            'pertinentNegatives[] (síntomas que el paciente negó explícitamente), ' +
            'reviewOfSystems (objeto con llaves por aparato: cardiovascular, respiratorio, digestivo, neurologico, genitourinario, musculoesqueletico, piel, endocrino, psiquiatrico), ' +
            'vitals (objeto con llaves: ta, fc, fr, temp, spo2, peso, talla, imc) solo con valores string, ' +
            'physicalExam (objeto con llaves por sistema), ' +
            'assessment[] (array de {diagnosis, probabilityPct?, basis?, studiesToConfirm?[]}), ' +
            'diagnosticPlan, treatmentPlan, followUp (objetos con strings). ' +
            'REGLAS ESTRICTAS: ' +
            '1) Omite llaves de encounter de las que no haya información en el audio (no inventes). ' +
            '2) No incluyas PII; usa lo dicho en la consulta tal cual. ' +
            '3) associatedSymptoms y pertinentNegatives deben ser listas cortas de términos clínicos. ' +
            '4) No agregues texto fuera del JSON.',
        },
        {
          role: 'user',
          content: `Transcripción clínica:\n${normalizedTranscript}${contextBlock}`,
        },
      ],
      response_format: { type: 'json_object' },
    })
  )

  const raw = extractResponseJsonText(
    response.choices?.[0]?.message?.content,
    'dictado clínico'
  ) as { soap?: unknown; encounter?: unknown }

  const soap = normalizeSoapOutput(raw?.soap)
  const encounterParsed = encounterPartialSchema.safeParse(raw?.encounter ?? {})
  const encounter = encounterParsed.success ? encounterParsed.data : {}

  return { soap, encounter, usage: toUsageSnapshot(response) }
}

export async function generateComprehensiveInsights(context: {
  soap?: Partial<AIStructuredSOAP>
  questionnaire?: unknown
  medicalRecord?: unknown
  specialty?: string | null
}, identifiers?: IdentifierContext): Promise<AIInsights> {
  const result = await generateComprehensiveInsightsWithTelemetry(context, identifiers)
  return result.insights
}

export async function generateComprehensiveInsightsWithTelemetry(context: {
  soap?: Partial<AIStructuredSOAP>
  questionnaire?: unknown
  medicalRecord?: unknown
  specialty?: string | null
}, identifiers?: IdentifierContext): Promise<{ insights: AIInsights; usage: LLMUsageSnapshot }> {
  const openai = getOpenAIClient()
  const { specialty: insightsSpecialty, ...contextForSchema } = context
  const safeContext = aiContextSchema.parse(pseudonymizeStructuredData(contextForSchema, identifiers))
  const specialtyHintInsights = insightsSpecialty
    ? `El médico es especialista en ${insightsSpecialty}. Ajusta las sugerencias diagnósticas y terapéuticas a esa especialidad. `
    : ''

  const response = await runOpenAIRequest('generación de insights clínicos', () =>
    openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content:
            'Eres un consultor clínico de apoyo. ' +
            specialtyHintInsights +
            'Debes devolver SOLO JSON con llaves: diagnoses, treatments, allowedFoods, forbiddenFoods. ' +
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
  return {
    insights: sanitizeInsights(insightsSchema.parse(raw)),
    usage: toUsageSnapshot(response),
  }
}

export async function validatePrescription(params: {
  prescriptions: unknown[]
  medicalRecord: unknown
  questionnaire: unknown
}, identifiers?: IdentifierContext): Promise<PrescriptionAlert[]> {
  const result = await validatePrescriptionWithTelemetry(params, identifiers)
  return result.alerts
}

export async function validatePrescriptionWithTelemetry(params: {
  prescriptions: unknown[]
  medicalRecord: unknown
  questionnaire: unknown
}, identifiers?: IdentifierContext): Promise<{ alerts: PrescriptionAlert[]; usage: LLMUsageSnapshot }> {
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

  return {
    alerts: dedupeAlerts([...deterministicAlerts, ...llmAlerts]),
    usage: toUsageSnapshot(llmResponse),
  }
}

export async function generateQuestionnaireFollowUp(params: {
  transcript: string
  history: Array<{ role: 'user' | 'assistant'; content: string }>
}): Promise<{
  question?: string
  isFinished: boolean
  summary?: string
  possibleConditions?: string[]
  physicalExamChecklist?: string[]
}> {
  const openai = getOpenAIClient()
  const historyContext = params.history
    .map((h) => `${h.role === 'user' ? 'Paciente' : 'IA'}: ${h.content}`)
    .join('\n')

  const response = await runOpenAIRequest('seguimiento de cuestionario', () =>
    openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content:
            'Eres un asistente médico recolectando síntomas de un paciente antes de su consulta. ' +
            'Tu objetivo es obtener la información clínica MÍNIMA necesaria para que el doctor llegue preparado. ' +
            'REGLAS OBLIGATORIAS:\n' +
            '1. Haz UNA sola pregunta clara y empática a la vez.\n' +
            '2. EVALÚA si el motivo ya es autoexplicativo y no requiere más información:\n' +
            '   - Motivos rutinarios/procedimentales (revisión de brackets, limpieza dental, chequeo de rutina, cita de seguimiento, retiro de puntos, renovación de receta, vacuna) → termina INMEDIATAMENTE después de la primera respuesta del paciente confirmando el motivo.\n' +
            '   - Motivos con síntomas activos (dolor, fiebre, mareo, dificultad para respirar) → profundiza con hasta 3 preguntas adicionales sobre duración, intensidad y síntomas asociados.\n' +
            '   - Motivos crónicos ya conocidos (control de diabetes, seguimiento de hipertensión) → 1 pregunta sobre el estado actual es suficiente.\n' +
            '3. NUNCA hagas más de 4 preguntas en total (incluyendo la primera). Si ya tienes suficiente contexto, termina aunque no hayas llegado a 4.\n' +
            '4. Evita repetir preguntas ya respondidas en el historial.\n' +
            '5. Al terminar, devuelve un resumen estructurado útil para el médico. Para motivos simples el resumen puede ser breve.\n' +
            '6. Formato de respuesta JSON con llaves: ' +
            'question (string, vacío si isFinished es true), isFinished (boolean), summary (string opcional), ' +
            'possibleConditions (string[] opcional, máximo 5, OMITIR para motivos rutinarios), ' +
            'physicalExamChecklist (string[] opcional, máximo 8, OMITIR para motivos rutinarios). ' +
            'possibleConditions son orientativas, no diagnósticos definitivos.',
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
    possibleConditions?: unknown
    physicalExamChecklist?: unknown
  }

  const possibleConditions = Array.isArray(raw.possibleConditions)
    ? raw.possibleConditions
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .slice(0, 5)
    : undefined

  const physicalExamChecklist = Array.isArray(raw.physicalExamChecklist)
    ? raw.physicalExamChecklist
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .slice(0, 8)
    : undefined

  return {
    question: raw.question,
    isFinished: Boolean(raw.isFinished),
    summary: raw.summary,
    possibleConditions,
    physicalExamChecklist,
  }
}

const patientInstructionsSchema = z.object({
  generalInstructions: z.string().trim().min(1).max(3_000),
  medicationReminders: z.array(z.string().trim().min(1).max(400)).max(20).default([]),
  activityRestrictions: z.array(z.string().trim().min(1).max(400)).max(10).default([]),
  dietaryGuidance: z.array(z.string().trim().min(1).max(400)).max(10).default([]),
  warningSignsToReturn: z.array(z.string().trim().min(1).max(400)).max(10).default([]),
  followUpSuggestion: z.string().trim().max(400).optional(),
})

export type PatientInstructions = z.infer<typeof patientInstructionsSchema>

export async function generatePatientInstructions(params: {
  chiefComplaint: string
  assessment: string
  plan: string
  specialty?: string | null
}): Promise<{ instructions: PatientInstructions; usage: LLMUsageSnapshot }> {
  const openai = getOpenAIClient()

  const specialtyHint = params.specialty
    ? `El médico es especialista en: ${params.specialty}.`
    : ''

  const response = await runOpenAIRequest('indicaciones para paciente', () =>
    openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      messages: [
        {
          role: 'system',
          content:
            'Eres un asistente médico que traduce notas clínicas a indicaciones claras para el paciente. ' +
            'Usa lenguaje simple, directo y empático — evita tecnicismos. ' +
            specialtyHint +
            '\nDevuelve SOLO JSON con las llaves:\n' +
            '- generalInstructions: párrafo principal de resumen (qué tiene y qué hacer)\n' +
            '- medicationReminders: lista de recordatorios de medicamentos (cuándo, cuánto, cómo)\n' +
            '- activityRestrictions: lista de restricciones de actividad\n' +
            '- dietaryGuidance: lista de recomendaciones dietéticas (vacío si no aplica)\n' +
            '- warningSignsToReturn: lista de señales de alarma para regresar urgente\n' +
            '- followUpSuggestion: cuándo y por qué regresar (string corto, opcional)',
        },
        {
          role: 'user',
          content:
            `Motivo de consulta: ${params.chiefComplaint}\n` +
            `Evaluación clínica: ${params.assessment}\n` +
            `Plan de tratamiento: ${params.plan}`,
        },
      ],
      response_format: { type: 'json_object' },
    })
  )

  const raw = extractResponseJsonText(
    response.choices?.[0]?.message?.content,
    'patientInstructions',
  )

  const parsed = patientInstructionsSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(
      `Respuesta IA de indicaciones para paciente inválida: ${parsed.error.message}`,
    )
  }

  return { instructions: parsed.data, usage: toUsageSnapshot(response) }
}
