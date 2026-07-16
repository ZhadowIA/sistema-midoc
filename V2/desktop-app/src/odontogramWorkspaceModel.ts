import {
  coerceDentalPayload,
  getDefaultDentalToothRecord,
  type DentalPayload,
  type DentalToothRecord,
  type RestorationMaterial,
  type SurfaceCondition,
  type ToothFace,
  type ToothStatus
} from "./clinicalProfiles.ts";
import { hasFindings } from "./odontogramModel.ts";

export type OdontogramTool =
  | {
      scope: "SURFACE";
      condition: SurfaceCondition;
      material?: RestorationMaterial;
    }
  | {
      scope: "TOOTH";
      status: ToothStatus;
    };

export interface SpecialtyHistoryEntry {
  encounter_id: string;
  opened_at: string;
  signed_at: string | null;
  status: string;
  specialty_json: string;
}

export interface SignedDentalHistoryEntry {
  encounterId: string;
  openedAt: string;
  signedAt: string;
  payload: DentalPayload;
}

export interface ToothDifference {
  changed: boolean;
  statusChanged: boolean;
  notesChanged: boolean;
  changedFaces: ToothFace[];
}

export interface OdontogramUndoState {
  past: DentalPayload[];
  future: DentalPayload[];
}

const HISTORY_LIMIT = 50;
const FACE_ORDER: ToothFace[] = ["M", "O", "D", "V", "L"];

export function applyOdontogramTool(
  payload: DentalPayload,
  toothId: string,
  face: ToothFace | null,
  tool: OdontogramTool
): DentalPayload {
  const tooth = payload.odontogram[toothId] ?? getDefaultDentalToothRecord();
  let nextTooth: DentalToothRecord;

  if (tool.scope === "TOOTH") {
    if (tooth.status === tool.status) {
      return payload;
    }
    nextTooth = { ...tooth, status: tool.status };
  } else {
    if (!face) {
      return payload;
    }
    const surfaces = { ...tooth.surfaces };
    if (tool.condition === "HEALTHY") {
      if (!surfaces[face]) {
        return payload;
      }
      delete surfaces[face];
    } else {
      const nextSurface = tool.material && tool.condition === "RESTORED"
        ? { condition: tool.condition, material: tool.material }
        : { condition: tool.condition };
      const currentSurface = surfaces[face];
      if (
        currentSurface?.condition === nextSurface.condition &&
        currentSurface?.material === nextSurface.material
      ) {
        return payload;
      }
      surfaces[face] = nextSurface;
    }
    nextTooth = { ...tooth, surfaces };
  }

  const odontogram = { ...payload.odontogram };
  if (!hasFindings(nextTooth)) {
    delete odontogram[toothId];
  } else {
    odontogram[toothId] = nextTooth;
  }

  return {
    ...payload,
    odontogram
  };
}

export function resetToothFindings(payload: DentalPayload, toothId: string): DentalPayload {
  const tooth = payload.odontogram[toothId] ?? getDefaultDentalToothRecord();
  const nextTooth = { ...tooth, status: "HEALTHY" as const, surfaces: {} };
  const odontogram = { ...payload.odontogram };
  if (nextTooth.notes.trim() === "") {
    delete odontogram[toothId];
  } else {
    odontogram[toothId] = nextTooth;
  }
  return {
    ...payload,
    odontogram
  };
}

export function compareTeeth(
  current: DentalToothRecord | undefined,
  baseline: DentalToothRecord | undefined
): ToothDifference {
  const currentTooth = current ?? getDefaultDentalToothRecord();
  const baselineTooth = baseline ?? getDefaultDentalToothRecord();
  const changedFaces = FACE_ORDER.filter((face) => {
    const currentSurface = currentTooth.surfaces[face];
    const baselineSurface = baselineTooth.surfaces[face];
    return currentSurface?.condition !== baselineSurface?.condition ||
      currentSurface?.material !== baselineSurface?.material;
  });
  const statusChanged = currentTooth.status !== baselineTooth.status;
  const notesChanged = currentTooth.notes !== baselineTooth.notes;
  return {
    changed: statusChanged || notesChanged || changedFaces.length > 0,
    statusChanged,
    notesChanged,
    changedFaces
  };
}

export function changedToothIds(current: DentalPayload, baseline: DentalPayload): Set<string> {
  const toothIds = new Set([
    ...Object.keys(current.odontogram),
    ...Object.keys(baseline.odontogram)
  ]);
  return new Set(
    [...toothIds].filter((toothId) =>
      compareTeeth(current.odontogram[toothId], baseline.odontogram[toothId]).changed
    )
  );
}

export function dentalPayloadFingerprint(payload: DentalPayload): string {
  return JSON.stringify(coerceDentalPayload(payload));
}

export function parseSignedDentalHistory(
  entries: SpecialtyHistoryEntry[]
): SignedDentalHistoryEntry[] {
  return entries.flatMap((entry) => {
    if (entry.status !== "SIGNED" || !entry.signed_at) {
      return [];
    }
    try {
      const parsed: unknown = JSON.parse(entry.specialty_json);
      if (typeof parsed !== "object" || parsed === null || !("odontogram" in parsed)) {
        return [];
      }
      return [{
        encounterId: entry.encounter_id,
        openedAt: entry.opened_at,
        signedAt: entry.signed_at,
        payload: coerceDentalPayload(parsed)
      }];
    } catch {
      return [];
    }
  });
}

export function initialSignedPayload(
  entries: SignedDentalHistoryEntry[]
): DentalPayload | null {
  return entries[0]?.payload ?? null;
}

export function hasHistoricalToothFinding(
  entries: SignedDentalHistoryEntry[],
  toothId: string
): boolean {
  return entries.some((entry) => hasFindings(entry.payload.odontogram[toothId]));
}

export function recordUndoAction(
  state: OdontogramUndoState,
  previous: DentalPayload
): OdontogramUndoState {
  return {
    past: [...state.past, previous].slice(-HISTORY_LIMIT),
    future: []
  };
}

export function undoOdontogramAction(
  state: OdontogramUndoState,
  current: DentalPayload
): { state: OdontogramUndoState; payload: DentalPayload } | null {
  const previous = state.past[state.past.length - 1];
  if (!previous) {
    return null;
  }
  return {
    payload: previous,
    state: {
      past: state.past.slice(0, -1),
      future: [current, ...state.future].slice(0, HISTORY_LIMIT)
    }
  };
}

export function redoOdontogramAction(
  state: OdontogramUndoState,
  current: DentalPayload
): { state: OdontogramUndoState; payload: DentalPayload } | null {
  const next = state.future[0];
  if (!next) {
    return null;
  }
  return {
    payload: next,
    state: {
      past: [...state.past, current].slice(-HISTORY_LIMIT),
      future: state.future.slice(1)
    }
  };
}
