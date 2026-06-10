/**
 * Conversion entre horas "de pared" en una zona IANA y instantes UTC,
 * usando solo Intl (sin dependencias). Maneja horario de verano por
 * convergencia iterativa del offset.
 */

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string) {
  let formatter = formatterCache.get(timeZone);

  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    formatterCache.set(timeZone, formatter);
  }

  return formatter;
}

export function isValidTimeZone(timeZone: string) {
  try {
    getFormatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

type WallClock = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
};

function getWallClock(instant: Date, timeZone: string): WallClock & { second: number } {
  const parts: Record<string, number> = {};

  for (const part of getFormatter(timeZone).formatToParts(instant)) {
    if (part.type !== "literal") {
      parts[part.type] = Number(part.value);
    }
  }

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    // h23 puede reportar 24 para medianoche en algunos runtimes.
    hour: parts.hour === 24 ? 0 : parts.hour,
    minute: parts.minute,
    second: parts.second
  };
}

/** Offset de la zona (ms a sumar a UTC para obtener hora local) en un instante dado. */
function getTimeZoneOffsetMs(timeZone: string, instant: Date) {
  const wall = getWallClock(instant, timeZone);
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * Convierte una hora de pared en la zona dada al instante UTC correspondiente.
 * En transiciones de horario de verano (hora inexistente o repetida) devuelve
 * un instante consistente con el offset vigente tras la transicion.
 */
export function zonedWallClockToUtc(wall: WallClock, timeZone: string) {
  const naiveUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  let timestamp = naiveUtc - getTimeZoneOffsetMs(timeZone, new Date(naiveUtc));
  // Segunda pasada: cerca de un cambio de horario el primer offset puede ser
  // el del lado equivocado de la transicion.
  timestamp = naiveUtc - getTimeZoneOffsetMs(timeZone, new Date(timestamp));
  return new Date(timestamp);
}

export type LocalDate = {
  year: number;
  month: number; // 1-12
  day: number;
};

/** Fecha de calendario que un instante UTC tiene en la zona dada. */
export function getLocalDate(instant: Date, timeZone: string): LocalDate {
  const wall = getWallClock(instant, timeZone);
  return { year: wall.year, month: wall.month, day: wall.day };
}

/** Suma dias a una fecha de calendario (aritmetica de calendario, sin zona). */
export function addDaysToLocalDate(date: LocalDate, days: number): LocalDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate()
  };
}

/** Dia de la semana (0 = domingo) de una fecha de calendario. */
export function getLocalDayOfWeek(date: LocalDate) {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

/** Parsea "YYYY-MM-DD"; devuelve null si no es una fecha valida. */
export function parseLocalDate(value: string): LocalDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));

  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

/** Formatea una fecha de calendario como "YYYY-MM-DD". */
export function formatLocalDate(date: LocalDate) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}

/**
 * Instante UTC de una hora "HH:MM" en una fecha de calendario de la zona dada.
 */
export function localDateTimeToUtc(date: LocalDate, time: string, timeZone: string) {
  const [hour, minute] = time.split(":").map(Number);
  return zonedWallClockToUtc({ ...date, hour, minute }, timeZone);
}
