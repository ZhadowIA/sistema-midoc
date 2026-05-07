import type {
  DentalSpecialtyPayload,
  FaceFinding,
  FindingEntry,
  MouthCondition,
  MouthConditionEntry,
  PieceFinding,
  ToothStatus,
} from './specialtyPayloadSchemas'

type FindingLevelDraft =
  | { level: 'PIECE'; finding: PieceFinding }
  | { level: 'FACE'; finding: FaceFinding }

type AppendMouthConditionInput = {
  condition: MouthCondition
  severity?: MouthConditionEntry['severity']
  notes?: string
  today?: string
  idFactory?: () => string
}

function defaultIdFactory() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

export function appendMouthCondition(
  payload: DentalSpecialtyPayload,
  input: AppendMouthConditionInput,
): DentalSpecialtyPayload {
  const entry: MouthConditionEntry = {
    id: input.idFactory?.() ?? defaultIdFactory(),
    date: input.today ?? todayIsoDate(),
    condition: input.condition,
    severity: input.severity,
    notes: input.notes?.trim() || undefined,
    resolved: false,
  }

  return {
    ...payload,
    mouthConditions: [...payload.mouthConditions, entry],
  }
}

export function removeMouthCondition(
  payload: DentalSpecialtyPayload,
  id: string,
): DentalSpecialtyPayload {
  return {
    ...payload,
    mouthConditions: payload.mouthConditions.filter((condition) => condition.id !== id),
  }
}

export function toggleMouthConditionResolved(
  payload: DentalSpecialtyPayload,
  id: string,
): DentalSpecialtyPayload {
  return {
    ...payload,
    mouthConditions: payload.mouthConditions.map((condition) => (
      condition.id === id
        ? { ...condition, resolved: !condition.resolved }
        : condition
    )),
  }
}

export function resolveToothStatusFromFinding(
  finding: FindingEntry | FindingLevelDraft,
): ToothStatus | null {
  if (finding.level === 'FACE') {
    if (finding.finding === 'CARIES') return 'CARIES'
    if (finding.finding === 'AMALGAM' || finding.finding === 'RESIN' || finding.finding === 'SEALANT') return 'RESTORED'
    return null
  }

  const pieceStatus: Partial<Record<PieceFinding, ToothStatus>> = {
    ABSENCE: 'MISSING',
    CROWN: 'CROWN',
    RETAINED: 'IMPACTED',
    FRACTURE: 'FRACTURE',
    ROOT_CANAL: 'ROOT_CANAL',
    BRIDGE: 'BRIDGE_ABUTMENT',
    IMPLANT: 'IMPLANT',
    EXTRACTION_INDICATED: 'EXTRACTION_INDICATED',
    SUPERNUMERARY: 'SUPERNUMERARY',
  }

  return pieceStatus[finding.finding] ?? null
}
