// Tema visual de la app del médico (Estación Clínica, Paso 4). «Cobalto
// Nocturno» es el mismo sistema recalibrado para fondo oscuro: misma identidad,
// contraste AA, para poca luz y jornadas largas. La preferencia se guarda local
// (es config de la UI, no dato clínico). Lógica pura aquí para poder probarla.

export type Theme = "light" | "night";

export const THEME_STORAGE_KEY = "midoc-theme";

// Lee de forma tolerante lo guardado en localStorage.
export function isNightTheme(value: string | null | undefined): boolean {
  return value === "night";
}

// Alterna entre claro y nocturno.
export function nextTheme(current: Theme): Theme {
  return current === "night" ? "light" : "night";
}

// Etiqueta del control para pasar AL otro tema.
export function themeToggleLabel(current: Theme): string {
  return current === "night" ? "☀ Tema claro" : "🌙 Cobalto nocturno";
}
