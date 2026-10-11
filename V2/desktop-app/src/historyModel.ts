// Renglon del historial de consultas (Expediente, Directorio y la consulta
// abierta): el diagnostico en texto libre y los CIE-10 de la nota vigente.

import { displayCode, type CodedDiagnosis } from "./cie10Model.ts";

export interface HistoryEntry {
  encounter_id: string;
  signed_at: string | null;
  status: string;
  diagnosis: string;
  /** Opcional: un motor anterior a esta version no lo manda. */
  coded_diagnoses?: CodedDiagnosis[];
}

export function historyDiagnosis(entry: HistoryEntry): { text: string; codes: string[] } {
  const coded = [...(entry.coded_diagnoses ?? [])].sort((a, b) => Number(b.principal) - Number(a.principal));
  const codes = coded.map((d) => `${displayCode(d.code)} ${d.name}`.trim());
  const text = entry.diagnosis.trim();
  return { text: text || (codes.length > 0 ? "" : "Sin diagnóstico registrado"), codes };
}
