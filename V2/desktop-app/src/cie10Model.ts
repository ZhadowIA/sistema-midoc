// Lista de diagnosticos CIE-10 de una nota (paso 28, rebanada 2). Puro: la
// validacion definitiva contra el catalogo la hace Rust al guardar.

export interface CodedDiagnosis {
  code: string;
  name: string;
  principal: boolean;
}

export interface Cie10Match {
  code: string;
  display_code: string;
  name: string;
  warnings: string[];
}

export const MAX_CODED_DIAGNOSES = 12;

/** J459 -> J45.9; las categorias de 3 caracteres quedan igual. */
export function displayCode(code: string): string {
  return code.length > 3 ? `${code.slice(0, 3)}.${code.slice(3)}` : code;
}

/** Garantiza exactamente un principal si hay diagnosticos. */
function withSinglePrincipal(list: CodedDiagnosis[]): CodedDiagnosis[] {
  if (list.length === 0) return list;
  const index = Math.max(
    0,
    list.findIndex((d) => d.principal)
  );
  return list.map((d, i) => ({ ...d, principal: i === index }));
}

/** Agrega al final; el primero de la lista es principal. Ignora repetidos. */
export function addDiagnosis(list: CodedDiagnosis[], match: Pick<Cie10Match, "code" | "name">): CodedDiagnosis[] {
  if (list.some((d) => d.code === match.code) || list.length >= MAX_CODED_DIAGNOSES) return list;
  return withSinglePrincipal([...list, { code: match.code, name: match.name, principal: list.length === 0 }]);
}

/** Quita; si era el principal, el siguiente primero toma su lugar. */
export function removeDiagnosis(list: CodedDiagnosis[], code: string): CodedDiagnosis[] {
  return withSinglePrincipal(list.filter((d) => d.code !== code));
}

export function setPrincipal(list: CodedDiagnosis[], code: string): CodedDiagnosis[] {
  return list.map((d) => ({ ...d, principal: d.code === code }));
}

/** Indice siguiente en la lista de resultados con flechas, dando la vuelta. */
export function nextActiveIndex(current: number, total: number, key: "ArrowDown" | "ArrowUp"): number {
  if (total === 0) return -1;
  if (key === "ArrowDown") return current >= total - 1 ? 0 : current + 1;
  return current <= 0 ? total - 1 : current - 1;
}
