// Fechas de calendario ("YYYY-MM-DD") basadas en los componentes LOCALES del
// navegador, no en UTC. `Date#toISOString` y `new Date("YYYY-MM-DD")` usan UTC,
// lo que corre el dia uno hacia atras/adelante en husos horarios negativos
// (p. ej. Mexico por la noche). Estas utilidades evitan ese off-by-one.

/** "YYYY-MM-DD" a partir de los componentes locales de la fecha. */
export function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Fecha local (medianoche local) a partir de un "YYYY-MM-DD". */
export function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

/** "YYYY-MM-DD" de hoy en local. */
export function todayLocalDateString(): string {
  return toLocalDateString(new Date());
}

/** "YYYY-MM-DD" de hoy + n dias en local. */
export function addDaysLocalDateString(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toLocalDateString(date);
}
