import type { ClinicalHistoryPayload } from './clinicalHistorySchema'
import type { EncounterHistoryPayload } from './encounterHistorySchema'

export function buildEmptyClinicalHistory(): ClinicalHistoryPayload {
  return {
    identification: {},
    familyHistory: {},
    nonPathologicalHistory: {},
    pathologicalHistory: {},
    gynecoObstetricHistory: null,
    andrologicHistory: null,
    currentMedications: [],
    allergies: [],
    alerts: [],
    completionPct: 0,
    status: 'DRAFT',
  }
}

export function buildEmptyEncounterHistory(): EncounterHistoryPayload {
  return {
    chiefComplaint: '',
    presentIllness: {},
    pertinentNegatives: [],
    reviewOfSystems: {},
    vitals: {},
    physicalExam: {},
    assessment: [],
    diagnosticPlan: {},
    treatmentPlan: {},
    followUp: {},
    completionPct: 0,
    status: 'DRAFT',
  }
}

export function normalizeEncounterHistoryPayload(
  payload: Partial<EncounterHistoryPayload> | null | undefined,
): EncounterHistoryPayload {
  const base = buildEmptyEncounterHistory()
  if (!payload || typeof payload !== 'object') return base

  return {
    ...base,
    ...payload,
    chiefComplaint:
      typeof payload.chiefComplaint === 'string'
        ? payload.chiefComplaint
        : base.chiefComplaint,
    presentIllness:
      payload.presentIllness && typeof payload.presentIllness === 'object'
        ? payload.presentIllness
        : base.presentIllness,
    pertinentNegatives: Array.isArray(payload.pertinentNegatives)
      ? payload.pertinentNegatives
      : base.pertinentNegatives,
    reviewOfSystems:
      payload.reviewOfSystems && typeof payload.reviewOfSystems === 'object'
        ? payload.reviewOfSystems
        : base.reviewOfSystems,
    vitals: payload.vitals && typeof payload.vitals === 'object' ? payload.vitals : base.vitals,
    physicalExam:
      payload.physicalExam && typeof payload.physicalExam === 'object'
        ? payload.physicalExam
        : base.physicalExam,
    assessment: Array.isArray(payload.assessment) ? payload.assessment : base.assessment,
    diagnosticPlan:
      payload.diagnosticPlan && typeof payload.diagnosticPlan === 'object'
        ? payload.diagnosticPlan
        : base.diagnosticPlan,
    treatmentPlan:
      payload.treatmentPlan && typeof payload.treatmentPlan === 'object'
        ? payload.treatmentPlan
        : base.treatmentPlan,
    followUp:
      payload.followUp && typeof payload.followUp === 'object'
        ? payload.followUp
        : base.followUp,
    completionPct:
      typeof payload.completionPct === 'number' ? payload.completionPct : base.completionPct,
    status: payload.status ?? base.status,
  }
}

function countFilled(obj: Record<string, unknown> | null | undefined): number {
  if (!obj) return 0
  let count = 0
  for (const v of Object.values(obj)) {
    if (v === null || v === undefined) continue
    if (typeof v === 'string' && v.trim() === '') continue
    if (Array.isArray(v) && v.length === 0) continue
    if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0) continue
    count += 1
  }
  return count
}

export function calculateClinicalCompletionPct(p: ClinicalHistoryPayload): number {
  const sections = [
    countFilled(p.identification) > 0,
    countFilled(p.familyHistory) > 0,
    countFilled(p.nonPathologicalHistory) > 0,
    countFilled(p.pathologicalHistory) > 0,
    p.currentMedications.length > 0,
    p.allergies.length > 0,
  ]
  const filled = sections.filter(Boolean).length
  return Math.round((filled / sections.length) * 100)
}

export function calculateEncounterCompletionPct(p: EncounterHistoryPayload): number {
  const sections = [
    p.chiefComplaint.trim().length > 0,
    countFilled(p.presentIllness) > 0,
    countFilled(p.vitals) > 0,
    countFilled(p.physicalExam) > 0,
    p.assessment.length > 0,
    countFilled(p.treatmentPlan) > 0 || countFilled(p.diagnosticPlan) > 0,
  ]
  const filled = sections.filter(Boolean).length
  return Math.round((filled / sections.length) * 100)
}

export const ENCOUNTER_SECTION_KEYS = [
  'chiefComplaint',
  'presentIllness',
  'pertinentNegatives',
  'reviewOfSystems',
  'vitals',
  'physicalExam',
  'assessment',
  'diagnosticPlan',
  'treatmentPlan',
  'followUp',
] as const

export type EncounterSectionKey = (typeof ENCOUNTER_SECTION_KEYS)[number]

export function calculateSectionCompletions(
  p: EncounterHistoryPayload,
): Record<EncounterSectionKey, number> {
  const toPct = (filled: number, total: number) =>
    total === 0 ? 0 : Math.round((filled / total) * 100)
  const chief = p.chiefComplaint.trim().length > 0 ? 100 : 0
  const pi = countFilled(p.presentIllness)
  const piTotal = 7 // onset, duration, course, location, intensity, characteristics, summary
  const neg = p.pertinentNegatives.length > 0 ? 100 : 0
  const ros = Math.min(100, countFilled(p.reviewOfSystems) * 12)
  const vitals = Math.min(100, countFilled(p.vitals) * 14)
  const exam = Math.min(100, countFilled(p.physicalExam) * 14)
  const assess = p.assessment.length > 0 ? 100 : 0
  const dxPlan = Math.min(100, countFilled(p.diagnosticPlan) * 34)
  const txPlan = Math.min(100, countFilled(p.treatmentPlan) * 34)
  const follow = Math.min(100, countFilled(p.followUp) * 50)
  return {
    chiefComplaint: chief,
    presentIllness: toPct(pi, piTotal),
    pertinentNegatives: neg,
    reviewOfSystems: ros,
    vitals,
    physicalExam: exam,
    assessment: assess,
    diagnosticPlan: dxPlan,
    treatmentPlan: txPlan,
    followUp: follow,
  }
}

export function hasMinimumForSignoff(p: EncounterHistoryPayload): {
  ok: boolean
  missing: string[]
} {
  const missing: string[] = []
  if (!p.chiefComplaint.trim()) missing.push('motivo de consulta')
  if (countFilled(p.presentIllness) === 0) missing.push('padecimiento actual')
  if (countFilled(p.vitals) === 0) missing.push('signos vitales')
  if (countFilled(p.physicalExam) === 0) missing.push('exploración física')
  if (p.assessment.length === 0) missing.push('impresión diagnóstica')
  const hasPlan = countFilled(p.treatmentPlan) > 0 || countFilled(p.diagnosticPlan) > 0
  if (!hasPlan) missing.push('plan')
  return { ok: missing.length === 0, missing }
}

export function buildSignoffBlockedMessage(missing: string[]): string {
  return `Faltan mínimos clínicos para firmar: ${missing.join(', ')}`
}

export function evaluateSignoffButtonState(args: {
  payload: EncounterHistoryPayload | null
  isSigned: boolean
  loaded: boolean
}): { disabled: boolean; title: string; missing: string[]; canSign: boolean } {
  const check = args.payload
    ? hasMinimumForSignoff(args.payload)
    : { ok: false, missing: [] as string[] }
  const disabled = args.isSigned || !args.loaded || !check.ok
  const title = args.isSigned
    ? 'La nota ya está firmada'
    : !check.ok
      ? `Faltan: ${check.missing.join(', ')}`
      : 'Firmar y cerrar (Ctrl+Enter)'
  return { disabled, title, missing: check.missing, canSign: check.ok }
}

export function migrateFromMedicalRecord(record: {
  bloodType: string | null
  allergies: string | null
  chronicConditions: string | null
  familyHistory: string | null
}): ClinicalHistoryPayload {
  const base = buildEmptyClinicalHistory()
  if (record.bloodType) base.identification.bloodType = record.bloodType
  if (record.allergies) {
    base.allergies = [{ description: record.allergies, source: 'legacy:MedicalRecord' }]
  }
  if (record.chronicConditions) {
    base.pathologicalHistory.chronicConditions = record.chronicConditions
  }
  if (record.familyHistory) {
    base.familyHistory.summary = record.familyHistory
  }
  base.completionPct = calculateClinicalCompletionPct(base)
  return base
}
