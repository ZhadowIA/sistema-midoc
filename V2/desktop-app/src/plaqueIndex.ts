import type { DentalPayload, ToothFace } from "./clinicalProfiles.ts";

// Indice de placa de O'Leary (paso 26 rebanada 2): se marcan las caras con
// placa de cada pieza presente y el porcentaje se calcula solo — nunca se
// captura a mano. Caras evaluadas: mesial, distal, vestibular y lingual (la
// oclusal no participa en el O'Leary clasico).

export const PLAQUE_FACES: ToothFace[] = ["M", "V", "D", "L"];

export function hasPlaque(payload: DentalPayload, toothId: string, face: ToothFace): boolean {
  return (payload.plaque[toothId] ?? []).includes(face);
}

export function togglePlaqueSurface(
  payload: DentalPayload,
  toothId: string,
  face: ToothFace
): DentalPayload {
  const current = payload.plaque[toothId] ?? [];
  const next = current.includes(face)
    ? current.filter((entry) => entry !== face)
    : [...current, face];
  const plaque = { ...payload.plaque };
  if (next.length === 0) {
    delete plaque[toothId];
  } else {
    plaque[toothId] = next;
  }
  return { ...payload, plaque };
}

export interface PlaqueIndexResult {
  /** Caras con placa en piezas presentes. */
  markedSurfaces: number;
  /** Caras evaluables: piezas presentes x 4. */
  presentSurfaces: number;
  /** Porcentaje O'Leary con un decimal, o null si no hay piezas presentes. */
  percent: number | null;
}

export function isToothPresent(payload: DentalPayload, toothId: string): boolean {
  return (payload.odontogram[toothId]?.status ?? "HEALTHY") !== "MISSING";
}

// El denominador excluye piezas ausentes; las marcas de placa sobre una pieza
// que luego se registro como ausente tampoco cuentan en el numerador.
export function computePlaqueIndex(
  payload: DentalPayload,
  teeth: readonly string[]
): PlaqueIndexResult {
  const present = teeth.filter((toothId) => isToothPresent(payload, toothId));
  const presentSurfaces = present.length * PLAQUE_FACES.length;
  const markedSurfaces = present.reduce(
    (sum, toothId) => sum + (payload.plaque[toothId]?.length ?? 0),
    0
  );
  const percent =
    presentSurfaces === 0
      ? null
      : Math.round((markedSurfaces / presentSurfaces) * 1000) / 10;
  return { markedSurfaces, presentSurfaces, percent };
}

// Umbral clasico de O'Leary: el objetivo de higiene es <=10%.
export function plaqueClassification(
  percent: number
): { label: string; tone: "good" | "warn" | "bad" } {
  if (percent <= 10) {
    return { label: "Ideal", tone: "good" };
  }
  if (percent <= 20) {
    return { label: "Aceptable", tone: "warn" };
  }
  return { label: "Deficiente", tone: "bad" };
}
