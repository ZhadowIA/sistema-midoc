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
