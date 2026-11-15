// Vistas de trabajo pendiente del medico: consultas abiertas y ordenes de
// laboratorio fuera del consultorio. Modulo puro para probarlo con node --test.

export interface OpenEncounterRow {
  encounter_id: string;
  patient_id: string;
  patient_name: string;
  opened_at: string;
  appointment_id: string | null;
  diagnosis: string;
  has_note: boolean;
}

function localDay(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Dias completos (en fecha local) entre la apertura y hoy. */
export function daysOpen(openedAt: string, now: Date): number {
  const opened = new Date(openedAt);
  if (Number.isNaN(opened.getTime())) return 0;
  return Math.max(0, Math.round((localDay(now) - localDay(opened)) / 86_400_000));
}

export function openedLabel(openedAt: string, now: Date): string {
  const days = daysOpen(openedAt, now);
  if (days === 0) return "Abierta hoy";
  if (days === 1) return "Abierta ayer";
  return `Abierta hace ${days} dias`;
}

/** Resumen de lo escrito: el diagnostico, o si aun no hay nota. */
export function noteSummary(row: Pick<OpenEncounterRow, "diagnosis" | "has_note">): string {
  const diagnosis = row.diagnosis.trim();
  if (diagnosis) return `Dx: ${diagnosis}`;
  return row.has_note ? "Nota sin diagnostico" : "Sin nota";
}

/** Una consulta abierta de otro dia merece atencion: quedo sin firmar. */
export function isStale(openedAt: string, now: Date): boolean {
  return daysOpen(openedAt, now) >= 1;
}
