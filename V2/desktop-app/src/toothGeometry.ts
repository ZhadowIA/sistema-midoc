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

export interface OcclusalFossa {
  x: number;
  y: number;
  radius: number;
}

export interface OcclusalAnatomy {
  /** Cresta marginal interior que da volumen sin alterar la zona clicable. */
  marginalRidge: string;
  /** Relieves principales que bajan desde cúspides o borde incisal. */
  cuspRidges: readonly string[];
  /** Surcos de desarrollo propios de cada tipo de pieza. */
  grooves: readonly string[];
  /** Fosas o fosetas representadas como puntos anatómicos discretos. */
  fossae: readonly OcclusalFossa[];
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
    "M20 3 C27 2.5 34 5.5 36.5 11 C38 14.5 37.2 17 37.5 20 C37.2 23 38 25.5 36.5 29 C34 34.5 27 37.5 20 37 C13 37.5 6 34.5 3.5 29 C2 25.5 2.8 23 2.5 20 C2.8 17 2 14.5 3.5 11 C6 5.5 13 2.5 20 3 Z",
  PREMOLAR:
    "M20 3.5 C27 3.5 32.5 10 32.5 20 C32.5 30 27 36.5 20 36.5 C13 36.5 7.5 30 7.5 20 C7.5 10 13 3.5 20 3.5 Z",
  CANINE:
    "M20 3 C25.5 5.5 32 11 33.5 17 C35 23.5 30 30.5 20 37 C10 30.5 5 23.5 6.5 17 C8 11 14.5 5.5 20 3 Z",
  INCISOR:
    "M20 10 C28.5 9.5 34 12.5 35.5 17 C37 21.5 33 26.5 27 29 C22 31 13 30.5 8 27.5 C3.5 24.5 3.5 17.5 7.5 14 C10.5 11 15 10.5 20 10 Z"
};

// Cuatro plantillas oclusales/incisales propias de MiDoc. Esta capa es solo
// anatomía visual: las cinco superficies clicables siguen siendo las regiones
// generadas por crownRegionPaths.
export const OCCLUSAL_ANATOMY: Record<ToothType, OcclusalAnatomy> = {
  MOLAR: {
    marginalRidge:
      "M20 6 C27 5.5 32.5 8 34 13 C35 16 34.5 18 34.8 20 C34.5 22 35 24 34 27 C32.5 32 27 34.5 20 34 C13 34.5 7.5 32 6 27 C5 24 5.5 22 5.2 20 C5.5 18 5 16 6 13 C7.5 8 13 5.5 20 6 Z",
    cuspRidges: [
      "M8.5 10.5 Q13.5 15.5 18.5 19",
      "M31.5 10.5 Q26.5 15.5 21.5 19",
      "M8.5 29.5 Q13.5 24.5 18.5 21",
      "M31.5 29.5 Q26.5 24.5 21.5 21"
    ],
    grooves: [
      "M12 20 C15 18.5 17.5 18.7 20 20 C22.5 21.3 25 21.5 28 20",
      "M20 20 C18.5 17 17 14.5 17 11",
      "M20 20 C21.5 23 23 25.5 23 29"
    ],
    fossae: [
      { x: 20, y: 20, radius: 1.15 },
      { x: 12.5, y: 20, radius: 0.72 },
      { x: 27.5, y: 20, radius: 0.72 }
    ]
  },
  PREMOLAR: {
    marginalRidge:
      "M20 7 C25.5 7 29.5 12 29.5 20 C29.5 28 25.5 33 20 33 C14.5 33 10.5 28 10.5 20 C10.5 12 14.5 7 20 7 Z",
    cuspRidges: [
      "M20 7.5 C18.5 12 17 16 16 20 M20 7.5 C21.5 12 23 16 24 20",
      "M20 32.5 C18.5 28 17 24 16 20 M20 32.5 C21.5 28 23 24 24 20"
    ],
    grooves: [
      "M13.5 20 C16.5 18.7 23.5 21.3 26.5 20",
      "M13.5 20 Q12.5 18.5 12 17",
      "M26.5 20 Q27.5 21.5 28 23"
    ],
    fossae: [
      { x: 15.2, y: 20, radius: 0.78 },
      { x: 24.8, y: 20, radius: 0.78 }
    ]
  },
  CANINE: {
    marginalRidge:
      "M20 7 C25 9.5 29.5 14 30 19 C30.5 24.5 26 29.5 20 33 C14 29.5 9.5 24.5 10 19 C10.5 14 15 9.5 20 7 Z",
    cuspRidges: [
      "M20 7.5 Q17.5 14 20 20",
      "M20 7.5 Q22.5 14 20 20",
      "M20 20 Q18 26 20 32"
    ],
    grooves: [
      "M11.5 21.5 Q15.5 18.5 20 20 Q24.5 18.5 28.5 21.5",
      "M14 25 Q20 22 26 25"
    ],
    fossae: [{ x: 20, y: 23.2, radius: 0.9 }]
  },
  INCISOR: {
    marginalRidge:
      "M9 15.5 C14 13 25.5 13 31 15.5 C34 18 33 22.5 29.5 25 C25 28 15 27.5 10.5 25 C7 22.5 6 18 9 15.5 Z",
    cuspRidges: [
      "M9.5 17.5 C15 16 25 16 31 17.5",
      "M14 17 Q14.5 20 13 22.5",
      "M26 17 Q25.5 20 27 22.5"
    ],
    grooves: [
      "M11.5 21 C16 19 24 19 28.5 21",
      "M13.5 24 Q20 27.5 26.5 24"
    ],
    fossae: [{ x: 20, y: 22.8, radius: 0.82 }]
  }
};

// Raices sugeridas (zona de 40x16, apice arriba; se espeja en inferiores).
export const ROOT_PATHS: Record<"SINGLE" | "DOUBLE", string> = {
  SINGLE: "M13.5 16 C13.5 6 16.5 1.5 20 1.5 C23.5 1.5 26.5 6 26.5 16 Z",
  DOUBLE:
    "M8 16 C8 7 10 2 13 2 C16 2 17.5 8 17.5 16 Z M22.5 16 C22.5 8 24 2 27 2 C30 2 32 7 32 16 Z"
};

/* ---------- Vista facial (doble vista, idea 3) ---------- */

// Corona vista desde vestibular, en la caja y14..~35 (cervical arriba, borde
// oclusal/incisal abajo; la raiz de ROOT_PATHS ocupa y0..16 encima). Para
// inferiores el grupo facial completo se espeja verticalmente.
// Formas: incisivo en abanico con borde recto, canino terminado en punta,
// premolar con dos cuspides, molar mas ancho con dos cuspides marcadas.
export const FACIAL_CROWN_PATHS: Record<ToothType, string> = {
  MOLAR:
    "M11 14 H29 C33 21 32.5 29 29 32.5 C26 35.5 23 32.5 20 33 C17 32.5 14 35.5 11 32.5 C7.5 29 7 21 11 14 Z",
  PREMOLAR:
    "M13 14 H27 C30 21 29 29 26 32.5 C23.5 35 21.5 32.5 20 32.5 C18.5 32.5 16.5 35 14 32.5 C11 29 10 21 13 14 Z",
  CANINE: "M14 14 H26 C30 21 29 27 20 35 C11 27 10 21 14 14 Z",
  INCISOR: "M14 14 H26 C30 21 31 29 30 34 L10 34 C9 29 10 21 14 14 Z"
};

// Adornos de la vista facial para estados de pieza completa.
// Conducto obturado (endodoncia): relleno dentro de la raiz, apice arriba.
export const FACIAL_CANAL_PATH = "M18.6 14 L20 3.5 L21.4 14 Z";
// Implante: cuerpo roscado que sustituye a la raiz natural.
export const FACIAL_IMPLANT_BODY = "M15.5 14 L20 2.5 L24.5 14 Z";
export const FACIAL_IMPLANT_THREADS = "M15.8 11 H24.2 M16.6 8 H23.4 M17.6 5.5 H22.4";
