// Lógica pura del panel de contexto permanente de la pantalla de Atención
// (Estación Clínica, Paso 4). Reúne lo que el médico necesita ver SIN cambiar
// de sección mientras escribe la nota: alergias, resumen de antecedentes y de
// consultas previas. La presentación vive en Atencion.tsx; aquí solo decisiones
// y formato, para poder probarlo sin React.

export interface ContextHistoryEntry {
  encounter_id: string;
  signed_at: string | null;
  diagnosis: string;
}

export interface ContextHistoryRow {
  encounterId: string;
  when: string | null; // ya formateado, o null si la consulta no está firmada
  diagnosis: string; // con respaldo legible si no hay diagnóstico
}

const NO_DIAGNOSIS = "Sin diagnostico registrado";

// Texto de alergias listo para mostrar, o null si no hay nada que alertar.
export function allergyText(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// Convierte el historial del expediente en filas compactas para el panel.
// `formatDate` se inyecta para no acoplar el módulo a Intl ni a la zona horaria.
export function buildContextHistory(
  history: ContextHistoryEntry[],
  formatDate: (iso: string) => string,
  limit = 5
): ContextHistoryRow[] {
  return history.slice(0, limit).map((entry) => ({
    encounterId: entry.encounter_id,
    when: entry.signed_at ? formatDate(entry.signed_at) : null,
    diagnosis: entry.diagnosis.trim() || NO_DIAGNOSIS
  }));
}

// ¿El historial está vacío? El panel muestra "primera vez" en vez de un hueco.
export function isFirstVisit(history: ContextHistoryEntry[]): boolean {
  return history.length === 0;
}
