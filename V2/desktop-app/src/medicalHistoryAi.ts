import type { MedicalHistoryPayload } from "./medicalHistoryReconciliation";

export interface MedicalHistoryProposal {
  path: string;
  label: string;
  value: unknown;
  source_turns: string[];
  confidence: "high" | "medium" | "low";
  warning: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function valueAtMedicalHistoryPath(
  payload: MedicalHistoryPayload,
  path: string
): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (!isRecord(current)) return undefined;
    return current[key];
  }, payload);
}

/** Aplica una propuesta confirmada sin mutar la versión clínica vigente. */
export function applyMedicalHistoryProposal(
  payload: MedicalHistoryPayload,
  proposal: MedicalHistoryProposal,
  confirmedValue: unknown = proposal.value
): MedicalHistoryPayload {
  const result = structuredClone(payload);
  const keys = proposal.path.split(".");
  let cursor: Record<string, unknown> = result;
  keys.forEach((key, index) => {
    if (index === keys.length - 1) {
      cursor[key] = structuredClone(confirmedValue);
      return;
    }
    if (!isRecord(cursor[key])) cursor[key] = {};
    cursor = cursor[key] as Record<string, unknown>;
  });
  return result;
}

export function proposalValueText(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(", ");
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return String(value);
}

