export type LongitudinalEncounterEntry = {
  encounterId: string
  date: string // ISO date of the encounter
  chiefComplaint: string | null
  assessmentDiagnoses: string[]
  treatmentPlanSummary: string | null
  soapAssessment: string | null
  followUpNotes: string | null
  completionPct: number
  signed: boolean
}

type PriorEncounterRow = {
  id: string
  openedAt: Date
  appointment: { startTime: Date } | null
  encounterHistory: {
    payload: unknown
    completionPct: number
  } | null
  clinicalNote: {
    subjective: string | null
    objective: string | null
    assessment: string | null
    plan: string | null
    signedAt: Date | null
  } | null
}

function safeStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function extractDiagnoses(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return []
  const p = payload as Record<string, unknown>
  const assessment = p['assessment']
  if (!Array.isArray(assessment)) return []
  return assessment
    .map((a) => {
      if (typeof a === 'object' && a !== null) {
        const d = (a as Record<string, unknown>)['diagnosis']
        return typeof d === 'string' && d.trim() ? d.trim() : null
      }
      return null
    })
    .filter((d): d is string => d !== null)
}

function extractFollowUp(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  const followUp = p['followUp']
  if (!followUp || typeof followUp !== 'object') return null
  const f = followUp as Record<string, unknown>
  return (
    safeStr(f['instructions']) ??
    safeStr(f['notes']) ??
    safeStr(f['nextAppointment']) ??
    null
  )
}

function extractTreatmentSummary(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  const tp = p['treatmentPlan']
  if (!tp || typeof tp !== 'object') return null
  const t = tp as Record<string, unknown>
  return (
    safeStr(t['medications']) ??
    safeStr(t['instructions']) ??
    safeStr(t['summary']) ??
    null
  )
}

export function buildLongitudinalSummary(
  encounters: PriorEncounterRow[],
): LongitudinalEncounterEntry[] {
  return encounters.map((enc) => {
    const payload = enc.encounterHistory?.payload ?? null
    const date = (enc.appointment?.startTime ?? enc.openedAt).toISOString()

    const chiefComplaint =
      (payload && typeof payload === 'object'
        ? safeStr((payload as Record<string, unknown>)['chiefComplaint'])
        : null) ?? enc.clinicalNote?.subjective?.slice(0, 200) ?? null

    const assessmentDiagnoses =
      extractDiagnoses(payload).length > 0
        ? extractDiagnoses(payload)
        : enc.clinicalNote?.assessment
          ? [enc.clinicalNote.assessment.slice(0, 300)]
          : []

    const treatmentPlanSummary =
      extractTreatmentSummary(payload) ??
      (enc.clinicalNote?.plan ? enc.clinicalNote.plan.slice(0, 300) : null)

    return {
      encounterId: enc.id,
      date,
      chiefComplaint,
      assessmentDiagnoses,
      treatmentPlanSummary,
      soapAssessment: enc.clinicalNote?.assessment?.slice(0, 400) ?? null,
      followUpNotes: extractFollowUp(payload),
      completionPct: enc.encounterHistory?.completionPct ?? 0,
      signed: Boolean(enc.clinicalNote?.signedAt),
    }
  })
}
