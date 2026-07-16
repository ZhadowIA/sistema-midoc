// Fechas sin hora ("2005-08-05", fecha de nacimiento, fechas prometidas).
//
// `new Date("2005-08-05")` las interpreta como medianoche UTC, y al
// formatearse en hora local de Mexico (UTC-6/7) retroceden un dia ("4 ago
// 2005"). Estas funciones parsean la fecha-sin-hora como fecha LOCAL; los
// timestamps completos (con hora) siguen el parseo normal.

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDateFlexible(value: string): Date {
  const match = DATE_ONLY.exec(value.trim());
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  return new Date(value);
}

const formatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" });

export function formatDateFlexible(value: string): string {
  const parsed = parseDateFlexible(value);
  return Number.isNaN(parsed.getTime()) ? value : formatter.format(parsed);
}
