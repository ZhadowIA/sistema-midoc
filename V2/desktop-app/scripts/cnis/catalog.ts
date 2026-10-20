//! Lectura pura del Compendio Nacional de Insumos para la Salud (CNIS) al CSV
//! que empaqueta la app para codificar medicamentos en el FHIR. Sin red ni
//! archivos: la descarga y la extraccion del PDF viven en build.ts.
//!
//! El CNIS solo se publica como PDF. `pdftotext -layout` lo deja en columnas
//! (Descripcion | Indicaciones | Via y dosis) que se enciman de forma irregular,
//! asi que la lectura es conservadora: lo que no se puede atribuir sin
//! ambiguedad queda incompleto y la app no lo codifica.

export interface CnisEntry {
  /** Clave completa, p. ej. 010.000.0104.00. */
  clave: string;
  /** Producto (XXXX): la clave sin el envase. */
  product: string;
  /** Nombre generico en minusculas y sin acentos. */
  generic: string;
  /** Forma farmaceutica en minusculas y sin acentos ("tableta", "solucion inyectable"). */
  form: string;
  /** Concentracion del primer principio activo, en unidad canonica (mg, mcg, UI, mL, %). */
  strengthValue: string;
  strengthUnit: string;
  /** Claves (envases) que tiene el producto en todo el documento. */
  packages: number;
  /** Generico, forma y concentracion leidos y verificados. */
  complete: boolean;
}

const CLAVE = /^\s{0,3}(010\.000\.(\d{4})\.\d{2})(?:\s+(.*))?$/;
const UPPER = /^[A-ZÁÉÍÓÚÑÜ ,()/.-]+$/;
const FORM = /^[A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ0-9 ,()/.%-]+$/;
const NUM = String.raw`(?<!\d)(\d{1,3}(?: \d{3})+|\d+(?:[.,]\d+)?)`;
const UNIT = String.raw`(mg|g|µg|μg|mcg|UI|U|mL|ml|%|mEq|mmol)`;
const STRENGTH = new RegExp(`${NUM}\\s*${UNIT}(?![A-Za-z])`, "gi");
const STRENGTH_ONLY = new RegExp(`^${NUM}\\s*${UNIT}\\.?$`, "i");
const CADA = /^Cada\b.*?contienen?:?\s*(.*)$/;

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

/** Primer trozo de la columna Descripcion (las columnas van separadas por 2+ espacios). */
function descriptionChunk(line: string): string {
  if (!line.trim()) return "";
  let parts = line.trim().split(/\s{2,}/);
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

/** Combinaciones y nombres compuestos: no se codifican en esta version. */
export function isSingleIngredient(generic: string): boolean {
  return !/[/,+]/.test(generic) && !/\b(y|compuesta|compuesto)\b/.test(normalize(generic));
}

interface RawEntry {
  clave: string;
  product: string;
  generic: string;
  form: string | null;
  content: string;
  block: number;
}

/** Recorre el texto del PDF y devuelve cada aparicion de clave con lo leido antes de ella. */
function readEntries(lines: string[]): RawEntry[] {
  const entries: RawEntry[] = [];
  let generic: string | null = null;
  let form: string | null = null;
  let formOpen = false;
  let content: string[] = [];
  let reading: "cada" | "content" | null = null;
  let block = 0;

  const reset = (name: string) => {
    generic = name;
    form = null;
    formOpen = false;
    content = [];
    reading = null;
    block += 1;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const stripped = line.trim();
    if (!stripped || line.includes("DIARIO OFICIAL")) continue;

    // Encabezado de tabla; a veces el generico va en la misma linea.
    if (isHeader(line)) {
      const before = line.slice(0, line.indexOf("Descripci")).trim();
      if (before && before !== "Clave" && UPPER.test(before)) reset(before);
      continue;
    }
    // Generico en su propia linea, seguido del encabezado.
    if (!line.startsWith(" ") && UPPER.test(stripped) && !CLAVE.test(line)) {
      const next = lines.slice(i + 1, i + 4).find((l) => l.trim()) ?? "";
      if (isHeader(next) && ["", "Clave"].includes(next.slice(0, next.indexOf("Descripci")).trim())) {
        reset(stripped);
        continue;
      }
    }

    const clave = CLAVE.exec(line);
    if (clave && generic) {
      const chunk = descriptionChunk(clave[3] ?? "");
      if (reading === "content" && chunk && !chunk.startsWith("Envase")) content.push(chunk);
      entries.push({
        clave: clave[1],
        product: clave[2],
        generic,
        form,
        content: content.join(" "),
        block
      });
      formOpen = false;
      if (reading !== "content") reading = null;
      continue;
    }
    // Texto a columna 0 (generalidades, efectos, interacciones): fin de la tabla.
    if (!line.startsWith(" ")) {
      reading = null;
      formOpen = false;
      content = [];
      continue;
    }

    const chunk = descriptionChunk(line);
    if (!chunk) continue;
    if (FORM.test(chunk) && chunk.length > 2) {
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
    if (reading === "content" && !chunk.startsWith("Envase") && !/^[a-z]/.test(chunk)) {
      content.push(chunk);
    }
  }
  return entries;
}

/** Concentracion del principio activo: la primera que aparece despues de su nombre. */
function strengthAfterGeneric(generic: string, content: string): { value: string; unit: string } | null {
  const folded = normalize(content);
  const word = normalize(generic).split(/[\s/]/)[0];
  const at = folded.indexOf(word);
  if (!word || at < 0) return null;
  for (const match of folded.matchAll(STRENGTH)) {
    if ((match.index ?? 0) > at) return canonicalStrength(match[1], match[2]);
  }
  return null;
}

/**
 * Convierte el texto de `pdftotext -layout` del CNIS en entradas. Reglas de
 * seguridad (mejor sin codigo que con uno equivocado):
 *  - Si un bloque de descripcion tiene claves de productos distintos, no se
 *    sabe a cual corresponde el texto: esas claves quedan incompletas.
 *  - El nombre generico debe aparecer en la linea "Cada ... contiene", para
 *    descartar atribuciones al generico anterior por un encabezado mal leido.
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
    set.add(e.product);
    productsByBlock.set(e.block, set);
  }

  const readings = new Map<string, CnisEntry[]>();
  for (const e of raw) {
    const strength = strengthAfterGeneric(e.generic, e.content);
    const verified = normalize(e.content).includes(normalize(e.generic).split(/[\s/]/)[0]);
    const unambiguous = (productsByBlock.get(e.block)?.size ?? 0) === 1;
    const entry: CnisEntry = {
      clave: e.clave,
      product: e.product,
      generic: normalize(e.generic),
      form: e.form ? normalize(e.form) : "",
      strengthValue: strength?.value ?? "",
      strengthUnit: strength?.unit ?? "",
      packages: 0,
      complete:
        verified && unambiguous && Boolean(e.form) && Boolean(strength) && isSingleIngredient(e.generic)
    };
    const list = readings.get(e.clave) ?? [];
    list.push(entry);
    readings.set(e.clave, list);
  }

  const result: CnisEntry[] = [];
  for (const list of readings.values()) {
    const signature = (e: CnisEntry) => [e.generic, e.form, e.strengthValue, e.strengthUnit].join("|");
    const complete = list.filter((e) => e.complete);
    const signatures = new Set(complete.map(signature));
    const chosen = complete[0] ?? list[0];
    // Una lectura completa contradicha por otra lectura completa no se usa.
    result.push({ ...chosen, complete: signatures.size === 1 });
  }

  // Los envases de un mismo producto (XXXX) son la misma presentacion: un envase
  // ilegible toma la lectura de sus hermanos si todos los completos coinciden.
  const byProduct = new Map<string, CnisEntry[]>();
  for (const e of result) byProduct.set(e.product, [...(byProduct.get(e.product) ?? []), e]);
  for (const siblings of byProduct.values()) {
    const complete = siblings.filter((e) => e.complete);
    const signature = (e: CnisEntry) => [e.generic, e.form, e.strengthValue, e.strengthUnit].join("|");
    if (complete.length === 0 || new Set(complete.map(signature)).size !== 1) continue;
    const model = complete[0];
    for (const e of siblings) {
      if (e.complete || e.generic !== model.generic) continue;
      if (e.strengthValue && (e.strengthValue !== model.strengthValue || e.strengthUnit !== model.strengthUnit)) continue;
      Object.assign(e, { form: model.form, strengthValue: model.strengthValue, strengthUnit: model.strengthUnit, complete: true });
    }
  }

  // Envases por producto, contando TODAS las claves del documento (tambien las
  // que no se pudieron leer): con mas de un envase la app no sabe cual elegir.
  const allKeys = new Set(text.match(/\b010\.000\.\d{4}\.\d{2}\b/g) ?? []);
  const packages = new Map<string, number>();
  for (const key of allKeys) {
    const product = key.slice(8, 12);
    packages.set(product, (packages.get(product) ?? 0) + 1);
  }
  for (const e of result) e.packages = packages.get(e.product) ?? 1;

  return result.sort((a, b) => a.clave.localeCompare(b.clave));
}

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(entries: CnisEntry[]): string {
  const lines = ["clave,product,generic,form,strength_value,strength_unit,packages,complete"];
  for (const e of entries) {
    lines.push(
      [
        e.clave,
        e.product,
        csvField(e.generic),
        csvField(e.form),
        e.strengthValue,
        e.strengthUnit,
        String(e.packages),
        e.complete ? "1" : "0"
      ].join(",")
    );
  }
  return `${lines.join("\n")}\n`;
}
