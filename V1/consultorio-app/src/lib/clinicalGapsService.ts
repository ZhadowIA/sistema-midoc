import OpenAI from 'openai'
import { z } from 'zod'
import { pseudonymizeStructuredData } from './pseudonymization'
import type { ClinicalHistoryPayload } from './clinicalHistorySchema'
import type { EncounterHistoryPayload } from './encounterHistorySchema'
import type { LLMUsageSnapshot } from './aiNoteService'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GapSeverity = 'high' | 'medium' | 'low'
export type GapCategory = 'missing-data' | 'contradiction' | 'red-flag'

export type ClinicalGap = {
  severity: GapSeverity
  category: GapCategory
  message: string
  recommendation?: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GAPS_CONTEXT_MAX_CHARS = 30_000
const OPENAI_TIMEOUT_MS = 25_000
const OPENAI_MAX_RETRIES = 2
const OPENAI_RETRY_BASE_DELAY_MS = 700
const MAX_GAPS = 10

// ---------------------------------------------------------------------------
// Zod schemas for LLM response validation
// ---------------------------------------------------------------------------

const llmGapSchema = z.object({
  severity: z.enum(['high', 'medium', 'low']),
  category: z.enum(['contradiction', 'red-flag']),
  message: z.string().trim().min(1).max(800),
  recommendation: z.string().trim().min(1).max(1_500).optional(),
})

const llmGapsResponseSchema = z.object({
  gaps: z.array(llmGapSchema).max(20).default([]),
})

// ---------------------------------------------------------------------------
// Deterministic Gap Analysis (pure function — no side effects)
// ---------------------------------------------------------------------------

type MedicalRecordInput = {
  bloodType?: string | null
  allergies?: string | null
  chronicConditions?: string | null
  familyHistory?: string | null
} | null

export function deterministicGapAnalysis(params: {
  clinicalHistory: ClinicalHistoryPayload | null
  medicalRecord: MedicalRecordInput
  encounterPayload: EncounterHistoryPayload | null
}): ClinicalGap[] {
  const gaps: ClinicalGap[] = []
  const ch = params.clinicalHistory
  const mr = params.medicalRecord
  const ep = params.encounterPayload

  // Rule 1: Empty allergies
  if (ch) {
    const allergies = Array.isArray(ch.allergies) ? ch.allergies : []
    if (allergies.length === 0) {
      gaps.push({
        severity: 'medium',
        category: 'missing-data',
        message: 'Alergias no registradas en el expediente clínico.',
        recommendation: 'Confirma con el paciente si tiene alergias conocidas y regístralas.',
      })
    }
  }

  // Rule 2: Missing blood type
  if (!mr?.bloodType || !mr.bloodType.trim()) {
    gaps.push({
      severity: 'low',
      category: 'missing-data',
      message: 'Tipo de sangre no registrado.',
      recommendation: 'Solicita o registra el tipo de sangre del paciente.',
    })
  }

  // Rule 3: Empty pathological history
  if (ch) {
    const patHist = ch.pathologicalHistory
    if (!patHist || isEmptyObject(patHist)) {
      gaps.push({
        severity: 'medium',
        category: 'missing-data',
        message: 'Antecedentes patológicos no registrados.',
        recommendation: 'Documenta antecedentes patológicos relevantes del paciente.',
      })
    }
  }

  // Rule 4: Empty family history
  if (ch) {
    const famHist = ch.familyHistory
    if (!famHist || isEmptyObject(famHist)) {
      gaps.push({
        severity: 'low',
        category: 'missing-data',
        message: 'Antecedentes familiares no registrados.',
        recommendation: 'Documenta antecedentes familiares relevantes.',
      })
    }
  }

  // Rule 5: Empty current medications
  if (ch) {
    const meds = Array.isArray(ch.currentMedications) ? ch.currentMedications : []
    if (meds.length === 0) {
      gaps.push({
        severity: 'medium',
        category: 'missing-data',
        message: 'Medicamentos actuales no registrados.',
        recommendation: 'Confirma y registra los medicamentos que el paciente toma actualmente.',
      })
    }
  }

  // Rule 6: Missing vitals in encounter
  if (ep) {
    const vitals = ep.vitals
    if (!vitals || isEmptyObject(vitals)) {
      gaps.push({
        severity: 'medium',
        category: 'missing-data',
        message: 'Signos vitales no registrados en esta consulta.',
        recommendation: 'Toma y registra los signos vitales del paciente.',
      })
    }
  }

  // Rule 7: Empty physical exam
  if (ep) {
    const physExam = ep.physicalExam
    if (!physExam || isEmptyObject(physExam)) {
      gaps.push({
        severity: 'low',
        category: 'missing-data',
        message: 'Exploración física no registrada en esta consulta.',
        recommendation: 'Documenta los hallazgos de la exploración física.',
      })
    }
  }

  return gaps
}

// ---------------------------------------------------------------------------
// LLM Gap Analysis
// ---------------------------------------------------------------------------

export async function llmGapAnalysis(params: {
  clinicalHistory: unknown
  medicalRecord: unknown
  encounterPayload: unknown
  soapNote: { subjective?: string; objective?: string; assessment?: string; plan?: string }
  prescriptions: Array<{ medication: string; dosage?: string }>
}): Promise<{ gaps: ClinicalGap[]; usage: LLMUsageSnapshot }> {
  const openai = getOpenAIClient()

  const safeContext = pseudonymizeStructuredData({
    clinicalHistory: params.clinicalHistory,
    medicalRecord: params.medicalRecord,
    encounterPayload: params.encounterPayload,
    soapNote: params.soapNote,
    prescriptions: params.prescriptions,
  })

  const serialized = truncateText(JSON.stringify(safeContext ?? {}), GAPS_CONTEXT_MAX_CHARS)

  const response = await runOpenAIRequest('detección de huecos clínicos', () =>
    openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content:
            'Eres un auditor clínico de calidad. Analiza el contexto clínico del paciente y detecta SOLO problemas verificables. ' +
            'Devuelve SOLO JSON con llave gaps: [{severity, category, message, recommendation}]. ' +
            'severity: high | medium. category: contradiction | red-flag. ' +
            'REGLAS: ' +
            '1) contradiction: datos que se contradicen entre historial y nota/prescripción actual (ej: niega alergias pero tiene contraindicación). ' +
            '2) red-flag: síntomas de alarma mencionados pero no explorados, omisiones clínicas significativas en el contexto actual. ' +
            '3) NO reportes datos faltantes genéricos (eso lo hace otro sistema). ' +
            '4) NO inventes problemas que no se evidencien en los datos presentes. ' +
            '5) Máximo 5 hallazgos, priorizados por severidad clínica. ' +
            '6) Escribe mensajes en español clínico profesional.',
        },
        {
          role: 'user',
          content: `Contexto clínico completo del paciente:\n${serialized}`,
        },
      ],
      response_format: { type: 'json_object' },
    })
  )

  const raw = extractResponseJson(response.choices?.[0]?.message?.content, 'gaps')
  const parsed = llmGapsResponseSchema.parse(raw)

  return {
    gaps: parsed.gaps.map((g) => ({
      ...g,
      category: g.category as GapCategory,
      severity: g.severity as GapSeverity,
    })),
    usage: toUsageSnapshot(response),
  }
}

// ---------------------------------------------------------------------------
// Deduplication & Sorting
// ---------------------------------------------------------------------------

const SEVERITY_ORDER: Record<GapSeverity, number> = { high: 0, medium: 1, low: 2 }

function normalizeGapKey(gap: ClinicalGap): string {
  return `${gap.category}|${gap.message
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()}`
}

export function dedupeGaps(gaps: ClinicalGap[]): ClinicalGap[] {
  const seen = new Set<string>()
  const deduped: ClinicalGap[] = []

  for (const gap of gaps) {
    const key = normalizeGapKey(gap)
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(gap)
  }

  deduped.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])

  return deduped.slice(0, MAX_GAPS)
}

// ---------------------------------------------------------------------------
// Internal Helpers (mirrors aiNoteService patterns)
// ---------------------------------------------------------------------------

function isEmptyObject(obj: Record<string, unknown>): boolean {
  if (!obj || typeof obj !== 'object') return true
  const entries = Object.entries(obj)
  if (entries.length === 0) return true
  return entries.every(([, v]) => {
    if (v === null || v === undefined) return true
    if (typeof v === 'string' && !v.trim()) return true
    if (Array.isArray(v) && v.length === 0) return true
    return false
  })
}

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || apiKey.trim().length < 20) {
    throw new Error('Configuración de IA incompleta: falta OPENAI_API_KEY')
  }
  return new OpenAI({ apiKey, maxRetries: 0 })
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
  if (['etimedout', 'timeout', 'api_connection_error', 'rate_limit_exceeded', 'econnreset', 'eai_again'].includes(code)) return true
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

function extractResponseJson(content: string | null | undefined, context: string): unknown {
  if (!content || !content.trim()) {
    throw new Error(`La IA no devolvió contenido (${context}).`)
  }
  try {
    return JSON.parse(content)
  } catch {
    throw new Error(`La IA devolvió un JSON inválido (${context}).`)
  }
}

function toUsageSnapshot(response: {
  model?: string | null
  usage?: { prompt_tokens?: number | null; completion_tokens?: number | null; total_tokens?: number | null } | null
}): LLMUsageSnapshot {
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
