export function toIsoDate(date: Date): string {
  return date.toISOString();
}

/** Fecha de calendario UTC (AAAA-MM-DD). */
export function toUtcCalendarDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Suma meses en UTC sin desbordar el fin de mes: 31 de enero + 1 mes es el
 * ultimo dia de febrero, no el 3 de marzo.
 */
export function addUtcMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(date.getUTCDate(), lastDay),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds()
    )
  );
}
