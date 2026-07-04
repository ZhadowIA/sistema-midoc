// Modo Foco (Estación Clínica, Paso 4): mientras el médico dicta, el chrome de
// navegación (barra superior, banner, conmutador de modos) se atenúa para
// concentrar la atención en la nota y la transcripción en vivo. El panel de
// contexto (alergias, etc.) NO se atenúa: la seguridad del paciente manda.
// Aquí vive solo la condición, para poder probarla sin DOM.

export type RecordingState = "idle" | "recording" | "stopping";

// Clase que se añade al <body> para activar el atenuado (ver App.css).
export const DICTATING_BODY_CLASS = "dictating";

// El foco se activa solo mientras se está grabando, no al detener ni en reposo.
export function isDictating(state: RecordingState): boolean {
  return state === "recording";
}
