import type { SurfaceSlot, ToothType } from "./odontogramModel.ts";

// Geometria anatomica del glifo dental (espacio 40x40 de la corona).
//
// Las 5 zonas clicables dejan de ser trapecios genericos: la zona central es
// la tabla oclusal (o borde incisal) propia de cada tipo de pieza, y las 4
// zonas perifericas se DERIVAN de esa tabla compartiendo exactamente los
// mismos puntos de anclaje y curvas de borde, de modo que el teselado es
// perfecto por construccion (sin huecos ni traslapes). La silueta de la
// corona sigue recortando todo con clipPath, asi que las zonas perifericas
// pueden desbordar la caja sin problema.

type Pt = readonly [number, number];

interface CrownGeometry {
  /** Esquinas de la tabla central: tl, tr, br, bl. */
  table: { tl: Pt; tr: Pt; br: Pt; bl: Pt };
  /** Punto de control cuadratico de cada borde de la tabla. */
  ctrl: { top: Pt; right: Pt; bottom: Pt; left: Pt };
}

// Tabla oclusal por tipo: molar amplia y lobulada, premolar oval, canino un
// rombo pequeño (cresta), incisivo una banda incisal delgada y ancha.
const CROWN_GEOMETRY: Record<ToothType, CrownGeometry> = {
  MOLAR: {
    table: { tl: [13, 14], tr: [27, 14], br: [27, 26], bl: [13, 26] },
    ctrl: { top: [20, 11.5], right: [29.5, 20], bottom: [20, 28.5], left: [10.5, 20] }
  },
  PREMOLAR: {
    table: { tl: [15, 14], tr: [25, 14], br: [25, 26], bl: [15, 26] },
    ctrl: { top: [20, 12.5], right: [27, 20], bottom: [20, 27.5], left: [13, 20] }
  },
  CANINE: {
    table: { tl: [16.5, 15], tr: [23.5, 15], br: [23.5, 25], bl: [16.5, 25] },
    ctrl: { top: [20, 12], right: [26, 20], bottom: [20, 28], left: [14, 20] }
  },
  INCISOR: {
    table: { tl: [9, 17], tr: [31, 17], br: [31, 23], bl: [9, 23] },
    ctrl: { top: [20, 15], right: [33, 20], bottom: [20, 25], left: [7, 20] }
  }
};

function pt(point: Pt): string {
  return `${point[0]} ${point[1]}`;
}

// Genera los 5 paths por tipo. Cada borde de la tabla aparece identico en la
// region central y en su vecina periferica (mismos extremos y mismo control),
// que es lo que garantiza el teselado.
export function crownRegionPaths(type: ToothType): Record<SurfaceSlot, string> {
  const { table, ctrl } = CROWN_GEOMETRY[type];
  return {
    center:
      `M${pt(table.tl)} Q${pt(ctrl.top)} ${pt(table.tr)} Q${pt(ctrl.right)} ${pt(table.br)}` +
      ` Q${pt(ctrl.bottom)} ${pt(table.bl)} Q${pt(ctrl.left)} ${pt(table.tl)} Z`,
    top: `M0 0 H40 L${pt(table.tr)} Q${pt(ctrl.top)} ${pt(table.tl)} Z`,
    right: `M40 0 V40 L${pt(table.br)} Q${pt(ctrl.right)} ${pt(table.tr)} Z`,
    bottom: `M40 40 H0 L${pt(table.bl)} Q${pt(ctrl.bottom)} ${pt(table.br)} Z`,
    left: `M0 40 V0 L${pt(table.tl)} Q${pt(ctrl.left)} ${pt(table.bl)} Z`
  };
}

// Silueta de la corona vista desde oclusal/incisal, por tipo.
export const CROWN_PATHS: Record<ToothType, string> = {
  MOLAR:
    "M20 3 C30 3 36 7 37 15 C37.7 18.3 37.7 21.7 37 25 C36 33 30 37 20 37 C10 37 4 33 3 25 C2.3 21.7 2.3 18.3 3 15 C4 7 10 3 20 3 Z",
  PREMOLAR:
    "M20 4 C28 4 32.5 10 32.5 20 C32.5 30 28 36 20 36 C12 36 7.5 30 7.5 20 C7.5 10 12 4 20 4 Z",
  CANINE:
    "M20 3 C28 7 33.5 13 33.5 20 C33.5 27 28 33 20 37 C12 33 6.5 27 6.5 20 C6.5 13 12 7 20 3 Z",
  INCISOR:
    "M20 10 C29 10 35 14 35 20 C35 26 29 30 20 30 C11 30 5 26 5 20 C5 14 11 10 20 10 Z"
};

// Fisuras/cresta de la cara oclusal, decorativas (sin eventos), alineadas a
// la tabla central de cada tipo.
export const GROOVE_PATHS: Record<ToothType, string> = {
  MOLAR: "M14 15 C17.5 17.5 17.5 22.5 14 25 M26 15 C22.5 17.5 22.5 22.5 26 25 M16 20 H24",
  PREMOLAR: "M16 20 H24",
  CANINE: "M20 16 V24",
  INCISOR: "M11 20 H29"
};

// Raices sugeridas (zona de 40x16, apice arriba; se espeja en inferiores).
export const ROOT_PATHS: Record<"SINGLE" | "DOUBLE", string> = {
  SINGLE: "M13.5 16 C13.5 6 16.5 1.5 20 1.5 C23.5 1.5 26.5 6 26.5 16 Z",
  DOUBLE:
    "M8 16 C8 7 10 2 13 2 C16 2 17.5 8 17.5 16 Z M22.5 16 C22.5 8 24 2 27 2 C30 2 32 7 32 16 Z"
};
