/**
 * Receta con doble denominacion (paso 33, etapa 4): lo que la app agrega a lo
 * que escribio el medico. Modulo puro para `node --test`; el analisis lo hace
 * Rust (`analyze_prescription` y `prescription_items` del expediente).
 */

export interface PrescriptionItem {
  /** La linea tal como la escribio el medico. */
  line: string;
  /** Marca reconocida (nucleo curado o del medico). */
  brand: string | null;
  /** Principios activos ("Paracetamol + Cafeína"). */
  generic: string;
  /** Los mismos, como ids del catalogo de ingredientes. */
  ingredient_ids: string[];
  /** Denominacion del CNIS cuando hay clave ("Paracetamol 500 mg tableta"). */
  cnis_description: string | null;
  cnis_product: string | null;
  cnis_clave: string | null;
  cnis_version: string | null;
}

/** Agrega algo a lo escrito: una marca traducida o una clave del CNIS. */
export function addsInformation(item: PrescriptionItem): boolean {
  return item.brand !== null || item.cnis_product !== null;
}

/**
 * "Fictimed → Paracetamol 500 mg tableta · CNIS 010.000.0104.00". La clave
 * completa cuando no hay duda del envase; si no, la del producto.
 */
export function genericLine(item: PrescriptionItem): string {
  const name = item.cnis_description ?? item.generic;
  const key = item.cnis_clave ?? item.cnis_product;
  const body = item.brand ? `${item.brand} → ${name}` : name;
  return key ? `${body} · CNIS ${key}` : body;
}

/** Texto del bloque "Denominación genérica" del PDF; vacio si no agrega nada. */
export function genericBlockText(items: PrescriptionItem[] | undefined): string {
  return (items ?? []).filter(addsInformation).map(genericLine).join("\n");
}
