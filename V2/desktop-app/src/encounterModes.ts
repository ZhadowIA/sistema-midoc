// Modos de la pantalla de Atención (Estación Clínica, Paso 4): qué secciones
// están disponibles y cuál se muestra. Separado de la UI para poder probar la
// lógica sin React. La presentación (control segmentado) vive en Atencion.tsx.

export type EncounterSectionId =
  | "preconsulta"
  | "historial"
  | "antecedentes"
  | "ia"
  | "nota"
  | "modulo"
  | "receta";

export interface EncounterMode {
  id: EncounterSectionId;
  label: string;
}

export interface EncounterModesArgs {
  /** Hay resultado de la preconsulta guiada por IA (kind ai-preconsulta). */
  hasPreconsulta: boolean;
  hasHistory: boolean;
  signed: boolean;
  moduleLabel: string;
}

// Orden y disponibilidad de los modos. Preconsulta e historial solo aparecen
// si hay datos; la asistencia de IA desaparece una vez firmada la consulta. El
// modo "Antecedentes" siempre esta (el medico puede capturarlos en consulta).
export function buildEncounterModes({
  hasPreconsulta,
  hasHistory,
  signed,
  moduleLabel
}: EncounterModesArgs): EncounterMode[] {
  const modes: EncounterMode[] = [];
  if (hasPreconsulta) modes.push({ id: "preconsulta", label: "Preconsulta" });
  if (hasHistory) modes.push({ id: "historial", label: "Historial" });
  modes.push({ id: "antecedentes", label: "Antecedentes" });
  if (!signed) modes.push({ id: "ia", label: "Asistencia de IA" });
  modes.push({ id: "nota", label: "Nota clinica (SOAP)" });
  modes.push({ id: "modulo", label: moduleLabel });
  modes.push({ id: "receta", label: "Receta" });
  return modes;
}

// El modo activo que realmente se muestra: si el guardado ya no existe (p. ej.
// la consulta se firmó y la IA desapareció), recae en la nota, siempre presente.
export function resolveActiveSection(
  modes: EncounterMode[],
  active: EncounterSectionId
): EncounterSectionId {
  return modes.some((mode) => mode.id === active) ? active : "nota";
}
