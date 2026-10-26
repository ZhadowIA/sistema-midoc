//! Vigilancia de las actualizaciones del CNIS en el DOF (paso 33, etapa 6).
//! Lectura pura de paginas del DOF (sin red): check.ts las descarga.
//!
//! El Consejo de Salubridad General actualiza el compendio con acuerdos en el
//! DOF ("Acuerdo por el que se actualiza el Compendio Nacional de Insumos para
//! la Salud..."), con altas, modificaciones y bajas de claves que mezclan
//! medicamentos con otros insumos. No se aplican solos: se registran aqui y una
//! persona los aplica con `correcciones.csv` y `bajas.csv`.

export interface DofNote {
  codigo: string;
  /** dd/mm/aaaa, como lo publica el DOF. */
  fecha: string;
  title: string;
}

export type UpdateStatus = "pendiente" | "aplicada" | "no aplica";

export interface CnisUpdate {
  /** aaaa-mm-dd. */
  date: string;
  codigo: string;
  title: string;
  url: string;
  /** Claves de medicamento (grupos 010 a 040) que menciona el acuerdo. */
  medicineKeys: string[];
  status: UpdateStatus;
  /** Quien la aplico o decidio que no aplica, y como. */
  reviewedBy: string | null;
  notes: string;
}

export interface UpdatesState {
  /** Edicion base del compendio (la del PDF). */
  edition: string;
  /** Ultimo dia del DOF ya revisado (aaaa-mm-dd). */
  checkedThrough: string;
  updates: CnisUpdate[];
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  nbsp: " ",
  aacute: "á",
  eacute: "é",
  iacute: "í",
  oacute: "ó",
  uacute: "ú",
  Aacute: "Á",
  Eacute: "É",
  Iacute: "Í",
  Oacute: "Ó",
  Uacute: "Ú",
  ntilde: "ñ",
  Ntilde: "Ñ",
  uuml: "ü",
  Uuml: "Ü"
};

/** Texto plano de un fragmento HTML. */
export function htmlText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&([a-zA-Z]+);/g, (whole, name: string) => ENTITIES[name] ?? whole)
    .replace(/\s+/g, " ")
    .trim();
}

/** Notas de un indice diario del DOF (`index.php?year=...`). */
export function parseDayIndex(html: string): DofNote[] {
  const notes: DofNote[] = [];
  const link = /<a\s+href="\/?nota_detalle\.php\?codigo=(\d+)&(?:amp;)?fecha=(\d{2}\/\d{2}\/\d{4})"[^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(link)) {
    const title = htmlText(match[3]);
    if (title && !notes.some((n) => n.codigo === match[1])) notes.push({ codigo: match[1], fecha: match[2], title });
  }
  return notes;
}

/** Otras ediciones del mismo dia (vespertina, extraordinaria) a revisar tambien. */
export function otherEditions(html: string): string[] {
  return [...new Set([...html.matchAll(/edicion=([A-Z]{3})/g)].map((m) => m[1]))].filter((e) => e !== "MAT");
}

/** El acuerdo es una actualizacion del compendio. */
export function isCnisUpdate(note: DofNote): boolean {
  return /compendio nacional de insumos/i.test(note.title.normalize("NFD").replace(/[̀-ͯ]/g, ""));
}

/** Claves de medicamento (010, 020, 030, 040) que menciona un acuerdo. */
export function medicineKeys(noteHtml: string): string[] {
  return [...new Set(htmlText(noteHtml).match(/\b0[1-4]0\.000\.\d{4}\.\d{2}\b/g) ?? [])].sort();
}

/** "19/08/2026" -> "2026-08-19". */
export function isoDate(dof: string): string {
  const [d, m, y] = dof.split("/");
  return `${y}-${m}-${d}`;
}

/** Dias desde el siguiente a `after` hasta `through`, inclusive (aaaa-mm-dd). */
export function daysBetween(after: string, through: string): string[] {
  const days: string[] = [];
  const day = new Date(`${after}T00:00:00Z`);
  const end = new Date(`${through}T00:00:00Z`);
  for (day.setUTCDate(day.getUTCDate() + 1); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
    days.push(day.toISOString().slice(0, 10));
  }
  return days;
}

/** Agrega las actualizaciones nuevas (por codigo) sin tocar las ya registradas. */
export function mergeUpdates(state: UpdatesState, found: CnisUpdate[], checkedThrough: string): UpdatesState {
  const known = new Set(state.updates.map((u) => u.codigo));
  const fresh = found.filter((u) => {
    // La misma nota puede aparecer en dos ediciones del dia.
    if (known.has(u.codigo)) return false;
    known.add(u.codigo);
    return true;
  });
  const updates = [...state.updates, ...fresh].sort(
    (a, b) => a.date.localeCompare(b.date) || a.codigo.localeCompare(b.codigo)
  );
  return {
    ...state,
    checkedThrough: checkedThrough > state.checkedThrough ? checkedThrough : state.checkedThrough,
    updates
  };
}

export function pendingUpdates(state: UpdatesState): CnisUpdate[] {
  return state.updates.filter((u) => u.status === "pendiente");
}

/** Valida el archivo de estado: una actualizacion cerrada dice quien la reviso. */
export function validateState(state: UpdatesState): UpdatesState {
  for (const update of state.updates) {
    if (!["pendiente", "aplicada", "no aplica"].includes(update.status)) {
      throw new Error(`actualizaciones.json: estado invalido en ${update.codigo}`);
    }
    if (update.status !== "pendiente" && !update.reviewedBy) {
      throw new Error(`actualizaciones.json: ${update.codigo} esta "${update.status}" sin quien la reviso`);
    }
  }
  return state;
}
