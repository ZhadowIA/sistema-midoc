//! Catalogo de ingredientes canonicos (paso 33, etapa 2). Transformacion pura:
//! sin red ni archivos (build.ts los lee y escribe).
//!
//! Un ingrediente es un principio activo con una sola identidad que une:
//!   - su generico del CNIS (id y nombre a mostrar, con acentos);
//!   - su clave en la base de interacciones actual (`medications.csv`, en ingles);
//!   - sus nombres para reconocerlo en la receta.
//! La liga entre CNIS y base de interacciones solo se hace sola cuando el
//! nombre coincide exacto; lo demas lo decide una persona en `sinonimos.csv`
//! (con motivo y revisor). Las variantes y marcas de la base de interacciones
//! que no coinciden se listan en `por-revisar.csv` para el farmaceutico.

export interface Ingredient {
  /** Nombre normalizado (minusculas, sin acentos); el generico del CNIS cuando existe. */
  id: string;
  /** Como se muestra e imprime ("Ácido acetilsalicílico"). */
  display: string;
  /** Nombres normalizados que lo identifican en la receta (incluye el id). */
  names: string[];
  /** Clave de la base de interacciones (ingles), si se ligo. */
  interactionKey: string;
  /** Tiene genericos en el CNIS. */
  cnis: boolean;
}

export interface Synonym {
  ingredient: string;
  synonym: string;
  reason: string;
  reviewedBy: string;
}

export interface ReviewItem {
  ingredient: string;
  name: string;
  reason: string;
}

export interface BuildResult {
  ingredients: Ingredient[];
  review: ReviewItem[];
  /** Nombres que apuntaban a dos ingredientes y se retiraron de ambos. */
  conflicts: string[];
}

/** Minusculas sin acentos, espacios simples (igual que el CNIS y `normalize_name` de Rust). */
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

function rows(csv: string): Record<string, string>[] {
  const lines = csv.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim() && !l.startsWith("#"));
  if (lines.length === 0) return [];
  const header = csvSplit(lines[0]);
  return lines.slice(1).map((line) => {
    const f = csvSplit(line);
    return Object.fromEntries(header.map((h, k) => [h, f[k] ?? ""]));
  });
}

/** Combinaciones y nombres compuestos no son un ingrediente. */
export function isSingleIngredient(generic: string): boolean {
  const name = normalize(generic);
  return (
    !/[/,+]/.test(name) &&
    !/\b(y|compuesta|compuesto)\b/.test(name) &&
    !/[a-z]{3,}-[a-z]{3,}/.test(name)
  );
}

const SYNONYM_HEADER = "ingrediente,sinonimo,motivo,revisado_por";

/** Lee `sinonimos.csv`: sin motivo o sin revisor, la fila no entra (es un error). */
export function parseSynonyms(csv: string): Synonym[] {
  const lines = csv.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim() && !l.startsWith("#"));
  if (lines.length === 0) return [];
  if (lines[0].trim() !== SYNONYM_HEADER) throw new Error(`sinonimos.csv: encabezado esperado "${SYNONYM_HEADER}"`);
  return lines.slice(1).map((line, k) => {
    const f = csvSplit(line);
    const where = `sinonimos.csv, fila ${k + 2}`;
    if (f.length !== 4) throw new Error(`${where}: se esperaban 4 columnas`);
    const [ingredient, synonym, reason, reviewedBy] = f;
    if (!ingredient || !synonym) throw new Error(`${where}: faltan el ingrediente o el sinonimo`);
    if (!reason || !reviewedBy) throw new Error(`${where}: falta el motivo o quien lo reviso`);
    return { ingredient: normalize(ingredient), synonym: normalize(synonym), reason, reviewedBy };
  });
}

/**
 * Arma el catalogo a partir de la tabla del CNIS, la base de interacciones y
 * los sinonimos revisados. Determinista: misma entrada, misma salida.
 */
export function buildIngredients(cnisCsv: string, medicationsCsv: string, synonyms: Synonym[]): BuildResult {
  // 1. Genericos del CNIS (una sola identidad por nombre).
  const cnis = new Map<string, string>();
  for (const r of rows(cnisCsv)) {
    if (!r.generic || !isSingleIngredient(r.generic) || cnis.has(r.generic)) continue;
    cnis.set(r.generic, r.generic_display || r.generic);
  }

  // 2. Base de interacciones agrupada por su clave en ingles.
  const reference = new Map<string, { display: string; names: Set<string> }>();
  for (const r of rows(medicationsCsv)) {
    const key = normalize(r.ingredient);
    if (!key) continue;
    const entry = reference.get(key) ?? { display: r.display_name, names: new Set<string>() };
    entry.names.add(normalize(r.name));
    reference.set(key, entry);
  }

  // 3. Liga solo por nombre exacto (o por un sinonimo revisado, p. ej. "aspirina"
  // para el acido acetilsalicilico), y solo si es inequivoca en los dos sentidos.
  const reviewedOwner = new Map(synonyms.filter((s) => cnis.has(s.ingredient)).map((s) => [s.synonym, s.ingredient]));
  const toGeneric = (name: string) => (cnis.has(name) ? name : reviewedOwner.get(name));
  const linkOf = new Map<string, string>();
  const keysByGeneric = new Map<string, string[]>();
  for (const [key, entry] of reference) {
    const candidates = [...new Set([normalize(entry.display), key, ...entry.names].map(toGeneric))].filter(
      (g): g is string => Boolean(g)
    );
    if (new Set(candidates).size !== 1) continue;
    const generic = candidates[0];
    keysByGeneric.set(generic, [...(keysByGeneric.get(generic) ?? []), key]);
  }
  for (const [generic, keys] of keysByGeneric) if (keys.length === 1) linkOf.set(keys[0], generic);

  const ingredients = new Map<string, Ingredient>();
  for (const [generic, display] of cnis) {
    ingredients.set(generic, { id: generic, display, names: [generic], interactionKey: "", cnis: true });
  }
  const review: ReviewItem[] = [];
  for (const [key, entry] of reference) {
    const generic = linkOf.get(key);
    const id = generic ?? normalize(entry.display);
    let ingredient = ingredients.get(id);
    if (ingredient && !generic) {
      // El nombre ya es de un generico del CNIS que no se pudo ligar sin duda.
      review.push({ ingredient: id, name: key, reason: "liga ambigua con la base de interacciones" });
      continue;
    }
    if (!ingredient) {
      ingredient = { id, display: entry.display, names: [id], interactionKey: "", cnis: false };
      ingredients.set(id, ingredient);
    }
    ingredient.interactionKey = key;
    ingredient.names.push(key, normalize(entry.display));
    // Variantes y marcas de la base: no se usan solas; las revisa una persona.
    for (const name of entry.names) {
      if (!ingredient.names.includes(name)) {
        review.push({ ingredient: id, name, reason: "nombre de la base de interacciones (variante o marca)" });
      }
    }
  }

  // 4. Sinonimos revisados.
  for (const s of synonyms) {
    const ingredient = ingredients.get(s.ingredient);
    if (!ingredient) throw new Error(`sinonimos.csv: no existe el ingrediente "${s.ingredient}"`);
    ingredient.names.push(s.synonym);
  }

  // 5. Un nombre identifica a un solo ingrediente: si apunta a dos, sale de ambos.
  const owners = new Map<string, Set<string>>();
  for (const ingredient of ingredients.values()) {
    ingredient.names = [...new Set(ingredient.names.filter(Boolean))];
    for (const name of ingredient.names) owners.set(name, (owners.get(name) ?? new Set()).add(ingredient.id));
  }
  const conflicts = [...owners].filter(([, ids]) => ids.size > 1).map(([name]) => name).sort();
  for (const ingredient of ingredients.values()) {
    ingredient.names = ingredient.names.filter((n) => !conflicts.includes(n) || n === ingredient.id).sort();
  }

  // Lo que ya quedo como nombre de alguien no se pide revisar.
  const named = new Set([...ingredients.values()].flatMap((i) => i.names));
  return {
    ingredients: [...ingredients.values()].sort((a, b) => a.id.localeCompare(b.id)),
    review: review
      .filter((r) => !named.has(r.name))
      .sort((a, b) => a.ingredient.localeCompare(b.ingredient) || a.name.localeCompare(b.name)),
    conflicts
  };
}

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(ingredients: Ingredient[]): string {
  const lines = ["id,display,names,interaction_key,cnis"];
  for (const i of ingredients) {
    lines.push(
      [csvField(i.id), csvField(i.display), csvField(i.names.join("|")), csvField(i.interactionKey), i.cnis ? "1" : "0"].join(",")
    );
  }
  return `${lines.join("\n")}\n`;
}

export function reviewCsv(items: ReviewItem[]): string {
  const lines = [
    "# Generado por npm run ingredients:build. Nombres de la base de interacciones que no se usan hasta",
    "# que una persona los revise. Si es otro nombre del mismo principio activo, pasalo a sinonimos.csv;",
    "# si es una marca comercial, a scripts/brands/marcas.csv. En ambos casos con fuente/motivo y revisor.",
    "ingrediente,nombre,motivo"
  ];
  for (const r of items) lines.push([csvField(r.ingredient), csvField(r.name), csvField(r.reason)].join(","));
  return `${lines.join("\n")}\n`;
}
