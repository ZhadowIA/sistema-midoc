import {
  DENTAL_TOOTH_IDS,
  getDefaultDentalToothRecord,
  getDefaultPeriodontogramRecord,
  RESTORATION_MATERIAL_OPTIONS,
  SURFACE_STATUS_OPTIONS,
  TOOTH_STATUS_OPTIONS,
  type DentalPayload,
  type RestorationMaterial,
  type SurfaceStatus,
  type ToothFace,
  type ToothStatus
} from "./clinicalProfiles.ts";
import { PRIMARY_TOOTH_IDS } from "./odontogramModel.ts";

// Dictado manos-libres al odontograma/periodontograma (paso 26 rebanada 5a).
//
// Parser DETERMINISTA: convierte la transcripcion en espanol del dictado del
// dentista ("18 caries oclusal, 17 amalgama, 16 ausente", "16 bolsas 3 2 3
// 4 3 4") en propuestas de marcas que el dentista revisa y aplica en lote.
// Sin IA: la transcripcion puede venir de Whisper local (paso 15) o teclearse;
// la interpretacion es una gramatica fija y auditable. Toda propuesta pasa por
// confirmacion humana antes de tocar el payload (regla del paso 11).

export type DictationProposal =
  | { kind: "TOOTH_STATUS"; toothId: string; status: ToothStatus; source: string }
  | {
      kind: "SURFACE_STATUS";
      toothId: string;
      faces: ToothFace[];
      status: SurfaceStatus;
      material?: RestorationMaterial;
      source: string;
    }
  | {
      kind: "POCKET_DEPTHS";
      toothId: string;
      depths: [number, number, number, number, number, number];
      source: string;
    }
  | { kind: "MOBILITY"; toothId: string; value: 0 | 1 | 2 | 3; source: string }
  | { kind: "FURCATION"; toothId: string; value: 0 | 1 | 2 | 3; source: string }
  | { kind: "UNRECOGNIZED"; source: string };

const VALID_TOOTH_IDS = new Set<string>([...DENTAL_TOOTH_IDS, ...PRIMARY_TOOTH_IDS]);

/* ---------- Normalizacion ---------- */

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Numeros dictados con palabra: "dieciocho", "veintiuno", "treinta y uno"...
const UNIT_WORDS: Record<string, number> = {
  uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8
};
const TEEN_WORDS: Record<string, number> = {
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
  dieciseis: 16, diecisiete: 17, dieciocho: 18,
  veintiuno: 21, veintidos: 22, veintitres: 23, veinticuatro: 24,
  veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28
};
const TENS_WORDS: Record<string, number> = {
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80
};
const SMALL_WORDS: Record<string, number> = { cero: 0, ...UNIT_WORDS };

// Reemplaza numeros hablados por digitos: "treinta y uno" -> "31",
// "dieciocho" -> "18", "dos" -> "2" (para bolsas/movilidad).
function replaceSpokenNumbers(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (TEEN_WORDS[token] !== undefined) {
      out.push(String(TEEN_WORDS[token]));
      continue;
    }
    if (TENS_WORDS[token] !== undefined) {
      if (tokens[i + 1] === "y" && UNIT_WORDS[tokens[i + 2]] !== undefined) {
        out.push(String(TENS_WORDS[token] + UNIT_WORDS[tokens[i + 2]]));
        i += 2;
      } else {
        out.push(String(TENS_WORDS[token]));
      }
      continue;
    }
    if (SMALL_WORDS[token] !== undefined) {
      out.push(String(SMALL_WORDS[token]));
      continue;
    }
    out.push(token);
  }
  return out;
}

function tokenize(text: string): string[] {
  const cleaned = stripAccents(text.toLowerCase())
    // Guiones entre digitos son separadores de bolsas ("3-2-3").
    .replace(/(\d)-(?=\d)/g, "$1 ")
    .replace(/[,.;:()!?]/g, " , ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned === "") {
    return [];
  }
  return replaceSpokenNumbers(cleaned.split(" "));
}

/* ---------- Vocabulario clinico ---------- */

const TOOTH_STATUS_WORDS: Record<string, ToothStatus> = {
  ausente: "MISSING",
  falta: "MISSING",
  faltante: "MISSING",
  extraido: "MISSING",
  extraida: "MISSING",
  perdido: "MISSING",
  perdida: "MISSING",
  corona: "CROWN",
  implante: "IMPLANT",
  endodoncia: "ROOT_CANAL",
  conductos: "ROOT_CANAL"
};

// Estados que aplican a superficie; sin superficie dictada caen a la pieza
// completa (CARIES/RESTORED/FRACTURE/HEALTHY existen en ambos catalogos).
const SURFACE_STATUS_WORDS: Record<string, SurfaceStatus> = {
  caries: "CARIES",
  cariada: "CARIES",
  cariado: "CARIES",
  restaurado: "RESTORED",
  restaurada: "RESTORED",
  restauracion: "RESTORED",
  resina: "RESTORED",
  amalgama: "RESTORED",
  ionomero: "RESTORED",
  ceramica: "RESTORED",
  ceramico: "RESTORED",
  porcelana: "RESTORED",
  metal: "RESTORED",
  metalica: "RESTORED",
  metalico: "RESTORED",
  provisional: "RESTORED",
  temporal: "RESTORED",
  obturado: "RESTORED",
  obturada: "RESTORED",
  obturacion: "RESTORED",
  empaste: "RESTORED",
  sellador: "SEALANT",
  sellante: "SEALANT",
  sellado: "SEALANT",
  fractura: "FRACTURE",
  fracturado: "FRACTURE",
  fracturada: "FRACTURE",
  sano: "HEALTHY",
  sana: "HEALTHY"
};

const RESTORATION_MATERIAL_WORDS: Record<string, RestorationMaterial> = {
  resina: "RESIN",
  amalgama: "AMALGAM",
  ionomero: "GLASS_IONOMER",
  ceramica: "CERAMIC",
  ceramico: "CERAMIC",
  porcelana: "CERAMIC",
  metal: "METAL",
  metalica: "METAL",
  metalico: "METAL",
  provisional: "TEMPORARY",
  temporal: "TEMPORARY"
};

const FACE_WORDS: Record<string, ToothFace> = {
  oclusal: "O",
  incisal: "O",
  mesial: "M",
  distal: "D",
  vestibular: "V",
  bucal: "V",
  labial: "V",
  lingual: "L",
  palatina: "L",
  palatino: "L",
  palatal: "L"
};

// Formas combinadas: "mesio-oclusal", "ocluso-distal", "MOD"...
const FACE_PREFIXES: Array<[string, ToothFace]> = [
  ["mesio", "M"],
  ["disto", "D"],
  ["ocluso", "O"],
  ["vestibulo", "V"],
  ["linguo", "L"],
  ["palato", "L"]
];

function facesFromToken(token: string): ToothFace[] | null {
  if (FACE_WORDS[token]) {
    return [FACE_WORDS[token]];
  }
  if (/^[modvl]{2,5}$/.test(token)) {
    // Siglas tipo "mod" (mesio-ocluso-distal), sin repetir caras.
    const faces = [...new Set(token.toUpperCase().split(""))] as ToothFace[];
    return faces;
  }
  // Compuestos: consume prefijos y termina en una cara completa.
  let rest = token.replace(/-/g, "");
  const faces: ToothFace[] = [];
  let advanced = true;
  while (advanced) {
    advanced = false;
    for (const [prefix, face] of FACE_PREFIXES) {
      if (rest.startsWith(prefix) && rest.length > prefix.length) {
        faces.push(face);
        rest = rest.slice(prefix.length);
        advanced = true;
        break;
      }
    }
  }
  if (faces.length > 0 && FACE_WORDS[rest]) {
    faces.push(FACE_WORDS[rest]);
    return [...new Set(faces)];
  }
  return null;
}

const NOISE_WORDS = new Set([
  "pieza", "diente", "el", "la", "en", "con", "de", "del", "y", "e", ",",
  "molar", "premolar", "canino", "incisivo", "superior", "inferior",
  "derecho", "derecha", "izquierdo", "izquierda", "numero", "tiene", "presenta"
]);

/* ---------- Parser ---------- */

interface ToothSegment {
  toothId: string;
  tokens: string[];
  source: string[];
}

// Corta el dictado en segmentos por pieza: cada numero de pieza FDI valido
// abre un segmento y arrastra lo que sigue. Robusto a la falta de comas
// ("18 caries oclusal 17 amalgama"). Los numeros consumidos por "bolsas",
// "movilidad" o "furca" no abren segmento.
function segmentByTooth(tokens: string[]): { segments: ToothSegment[]; leading: string[] } {
  const segments: ToothSegment[] = [];
  const leading: string[] = [];
  let current: ToothSegment | null = null;
  let pendingValues = 0;

  for (const token of tokens) {
    if (pendingValues > 0 && /^\d+$/.test(token)) {
      current?.tokens.push(token);
      current?.source.push(token);
      pendingValues -= 1;
      continue;
    }
    if (token === "bolsas" || token === "bolsa" || token === "sondaje") {
      pendingValues = 6;
    } else if (token === "movilidad" || token === "furca" || token === "furcacion") {
      pendingValues = 1;
    }
    if (/^\d+$/.test(token) && VALID_TOOTH_IDS.has(token) && pendingValues === 0) {
      current = { toothId: token, tokens: [], source: [token] };
      segments.push(current);
      continue;
    }
    if (current) {
      current.tokens.push(token);
      current.source.push(token);
    } else if (token !== ",") {
      leading.push(token);
    }
  }
  return { segments, leading };
}

function clampPerio(value: number): 0 | 1 | 2 | 3 {
  return Math.max(0, Math.min(3, value)) as 0 | 1 | 2 | 3;
}

function parseSegment(segment: ToothSegment): DictationProposal[] {
  const proposals: DictationProposal[] = [];
  const source = segment.source.join(" ").replace(/ ,/g, ",");
  const tokens = segment.tokens;
  // Hallazgo en curso: estado de superficie esperando caras.
  let pendingStatus: SurfaceStatus | null = null;
  let pendingMaterial: RestorationMaterial | undefined;
  let pendingFaces: ToothFace[] = [];
  let recognizedAny = false;

  function flushPending() {
    if (pendingStatus === null) {
      return;
    }
    if (pendingFaces.length > 0) {
      proposals.push({
        kind: "SURFACE_STATUS",
        toothId: segment.toothId,
        faces: pendingFaces,
        status: pendingStatus,
        ...(pendingStatus === "RESTORED" && pendingMaterial ? { material: pendingMaterial } : {}),
        source
      });
    } else {
      // Sin superficie dictada el estado aplica a la pieza completa
      // ("17 amalgama" -> pieza restaurada).
      proposals.push({
        kind: "TOOTH_STATUS",
        toothId: segment.toothId,
        status: pendingStatus as ToothStatus,
        source
      });
    }
    pendingStatus = null;
    pendingMaterial = undefined;
    pendingFaces = [];
  }

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];

    if (token === "bolsas" || token === "bolsa" || token === "sondaje") {
      const values: number[] = [];
      while (values.length < 6 && i + 1 < tokens.length && /^\d+$/.test(tokens[i + 1])) {
        values.push(Number(tokens[i + 1]));
        i += 1;
      }
      if (values.length === 6) {
        recognizedAny = true;
        proposals.push({
          kind: "POCKET_DEPTHS",
          toothId: segment.toothId,
          depths: values as [number, number, number, number, number, number],
          source
        });
      }
      continue;
    }
    if (token === "movilidad" && /^\d+$/.test(tokens[i + 1] ?? "")) {
      recognizedAny = true;
      proposals.push({
        kind: "MOBILITY",
        toothId: segment.toothId,
        value: clampPerio(Number(tokens[i + 1])),
        source
      });
      i += 1;
      continue;
    }
    if ((token === "furca" || token === "furcacion") && /^\d+$/.test(tokens[i + 1] ?? "")) {
      recognizedAny = true;
      proposals.push({
        kind: "FURCATION",
        toothId: segment.toothId,
        value: clampPerio(Number(tokens[i + 1])),
        source
      });
      i += 1;
      continue;
    }

    if (TOOTH_STATUS_WORDS[token]) {
      flushPending();
      recognizedAny = true;
      proposals.push({
        kind: "TOOTH_STATUS",
        toothId: segment.toothId,
        status: TOOTH_STATUS_WORDS[token],
        source
      });
      continue;
    }
    // "extraccion indicada" / "para extraccion" / "indicada la extraccion"
    if (token === "extraccion" || token === "extraer") {
      flushPending();
      recognizedAny = true;
      proposals.push({
        kind: "TOOTH_STATUS",
        toothId: segment.toothId,
        status: "EXTRACTION_INDICATED",
        source
      });
      continue;
    }
    if (SURFACE_STATUS_WORDS[token]) {
      flushPending();
      recognizedAny = true;
      pendingStatus = SURFACE_STATUS_WORDS[token];
      pendingMaterial = RESTORATION_MATERIAL_WORDS[token];
      continue;
    }
    const faces = pendingStatus !== null ? facesFromToken(token) : null;
    if (faces) {
      pendingFaces.push(...faces.filter((face) => !pendingFaces.includes(face)));
      continue;
    }
  }
  flushPending();

  if (!recognizedAny && proposals.length === 0) {
    return [{ kind: "UNRECOGNIZED", source: `${segment.toothId} ${tokens.join(" ")}`.trim() }];
  }
  // "indicada" tras "extraccion" ya quedo cubierta; dedup de estados de pieza
  // identicos consecutivos (p. ej. "extraccion" + "extraer").
  return proposals.filter((proposal, index) => {
    if (proposal.kind !== "TOOTH_STATUS") return true;
    const previous = proposals[index - 1];
    return !(
      previous &&
      previous.kind === "TOOTH_STATUS" &&
      previous.status === proposal.status
    );
  });
}

export function parseDentalDictation(text: string): DictationProposal[] {
  const tokens = tokenize(text);
  if (tokens.length === 0) {
    return [];
  }
  const { segments, leading } = segmentByTooth(tokens);
  const proposals: DictationProposal[] = [];
  const meaningfulLeading = leading.filter((token) => !NOISE_WORDS.has(token));
  if (segments.length === 0) {
    return [{ kind: "UNRECOGNIZED", source: text.trim() }];
  }
  if (meaningfulLeading.length > 0) {
    proposals.push({ kind: "UNRECOGNIZED", source: meaningfulLeading.join(" ") });
  }
  for (const segment of segments) {
    proposals.push(...parseSegment(segment));
  }
  return proposals;
}

/* ---------- Aplicacion en lote ---------- */

export function applyProposals(
  payload: DentalPayload,
  proposals: DictationProposal[]
): DentalPayload {
  let odontogram = payload.odontogram;
  let periodontogram = payload.periodontogram;

  function toothRecord(toothId: string) {
    return odontogram[toothId] ?? getDefaultDentalToothRecord();
  }
  function perioRecord(toothId: string) {
    return periodontogram[toothId] ?? getDefaultPeriodontogramRecord();
  }

  for (const proposal of proposals) {
    switch (proposal.kind) {
      case "TOOTH_STATUS": {
        odontogram = {
          ...odontogram,
          [proposal.toothId]: { ...toothRecord(proposal.toothId), status: proposal.status }
        };
        break;
      }
      case "SURFACE_STATUS": {
        const record = toothRecord(proposal.toothId);
        const surfaces = { ...record.surfaces };
        for (const face of proposal.faces) {
          if (proposal.status === "HEALTHY") {
            delete surfaces[face];
          } else {
            surfaces[face] = proposal.material && proposal.status === "RESTORED"
              ? { condition: proposal.status, material: proposal.material }
              : { condition: proposal.status };
          }
        }
        odontogram = { ...odontogram, [proposal.toothId]: { ...record, surfaces } };
        break;
      }
      case "POCKET_DEPTHS": {
        periodontogram = {
          ...periodontogram,
          [proposal.toothId]: { ...perioRecord(proposal.toothId), pocketDepth: proposal.depths }
        };
        break;
      }
      case "MOBILITY": {
        periodontogram = {
          ...periodontogram,
          [proposal.toothId]: { ...perioRecord(proposal.toothId), mobility: proposal.value }
        };
        break;
      }
      case "FURCATION": {
        periodontogram = {
          ...periodontogram,
          [proposal.toothId]: { ...perioRecord(proposal.toothId), furcation: proposal.value }
        };
        break;
      }
      case "UNRECOGNIZED":
        break;
    }
  }
  return { ...payload, odontogram, periodontogram };
}

/* ---------- Presentacion ---------- */

const FACE_LABELS: Record<ToothFace, string> = {
  O: "oclusal",
  M: "mesial",
  D: "distal",
  V: "vestibular",
  L: "lingual"
};

function toothStatusLabel(status: ToothStatus): string {
  return (
    TOOTH_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status
  ).toLowerCase();
}

function surfaceStatusLabel(status: SurfaceStatus): string {
  return (
    SURFACE_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status
  ).toLowerCase();
}

function restorationMaterialLabel(material: RestorationMaterial): string {
  return (
    RESTORATION_MATERIAL_OPTIONS.find((option) => option.value === material)?.label ?? material
  ).toLowerCase();
}

export function describeProposal(proposal: DictationProposal): string {
  switch (proposal.kind) {
    case "TOOTH_STATUS":
      return `Pieza ${proposal.toothId}: ${toothStatusLabel(proposal.status)}`;
    case "SURFACE_STATUS":
      return `Pieza ${proposal.toothId}: ${surfaceStatusLabel(proposal.status)}${
        proposal.material ? ` de ${restorationMaterialLabel(proposal.material)}` : ""
      } en ${proposal.faces
        .map((face) => FACE_LABELS[face])
        .join(", ")}`;
    case "POCKET_DEPTHS":
      return `Pieza ${proposal.toothId}: bolsas ${proposal.depths.join("-")}`;
    case "MOBILITY":
      return `Pieza ${proposal.toothId}: movilidad ${proposal.value}`;
    case "FURCATION":
      return `Pieza ${proposal.toothId}: furcacion ${proposal.value}`;
    case "UNRECOGNIZED":
      return `Sin interpretar: "${proposal.source}"`;
  }
}
