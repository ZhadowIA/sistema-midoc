//! Reglas medicamento contra padecimiento (paso 33, etapa 5). Transformacion
//! pura: sin red ni archivos (build.ts los lee y escribe).
//!
//! Una regla dice: este principio activo, en un paciente con este diagnostico
//! CIE-10 (o cualquiera de su grupo), es una contraindicacion o pide
//! precaucion. Solo entran reglas revisadas: `reglas.csv` exige fuente y
//! revisor (decision del 2026-10-20: el medico piloto y el farmaceutico). Los
//! textos del CNIS en `propuestas.csv` son materia prima, no reglas.

export type Severity = "CONTRAINDICADA" | "PRECAUCION";

export interface Rule {
  /** Id del catalogo de ingredientes. */
  ingredient: string;
  /** Clave CIE-10 sin punto, o su inicio para cubrir un grupo (N18 cubre N180...N189). */
  cie10: string;
  /** Como se lee el padecimiento en la alerta ("Insuficiencia renal cronica"). */
  condition: string;
  severity: Severity;
  recommendation: string;
  source: string;
  reviewedBy: string;
}

/** Minusculas sin acentos, espacios simples (igual que `normalize_name` de Rust). */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function csvSplit(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quoted && c === '"' && line[i + 1] === '"') {
      field += '"';
      i += 1;
    } else if (c === '"') {
      quoted = !quoted;
    } else if (c === "," && !quoted) {
      fields.push(field.trim());
      field = "";
    } else {
      field += c;
    }
  }
  fields.push(field.trim());
  return fields;
}

function dataLines(csv: string): string[] {
  return csv.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim() && !l.startsWith("#"));
}

const HEADER = "ingrediente,cie10,padecimiento,gravedad,recomendacion,fuente,revisado_por";

const SEVERITIES: Record<string, Severity> = {
  contraindicada: "CONTRAINDICADA",
  contraindicacion: "CONTRAINDICADA",
  precaucion: "PRECAUCION"
};

/** Lee `reglas.csv`. Fuente y revisor obligatorios. */
export function parseRules(csv: string): Rule[] {
  const lines = dataLines(csv);
  if (lines.length === 0) return [];
  if (lines[0].trim() !== HEADER) throw new Error(`reglas.csv: encabezado esperado "${HEADER}"`);
  return lines.slice(1).map((line, k) => {
    const f = csvSplit(line);
    const where = `reglas.csv, fila ${k + 2}`;
    if (f.length !== 7) throw new Error(`${where}: se esperaban 7 columnas`);
    const [ingredient, cie10, condition, severity, recommendation, source, reviewedBy] = f;
    if (!ingredient || !cie10 || !condition) throw new Error(`${where}: faltan el ingrediente, la CIE-10 o el padecimiento`);
    const level = SEVERITIES[normalize(severity)];
    if (!level) throw new Error(`${where}: gravedad debe ser "contraindicada" o "precaucion"`);
    if (!source || !reviewedBy) throw new Error(`${where}: falta la fuente o quien la reviso`);
    const code = cie10.replace(/\./g, "").toUpperCase();
    if (!/^[A-Z]\d{1,3}[0-9X]?$/.test(code)) throw new Error(`${where}: clave CIE-10 invalida "${cie10}"`);
    return { ingredient: normalize(ingredient), cie10: code, condition, severity: level, recommendation, source, reviewedBy };
  });
}

function column(csv: string, name: string): string[] {
  const lines = dataLines(csv);
  const index = csvSplit(lines[0] ?? "").indexOf(name);
  return lines.slice(1).map((line) => csvSplit(line)[index] ?? "");
}

/**
 * Valida contra los catalogos: el ingrediente existe, la clave CIE-10 (o su
 * grupo) existe y la regla no se repite.
 */
export function validateRules(rules: Rule[], ingredientsCsv: string, cie10Csv: string): Rule[] {
  const ingredients = new Set(column(ingredientsCsv, "id"));
  const codes = column(cie10Csv, "code");
  const seen = new Set<string>();
  for (const rule of rules) {
    if (!ingredients.has(rule.ingredient)) throw new Error(`regla: no existe el ingrediente "${rule.ingredient}"`);
    if (!codes.some((code) => code.startsWith(rule.cie10))) throw new Error(`regla: no existe la CIE-10 "${rule.cie10}"`);
    const key = `${rule.ingredient}|${rule.cie10}`;
    if (seen.has(key)) throw new Error(`regla repetida: ${rule.ingredient} con ${rule.cie10}`);
    seen.add(key);
  }
  return [...rules].sort((a, b) => a.ingredient.localeCompare(b.ingredient) || a.cie10.localeCompare(b.cie10));
}

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rules: Rule[]): string {
  const lines = ["ingredient,cie10,condition,severity,recommendation,source"];
  for (const r of rules) {
    lines.push(
      [r.ingredient, r.cie10, r.condition, r.severity, r.recommendation, r.source].map(csvField).join(",")
    );
  }
  return `${lines.join("\n")}\n`;
}

/** `propuestas.csv`: el texto del CNIS por generico, para quien escribe las reglas. */
export function proposalsCsv(items: { generic: string; text: string }[]): string {
  const unique = new Map<string, { generic: string; text: string }>();
  for (const item of items) unique.set(`${item.generic}|${item.text}`, item);
  const lines = [
    "# Generado por npm run cnis:build. Texto de \"Contraindicaciones y Precauciones\" del CNIS por generico.",
    "# NO son reglas: quien revise escribe en reglas.csv la regla (ingrediente, CIE-10, gravedad...) con fuente y revisor.",
    "generico,ingrediente,texto"
  ];
  for (const item of [...unique.values()].sort((a, b) => a.generic.localeCompare(b.generic))) {
    lines.push([item.generic, normalize(item.generic), item.text].map(csvField).join(","));
  }
  return `${lines.join("\n")}\n`;
}
