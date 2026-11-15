//! Lectura pura del Compendio Nacional de Insumos para la Salud (CNIS) a la
//! tabla que empaqueta la app (paso 33, etapa 1). Sin red ni archivos: la
//! descarga, la extraccion del PDF y la comparacion con la tabla anterior viven
//! en build.ts.
//!
//! El CNIS solo se publica como PDF. `pdftotext -layout` lo deja en columnas
//! (Descripcion | Indicaciones | Via y dosis) que se enciman de forma irregular,
//! asi que la lectura es conservadora: lo que no se puede atribuir sin
//! ambiguedad queda incompleto y la app no lo codifica. Lo que el lector no
//! alcanza se completa a mano en `correcciones.csv`, revisado por una persona.

export interface CnisEntry {
  /** Clave completa, p. ej. 010.000.0104.00. */
  clave: string;
  /** Producto: la clave sin el envase, p. ej. 010.000.0104. */
  product: string;
  /** Nombre generico en minusculas y sin acentos (una fila por alternativa). */
  generic: string;
  /** El mismo nombre como lo escribe el compendio, con acentos ("Ácido acetilsalicílico"). */
  genericDisplay: string;
  /** Forma farmaceutica en minusculas y sin acentos ("tableta", "solucion inyectable"). */
  form: string;
  /** Concentracion de este generico, en unidad canonica (mg, mcg, UI, mL, %). */
  strengthValue: string;
  strengthUnit: string;
  /** Unidades del envase ("Envase con 20 tabletas" -> 20); null si no se pudo atribuir. */
  packageQty: number | null;
  /** Claves (envases) que tiene el producto en todo el documento. */
  packages: number;
  /** Generico, forma y concentracion leidos y verificados. */
  complete: boolean;
  /** "pdf" o "correccion" (escrita a mano en correcciones.csv). */
  source: "pdf" | "correccion";
}

/** Grupos de medicamentos del compendio: 010 medicamentos, 020 vacunas y biologicos, 030 nutricion, 040 psicotropicos y estupefacientes. */
const GROUPS = "0[1-4]0";
const CLAVE = new RegExp(`^\\s{0,3}(${GROUPS}\\.000\\.\\d{4}\\.\\d{2})(?:\\s+(.*))?$`);
const ANY_CLAVE = new RegExp(`\\b${GROUPS}\\.000\\.\\d{4}\\.\\d{2}\\b`, "g");
const UPPER = /^[A-ZÁÉÍÓÚÑÜ ,()/.-]+$/;
const FORM = /^[A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ0-9 ,()/.%-]+$/;
const NUM = String.raw`(?<!\d)(\d{1,3}(?: \d{3})+|\d+(?:[.,]\d+)?)`;
const UNIT = String.raw`(mg|g|µg|μg|mcg|UI|U|mL|ml|%|mEq|mmol)`;
const STRENGTH = new RegExp(`${NUM}\\s*${UNIT}(?![A-Za-z])`, "gi");
const STRENGTH_ONLY = new RegExp(`^${NUM}\\s*${UNIT}\\.?$`, "i");
const CADA = /^Cada\b.*?contienen?:?\s*(.*)$/;
const ENVASE = /^(?:Envase|Caja) con (\d+|una?)\b/i;

/** Minusculas sin acentos, espacios simples. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** "1 000" -> "1000", "0.500" -> "0.5", "2,5" -> "2.5". */
function canonicalNumber(raw: string): number {
  return Number(raw.replace(/ /g, "").replace(",", "."));
}

/** Concentracion en unidad canonica: g -> mg, µg -> mcg, U -> UI, ml -> mL. */
export function canonicalStrength(rawValue: string, rawUnit: string): { value: string; unit: string } {
  let value = canonicalNumber(rawValue);
  let unit = rawUnit;
  switch (rawUnit.toLowerCase()) {
    case "g":
      value *= 1000;
      unit = "mg";
      break;
    case "mg":
      unit = "mg";
      break;
    case "µg":
    case "μg":
    case "mcg":
      unit = "mcg";
      break;
    case "ui":
    case "u":
      unit = "UI";
      break;
    case "ml":
      unit = "mL";
      break;
    case "meq":
      unit = "mEq";
      break;
    case "mmol":
      unit = "mmol";
      break;
  }
  // Redondeo para no arrastrar 0.30000000000000004 de la conversion.
  return { value: String(Number(value.toFixed(6))), unit };
}

/** Trozos de una linea: las columnas van separadas por 2+ espacios. */
function chunks(line: string): string[] {
  return line.trim() ? line.trim().split(/\s{2,}/) : [];
}

/** Primer trozo de la columna Descripcion. */
function descriptionChunk(line: string): string {
  let parts = chunks(line);
  if (parts.length === 0) return "";
  if (parts[0] === "Clave" && parts.length > 1) parts = parts.slice(1);
  // "TABLETA     DE          LIBERACIÓN": la forma justificada se parte en trozos.
  if (FORM.test(parts[0])) {
    let end = 1;
    while (end < parts.length && FORM.test(parts[end])) end += 1;
    if (end > 1) parts = [parts.slice(0, end).join(" "), ...parts.slice(end)];
  }
  // "Levetiracetam              1 000 mg." trae la concentracion en otro trozo.
  if (parts.length > 1 && STRENGTH_ONLY.test(parts[1])) return `${parts[0]} ${parts[1]}`;
  return parts[0];
}

function isHeader(line: string): boolean {
  return line.includes("Descripci") && line.includes("Indicaciones");
}

/**
 * Nombre generico de una linea a columna 0, sin las notas entre parentesis
 * ("AMOXICILINA (Acceso)", "PARACETAMOL (continúa)"). null si no lo parece.
 */
export function genericName(raw: string): string | null {
  const name = raw.trim().replace(/(\s*\([^)]*\))+\s*$/, "").trim();
  return name.length > 2 && UPPER.test(name) && /[A-Z]/.test(name) ? name : null;
}

/** Alternativas de un mismo producto: "PANTOPRAZOL O RABEPRAZOL U OMEPRAZOL". */
export function alternatives(generic: string): string[] {
  return displayAlternatives(generic).map(normalize);
}

/** "ÁCIDO ACETILSALICÍLICO" -> "Ácido acetilsalicílico". */
export function displayName(raw: string): string {
  const lower = raw.trim().replace(/\s+/g, " ").toLocaleLowerCase("es-MX");
  return lower.charAt(0).toLocaleUpperCase("es-MX") + lower.slice(1);
}

/** "ISOSORBIDA, DINITRATO DE" -> "DINITRATO DE ISOSORBIDA": el compendio invierte algunas sales. */
export function uninvert(generic: string): string {
  const m = /^([^,]+),\s*(.+\s(?:DE|DEL|de|del))$/.exec(generic.trim());
  return m ? `${m[2]} ${m[1]}` : generic;
}

/** Alternativas con su escritura original, en formato de oracion. */
export function displayAlternatives(generic: string): string[] {
  return uninvert(generic)
    // "FACTOR IX Ó NONACOG ALFA": el compendio a veces acentua la conjuncion.
    .split(/\s+[OoÓóUu]\s+/)
    .map((g) => g.trim())
    .filter(Boolean)
    .map(displayName);
}

/** Combinaciones y nombres compuestos: no se codifican en esta version. */
export function isSingleIngredient(generic: string): boolean {
  return !/[/,+]/.test(generic) && !/\b(y|compuesta|compuesto)\b/.test(normalize(generic));
}

function packageQty(chunk: string): number | null {
  const m = ENVASE.exec(chunk);
  if (!m) return null;
  return /^\d+$/.test(m[1]) ? Number(m[1]) : 1;
}

interface RawEntry {
  clave: string;
  generic: string;
  form: string | null;
  content: string;
  block: number;
  packageQty: number | null;
}

/** Recorre el texto del PDF y devuelve cada aparicion de clave con lo leido antes de ella. */
function readEntries(lines: string[]): RawEntry[] {
  const entries: RawEntry[] = [];
  const envasesByBlock = new Map<number, (number | null)[]>();
  let generic: string | null = null;
  let form: string | null = null;
  let formOpen = false;
  let content: string[] = [];
  let reading: "cada" | "content" | null = null;
  let block = 0;
  // Columna donde empieza "Indicaciones" en el ultimo encabezado: un trozo que
  // empieza ahi o mas a la derecha no es de la descripcion.
  let indicationsCol = 0;

  // "010.000.2127.00  SUSPENSIÓN ORAL": a veces la clave va en la linea de la
  // forma y su descripcion viene despues; se registra al terminar el bloque.
  let pending: string | null = null;
  const flush = () => {
    if (pending && generic) {
      entries.push({ clave: pending, generic, form, content: content.join(" "), block, packageQty: null });
    }
    pending = null;
  };

  const reset = (name: string) => {
    flush();
    generic = name;
    form = null;
    formOpen = false;
    content = [];
    reading = null;
    block += 1;
  };
  const noteEnvase = (chunk: string) => {
    if (!ENVASE.test(chunk)) return;
    envasesByBlock.set(block, [...(envasesByBlock.get(block) ?? []), packageQty(chunk)]);
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const stripped = line.trim();
    if (!stripped || line.includes("DIARIO OFICIAL")) continue;

    // Encabezado de tabla; a veces el generico va en la misma linea.
    if (isHeader(line)) {
      indicationsCol = line.indexOf("Indicaciones");
      const before = genericName(line.slice(0, line.indexOf("Descripci")));
      if (before && before !== "CLAVE") reset(before);
      continue;
    }
    // Generico a columna 0 (a veces con "Via de administracion" a la derecha),
    // seguido del encabezado en las lineas siguientes.
    if (!line.startsWith(" ") && !CLAVE.test(line)) {
      const name = genericName(chunks(line)[0] ?? "");
      const header = lines
        .slice(i + 1, i + 8)
        .filter((l) => l.trim())
        .slice(0, 3)
        .find(isHeader);
      if (name && header && ["", "Clave"].includes(header.slice(0, header.indexOf("Descripci")).trim())) {
        reset(name);
        continue;
      }
    }

    const clave = CLAVE.exec(line);
    if (clave && generic) {
      flush();
      const chunk = descriptionChunk(clave[2] ?? "");
      if (FORM.test(chunk) && chunk.length > 2) {
        block += 1;
        form = chunk;
        formOpen = true;
        content = [];
        reading = null;
        pending = clave[1];
        continue;
      }
      if (ENVASE.test(chunk)) noteEnvase(chunk);
      else if (reading === "content" && chunk) content.push(chunk);
      entries.push({ clave: clave[1], generic, form, content: content.join(" "), block, packageQty: null });
      formOpen = false;
      if (reading !== "content") reading = null;
      continue;
    }
    // Texto a columna 0 (generalidades, efectos, interacciones): fin de la tabla.
    if (!line.startsWith(" ")) {
      flush();
      reading = null;
      formOpen = false;
      content = [];
      continue;
    }

    const indent = line.length - line.trimStart().length;
    if (indicationsCol > 0 && indent >= indicationsCol - 3) continue;
    const chunk = descriptionChunk(line);
    if (!chunk) continue;
    if (FORM.test(chunk) && chunk.length > 2) {
      if (!formOpen) flush();
      block += 1;
      // "TABLETA SOLUBLE O" + "EFERVESCENTE" es una sola forma en dos lineas.
      if (formOpen && form) {
        form = `${form} ${chunk}`;
      } else {
        form = chunk;
        content = [];
      }
      formOpen = true;
      reading = null;
      continue;
    }
    formOpen = false;
    if (ENVASE.test(chunk)) {
      noteEnvase(chunk);
      continue;
    }
    if (chunk.startsWith("Cada ")) {
      block += 1;
      content = [];
      const cada = CADA.exec(chunk);
      if (cada) {
        reading = "content";
        if (cada[1]) content.push(cada[1]);
      } else {
        reading = "cada";
      }
      continue;
    }
    if (reading === "cada") {
      const cont = /^.*?contienen?:?\s*(.*)$/.exec(chunk);
      if (cont && chunk.includes("contiene")) {
        reading = "content";
        if (cont[1]) content.push(cont[1]);
      }
      continue;
    }
    if (reading === "content") content.push(chunk);
  }
  flush();

  // Envases de un bloque: si hay tantos "Envase con N" como claves, van en orden.
  const keysByBlock = new Map<number, RawEntry[]>();
  for (const e of entries) keysByBlock.set(e.block, [...(keysByBlock.get(e.block) ?? []), e]);
  for (const [b, keys] of keysByBlock) {
    const envases = envasesByBlock.get(b) ?? [];
    if (envases.length === keys.length) keys.forEach((e, k) => (e.packageQty = envases[k]));
  }
  return entries;
}

/** Concentracion de un generico: la primera que aparece despues de su nombre. */
function strengthAfter(name: string, content: string): { value: string; unit: string } | null {
  const folded = normalize(content);
  const word = name.split(/[\s/]/)[0];
  const at = folded.indexOf(word);
  if (!word || at < 0) return null;
  const all = [...folded.matchAll(STRENGTH)];
  const after = all.find((match) => (match.index ?? 0) > at);
  if (after) return canonicalStrength(after[1], after[2]);
  // "... equivalente a 5 mg de amlodipino.": el nombre va despues de la cifra.
  // Solo vale si el contenido trae una sola concentracion.
  const distinct = new Set(all.map((m) => JSON.stringify(canonicalStrength(m[1], m[2]))));
  return distinct.size === 1 ? canonicalStrength(all[0][1], all[0][2]) : null;
}

const signature = (e: CnisEntry) => [e.form, e.strengthValue, e.strengthUnit].join("|");

/**
 * Convierte el texto de `pdftotext -layout` del CNIS en entradas, una por clave
 * y generico (los productos con alternativas dan una fila por alternativa).
 * Reglas de seguridad (mejor sin codigo que con uno equivocado):
 *  - Si un bloque de descripcion tiene claves de productos distintos, no se
 *    sabe a cual corresponde el texto: esas claves quedan incompletas.
 *  - El generico debe aparecer en la linea "Cada ... contiene", para descartar
 *    atribuciones al generico anterior por un encabezado mal leido.
 *  - Una clave que aparece varias veces en el documento con lecturas distintas
 *    queda incompleta.
 *  - Las combinaciones quedan incompletas.
 */
export function parseCnisText(text: string): CnisEntry[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const raw = readEntries(lines);

  const productsByBlock = new Map<number, Set<string>>();
  for (const e of raw) {
    const set = productsByBlock.get(e.block) ?? new Set<string>();
    set.add(e.clave.slice(0, 12));
    productsByBlock.set(e.block, set);
  }

  const readings = new Map<string, CnisEntry[]>();
  for (const e of raw) {
    const unambiguous = (productsByBlock.get(e.block)?.size ?? 0) === 1;
    const single = isSingleIngredient(uninvert(e.generic));
    for (const display of displayAlternatives(e.generic)) {
      const name = normalize(display);
      const strength = strengthAfter(name, e.content);
      const verified = normalize(e.content).includes(name.split(/[\s/]/)[0]);
      const entry: CnisEntry = {
        clave: e.clave,
        product: e.clave.slice(0, 12),
        generic: name,
        genericDisplay: display,
        form: e.form ? normalize(e.form).replace(/[.\s]+$/, "") : "",
        strengthValue: strength?.value ?? "",
        strengthUnit: strength?.unit ?? "",
        packageQty: e.packageQty,
        packages: 0,
        complete: verified && unambiguous && single && Boolean(e.form) && Boolean(strength),
        source: "pdf"
      };
      const key = `${e.clave}|${name}`;
      readings.set(key, [...(readings.get(key) ?? []), entry]);
    }
  }

  const result: CnisEntry[] = [];
  for (const list of readings.values()) {
    const complete = list.filter((e) => e.complete);
    const signatures = new Set(complete.map(signature));
    const quantities = new Set(list.map((e) => e.packageQty).filter((q) => q !== null));
    const chosen = complete[0] ?? list[0];
    // Una lectura completa contradicha por otra lectura completa no se usa; el
    // envase solo vale si todas las lecturas que lo traen coinciden.
    result.push({
      ...chosen,
      packageQty: quantities.size === 1 ? [...quantities][0] : null,
      complete: signatures.size === 1
    });
  }

  // Los envases de un mismo producto son la misma presentacion: un envase
  // ilegible toma la lectura de sus hermanos si todos los completos coinciden.
  const byProduct = new Map<string, CnisEntry[]>();
  for (const e of result) {
    const key = `${e.product}|${e.generic}`;
    byProduct.set(key, [...(byProduct.get(key) ?? []), e]);
  }
  for (const siblings of byProduct.values()) {
    const complete = siblings.filter((e) => e.complete);
    if (complete.length === 0 || new Set(complete.map(signature)).size !== 1) continue;
    const model = complete[0];
    for (const e of siblings) {
      if (e.complete) continue;
      if (e.strengthValue && (e.strengthValue !== model.strengthValue || e.strengthUnit !== model.strengthUnit)) continue;
      Object.assign(e, { form: model.form, strengthValue: model.strengthValue, strengthUnit: model.strengthUnit, complete: true });
    }
  }

  // Envases por producto, contando TODAS las claves del documento (tambien las
  // que no se pudieron leer): con mas de un envase la app no sabe cual elegir
  // si la receta no dice la cantidad.
  setPackages(result, text.match(ANY_CLAVE) ?? []);
  return sortEntries(result);
}

function setPackages(entries: CnisEntry[], allKeys: Iterable<string>): void {
  const packages = new Map<string, Set<string>>();
  for (const key of [...allKeys, ...entries.map((e) => e.clave)]) {
    const product = key.slice(0, 12);
    packages.set(product, (packages.get(product) ?? new Set()).add(key));
  }
  for (const e of entries) e.packages = packages.get(e.product)?.size ?? 1;
}

function sortEntries(entries: CnisEntry[]): CnisEntry[] {
  return entries.sort((a, b) => a.clave.localeCompare(b.clave) || a.generic.localeCompare(b.generic));
}

/* ---------- Correcciones escritas a mano ---------- */

export interface Correction {
  clave: string;
  generic: string;
  genericDisplay: string;
  form: string;
  strengthValue: string;
  strengthUnit: string;
  packageQty: number | null;
  reason: string;
  reviewedBy: string;
}

const CORRECTION_HEADER = "clave,generic,form,strength_value,strength_unit,package_qty,motivo,revisado_por";

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

/**
 * Lee `correcciones.csv`. Cada correccion debe decir por que y quien la reviso:
 * sin revisor no entra (una correccion sin revisar es una lectura mas, no una
 * verdad).
 */
export function parseCorrections(csv: string): Correction[] {
  const lines = csv.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim() && !l.startsWith("#"));
  if (lines.length === 0) return [];
  if (lines[0].trim() !== CORRECTION_HEADER) throw new Error(`correcciones.csv: encabezado esperado "${CORRECTION_HEADER}"`);
  return lines.slice(1).map((line, k) => {
    const f = csvSplit(line);
    const where = `correcciones.csv, fila ${k + 2}`;
    if (f.length !== 8) throw new Error(`${where}: se esperaban 8 columnas`);
    const [clave, generic, form, strengthValue, strengthUnit, qty, reason, reviewedBy] = f;
    if (!new RegExp(`^${GROUPS}\\.000\\.\\d{4}\\.\\d{2}$`).test(clave)) throw new Error(`${where}: clave invalida`);
    if (!generic || !form || !strengthValue || !strengthUnit) throw new Error(`${where}: faltan datos`);
    if (!reason || !reviewedBy) throw new Error(`${where}: falta el motivo o quien la reviso`);
    const strength = canonicalStrength(strengthValue, strengthUnit);
    return {
      clave,
      generic: normalize(generic),
      genericDisplay: displayName(generic),
      form: normalize(form),
      strengthValue: strength.value,
      strengthUnit: strength.unit,
      packageQty: qty ? Number(qty) : null,
      reason,
      reviewedBy
    };
  });
}

/** Aplica las correcciones: reemplazan la lectura del PDF de esa clave y generico, o la agregan. */
export function applyCorrections(entries: CnisEntry[], corrections: Correction[], allKeys: Iterable<string>): CnisEntry[] {
  const byKey = new Map(entries.map((e) => [`${e.clave}|${e.generic}`, e]));
  for (const c of corrections) {
    byKey.set(`${c.clave}|${c.generic}`, {
      clave: c.clave,
      product: c.clave.slice(0, 12),
      generic: c.generic,
      genericDisplay: c.genericDisplay,
      form: c.form,
      strengthValue: c.strengthValue,
      strengthUnit: c.strengthUnit,
      packageQty: c.packageQty,
      packages: 0,
      complete: true,
      source: "correccion"
    });
  }
  const result = [...byKey.values()];
  setPackages(result, allKeys);
  return sortEntries(result);
}

/** Todas las claves de medicamento que menciona el documento. */
export function allKeys(text: string): string[] {
  return text.match(ANY_CLAVE) ?? [];
}

/* ---------- Tabla y comparacion ---------- */

const CSV_HEADER = "clave,product,generic,form,strength_value,strength_unit,package_qty,packages,complete,source,generic_display";

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(entries: CnisEntry[]): string {
  const lines = [CSV_HEADER];
  for (const e of entries) {
    lines.push(
      [
        e.clave,
        e.product,
        csvField(e.generic),
        csvField(e.form),
        e.strengthValue,
        e.strengthUnit,
        e.packageQty ?? "",
        String(e.packages),
        e.complete ? "1" : "0",
        e.source,
        csvField(e.genericDisplay)
      ].join(",")
    );
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Diferencias entre la tabla anterior y la nueva, por clave y generico, para
 * revisar una edicion nueva antes de aceptarla. Compara las filas tal cual.
 */
export function diffTables(previousCsv: string, nextCsv: string): { added: string[]; removed: string[]; changed: string[] } {
  const rows = (csv: string) => {
    const map = new Map<string, string>();
    for (const line of csv.replace(/\r\n/g, "\n").split("\n").slice(1)) {
      if (!line.trim()) continue;
      const f = csvSplit(line);
      map.set(`${f[0]} ${f[2]}`, line);
    }
    return map;
  };
  const before = rows(previousCsv);
  const after = rows(nextCsv);
  const added = [...after.keys()].filter((k) => !before.has(k));
  const removed = [...before.keys()].filter((k) => !after.has(k));
  const changed = [...after.keys()].filter((k) => before.has(k) && before.get(k) !== after.get(k));
  return { added, removed, changed };
}
