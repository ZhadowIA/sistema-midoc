import {
  DENTAL_TOOTH_IDS,
  SURFACE_STATUS_OPTIONS,
  TOOTH_STATUS_OPTIONS,
  type DentalToothRecord,
  type SurfaceStatus,
  type ToothFace,
  type ToothStatus
} from "./clinicalProfiles.ts";

// Denticion temporal (FDI): cuadrantes 5-8, cinco piezas por cuadrante.
export const PRIMARY_TOOTH_IDS = [
  "55", "54", "53", "52", "51",
  "61", "62", "63", "64", "65",
  "85", "84", "83", "82", "81",
  "71", "72", "73", "74", "75"
] as const;

export type Dentition = "PERMANENT" | "PRIMARY" | "MIXED";

export const DENTITION_OPTIONS: Array<{ value: Dentition; label: string }> = [
  { value: "PERMANENT", label: "Adulta" },
  { value: "MIXED", label: "Mixta" },
  { value: "PRIMARY", label: "Infantil" }
];

export interface OdontogramRow {
  id: string;
  label: string;
  teeth: readonly string[];
  arch: "UPPER" | "LOWER";
}

const PERMANENT_UPPER = DENTAL_TOOTH_IDS.slice(0, 16);
const PERMANENT_LOWER = DENTAL_TOOTH_IDS.slice(16);
const PRIMARY_UPPER = PRIMARY_TOOTH_IDS.slice(0, 10);
const PRIMARY_LOWER = PRIMARY_TOOTH_IDS.slice(10);

export function archRowsForDentition(dentition: Dentition): OdontogramRow[] {
  if (dentition === "PERMANENT") {
    return [
      { id: "upper-permanent", label: "Arcada superior", teeth: PERMANENT_UPPER, arch: "UPPER" },
      { id: "lower-permanent", label: "Arcada inferior", teeth: PERMANENT_LOWER, arch: "LOWER" }
    ];
  }
  if (dentition === "PRIMARY") {
    return [
      { id: "upper-primary", label: "Arcada superior (temporal)", teeth: PRIMARY_UPPER, arch: "UPPER" },
      { id: "lower-primary", label: "Arcada inferior (temporal)", teeth: PRIMARY_LOWER, arch: "LOWER" }
    ];
  }
  // Mixta: filas temporales al centro, como en la boca (las temporales estan entre las arcadas).
  return [
    { id: "upper-permanent", label: "Arcada superior", teeth: PERMANENT_UPPER, arch: "UPPER" },
    { id: "upper-primary", label: "Superior temporal", teeth: PRIMARY_UPPER, arch: "UPPER" },
    { id: "lower-primary", label: "Inferior temporal", teeth: PRIMARY_LOWER, arch: "LOWER" },
    { id: "lower-permanent", label: "Arcada inferior", teeth: PERMANENT_LOWER, arch: "LOWER" }
  ];
}

export type SurfaceSlot = "top" | "bottom" | "left" | "right" | "center";

const UPPER_QUADRANTS = new Set(["1", "2", "5", "6"]);
// Cuadrantes del lado derecho del paciente: se dibujan a la izquierda del espectador
// y su cara mesial (hacia la linea media) queda a la derecha del glifo.
const PATIENT_RIGHT_QUADRANTS = new Set(["1", "4", "5", "8"]);

export function isUpperTooth(toothId: string): boolean {
  return UPPER_QUADRANTS.has(toothId[0] ?? "");
}

// Posicion de cada cara en el glifo, respetando la orientacion clinica del
// odontograma: vestibular hacia afuera de la boca y mesial hacia la linea media.
export function surfaceSlots(toothId: string): Record<ToothFace, SurfaceSlot> {
  const upper = isUpperTooth(toothId);
  const mesialRight = PATIENT_RIGHT_QUADRANTS.has(toothId[0] ?? "");
  return {
    O: "center",
    V: upper ? "top" : "bottom",
    L: upper ? "bottom" : "top",
    M: mesialRight ? "right" : "left",
    D: mesialRight ? "left" : "right"
  };
}

// Ciclo rapido al hacer clic en una superficie, en el orden del catalogo:
// Sano -> Caries -> Restaurado -> Sellador -> Fractura -> Sano.
export function cycleSurfaceStatus(current: SurfaceStatus | undefined): SurfaceStatus {
  const order = SURFACE_STATUS_OPTIONS.map((option) => option.value);
  const index = order.indexOf(current ?? "HEALTHY");
  return order[(index + 1) % order.length];
}

export function toothStatusClass(status: ToothStatus): string {
  return `tooth-status-${status.toLowerCase().replace(/_/g, "-")}`;
}

export function surfaceStatusClass(status: SurfaceStatus | undefined): string {
  return `surface-status-${(status ?? "HEALTHY").toLowerCase()}`;
}

// Marca de pieza completa sobre el glifo (notacion clasica de odontograma).
export type ToothMarker = "cross" | "slash" | "circle" | "triangle" | "post" | null;

export function toothMarker(status: ToothStatus): ToothMarker {
  switch (status) {
    case "MISSING":
      return "cross";
    case "EXTRACTION_INDICATED":
      return "slash";
    case "CROWN":
      return "circle";
    case "ROOT_CANAL":
      return "triangle";
    case "IMPLANT":
      return "post";
    default:
      return null;
  }
}

export function hasFindings(record: DentalToothRecord | undefined): boolean {
  if (!record) {
    return false;
  }
  if (record.status !== "HEALTHY" || record.notes.trim() !== "") {
    return true;
  }
  return Object.values(record.surfaces).some((status) => status !== undefined && status !== "HEALTHY");
}

const PRIMARY_ID_SET = new Set<string>(PRIMARY_TOOTH_IDS);
const PERMANENT_ID_SET = new Set<string>(DENTAL_TOOTH_IDS);

// Denticion inicial sugerida a partir de lo ya registrado, para que un
// expediente pediatrico abra mostrando sus piezas sin pasos extra.
export function inferDentition(odontogram: Record<string, DentalToothRecord>): Dentition {
  let primary = false;
  let permanent = false;
  for (const [toothId, record] of Object.entries(odontogram)) {
    if (!hasFindings(record)) {
      continue;
    }
    if (PRIMARY_ID_SET.has(toothId)) {
      primary = true;
    } else if (PERMANENT_ID_SET.has(toothId)) {
      permanent = true;
    }
  }
  if (primary && permanent) {
    return "MIXED";
  }
  if (primary) {
    return "PRIMARY";
  }
  return "PERMANENT";
}

function statusLabel(status: ToothStatus): string {
  return TOOTH_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

function surfaceLabel(status: SurfaceStatus): string {
  return SURFACE_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

// Resumen corto para tooltip / aria-label del glifo.
export function describeTooth(toothId: string, record: DentalToothRecord | undefined): string {
  if (!record || !hasFindings(record)) {
    return `Pieza ${toothId}: sana`;
  }
  const parts: string[] = record.status === "HEALTHY" ? [] : [statusLabel(record.status)];
  const surfaces = Object.entries(record.surfaces)
    .filter(([, status]) => status !== undefined && status !== "HEALTHY")
    .map(([face, status]) => `${face} ${surfaceLabel(status as SurfaceStatus).toLowerCase()}`);
  if (surfaces.length > 0) {
    parts.push(surfaces.join(", "));
  }
  return `Pieza ${toothId}: ${parts.join(" — ")}`;
}
