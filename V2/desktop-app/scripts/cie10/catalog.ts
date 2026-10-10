//! Transformacion pura del catalogo CIE-10 de la Secretaria de Salud (paso 28,
//! rebanada 2) al CSV compacto que empaqueta la app. Sin red ni archivos: la
//! descarga vive en build.ts.

/** Fila tal como la publica datos.gob.mx (solo los campos que se usan). */
export interface RawCie10Row {
  CATALOG_KEY: string;
  NOMBRE: string;
  LSEX: string;
  LINF: string;
  LSUP: string;
  VALID: string;
  RUBRICA_TYPE: string;
  DIA_SIS: string;
}

export interface Cie10Entry {
  /** Clave sin punto, como la usa el sector salud (A182, A09). */
  code: string;
  name: string;
  /** "F", "M" o "" si no hay restriccion. */
  sex: "" | "F" | "M";
  /** Limites de edad en dias; null = sin limite. */
  minAgeDays: number | null;
  maxAgeDays: number | null;
  /** Valido como causa en consulta externa (DIA_SIS). */
  outpatient: boolean;
}

const UNIT_DAYS: Record<string, number> = { H: 0, D: 1, M: 30, A: 365 };

/** "028D" -> 28, "011M" -> 330, "000H" -> 0, "NO" -> null. */
export function parseAgeLimit(raw: string): number | null {
  const value = raw.trim().toUpperCase();
  const match = /^(\d{3})([HDMA])$/.exec(value);
  if (!match) return null;
  return Number(match[1]) * UNIT_DAYS[match[2]];
}

/** Las categorias de 3 caracteres se publican con X para presentarse a 4. */
export function normalizeCode(raw: string): string {
  const code = raw.trim().toUpperCase();
  return code.length === 4 && code.endsWith("X") ? code.slice(0, 3) : code;
}

/** Codigo a mostrar: A182 -> A18.2, A09 -> A09. */
export function displayCode(code: string): string {
  return code.length > 3 ? `${code.slice(0, 3)}.${code.slice(3)}` : code;
}

function parseSex(raw: string): Cie10Entry["sex"] {
  const value = raw.trim().toUpperCase();
  if (value === "MUJER") return "F";
  if (value === "HOMBRE") return "M";
  return "";
}

/**
 * Deja solo codigos vigentes para codificar: vigentes (VALID = SI), no borrados
 * por las actualizaciones de la OMS (RUBRICA_TYPE B) y con clave CIE-10 real.
 * El orden de salida es por codigo para que el CSV sea estable entre corridas.
 */
export function toEntries(rows: RawCie10Row[]): Cie10Entry[] {
  const entries = new Map<string, Cie10Entry>();
  for (const row of rows) {
    const code = normalizeCode(row.CATALOG_KEY);
    if (!/^[A-Z]\d{2}\d?$/.test(code)) continue;
    if (row.VALID.trim().toUpperCase() !== "SI") continue;
    if (row.RUBRICA_TYPE.trim().toUpperCase() === "B") continue;
    entries.set(code, {
      code,
      name: row.NOMBRE.trim().replace(/\s+/g, " "),
      sex: parseSex(row.LSEX),
      minAgeDays: parseAgeLimit(row.LINF),
      maxAgeDays: parseAgeLimit(row.LSUP),
      outpatient: row.DIA_SIS.trim().toUpperCase() === "SI"
    });
  }
  return [...entries.values()].sort((a, b) => a.code.localeCompare(b.code));
}

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(entries: Cie10Entry[]): string {
  const lines = ["code,name,sex,min_age_days,max_age_days,outpatient"];
  for (const e of entries) {
    lines.push(
      [
        e.code,
        csvField(e.name),
        e.sex,
        e.minAgeDays ?? "",
        e.maxAgeDays ?? "",
        e.outpatient ? "1" : "0"
      ].join(",")
    );
  }
  return `${lines.join("\n")}\n`;
}
