//! Nucleo curado de marcas comerciales (paso 33, etapa 3). Transformacion pura:
//! sin red ni archivos (build.ts los lee y escribe).
//!
//! Cada marca se desglosa en los ingredientes del catalogo canonico
//! (`reference_data/ingredients.csv`). Solo entran las marcas que una persona
//! reviso: `marcas.csv` exige fuente y revisor. Las altas que hace cada medico
//! en su app viven solo en su computadora y no pasan por aqui.

export interface Brand {
  /** Nombre normalizado (minusculas, sin acentos), como se busca en la receta. */
  name: string;
  /** Como se muestra ("Tempra"). */
  display: string;
  /** Ingredientes del catalogo canonico (ids), en el orden escrito. */
  ingredients: string[];
  laboratory: string;
  source: string;
  reviewedBy: string;
}

/** Minusculas sin acentos, espacios simples (igual que `normalize_name` de Rust). */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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

const HEADER = "marca,ingredientes,laboratorio,fuente,revisado_por";

/**
 * Lee `marcas.csv`. `ingredientes` separa los principios activos con "+"
 * ("paracetamol + cafeina"). Fuente y revisor son obligatorios.
 */
export function parseBrands(csv: string): Brand[] {
  const lines = dataLines(csv);
  if (lines.length === 0) return [];
  if (lines[0].trim() !== HEADER) throw new Error(`marcas.csv: encabezado esperado "${HEADER}"`);
  return lines.slice(1).map((line, k) => {
    const f = csvSplit(line);
    const where = `marcas.csv, fila ${k + 2}`;
    if (f.length !== 5) throw new Error(`${where}: se esperaban 5 columnas`);
    const [display, ingredients, laboratory, source, reviewedBy] = f;
    if (!display || !ingredients) throw new Error(`${where}: faltan la marca o sus ingredientes`);
    if (!source || !reviewedBy) throw new Error(`${where}: falta la fuente o quien la reviso`);
    return {
      name: normalize(display),
      display,
      ingredients: ingredients.split("+").map(normalize).filter(Boolean),
      laboratory,
      source,
      reviewedBy
    };
  });
}

/** Nombres y ids del catalogo de ingredientes (`ingredients.csv`). */
export function ingredientNames(ingredientsCsv: string): { ids: Set<string>; names: Set<string> } {
  const lines = dataLines(ingredientsCsv);
  const header = csvSplit(lines[0] ?? "");
  const idCol = header.indexOf("id");
  const namesCol = header.indexOf("names");
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const line of lines.slice(1)) {
    const f = csvSplit(line);
    ids.add(f[idCol]);
    for (const n of (f[namesCol] ?? "").split("|")) if (n) names.add(n);
  }
  return { ids, names };
}

/**
 * Valida las marcas contra el catalogo de ingredientes: cada ingrediente debe
 * existir, una marca no puede llamarse como un ingrediente (lo taparia) y no
 * puede repetirse.
 */
export function validateBrands(brands: Brand[], ingredientsCsv: string): Brand[] {
  const { ids, names } = ingredientNames(ingredientsCsv);
  const seen = new Set<string>();
  for (const brand of brands) {
    for (const id of brand.ingredients) {
      if (!ids.has(id)) throw new Error(`marca "${brand.display}": no existe el ingrediente "${id}"`);
    }
    if (names.has(brand.name)) throw new Error(`marca "${brand.display}": se llama igual que un ingrediente`);
    if (seen.has(brand.name)) throw new Error(`marca "${brand.display}": repetida`);
    seen.add(brand.name);
  }
  return [...brands].sort((a, b) => a.name.localeCompare(b.name));
}

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(brands: Brand[]): string {
  const lines = ["name,display,ingredients,laboratory"];
  for (const b of brands) {
    lines.push([csvField(b.name), csvField(b.display), csvField(b.ingredients.join("|")), csvField(b.laboratory)].join(","));
  }
  return `${lines.join("\n")}\n`;
}
