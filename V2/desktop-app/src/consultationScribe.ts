import {
  coerceDentalPayload,
  coerceGeneralMedicinePayload,
  type ClinicalProfile,
  type DentalPayload,
  type GeneralMedicinePayload
} from "./clinicalProfiles.ts";

// Ruta B (F4): la diarizacion en nube puede identificar hasta 4 roles.
// ACOMPANANTE/OTRO solo llegan via DiarizedReview (nunca por la heuristica
// local de transcriptToTurns, que solo alterna MEDICO/PACIENTE).
export type ScribeSpeaker = "MEDICO" | "PACIENTE" | "ACOMPANANTE" | "OTRO";
export type ScribeConfidence = "high" | "medium" | "low";

export interface ConsultationTurn {
  id: string;
  speaker: ScribeSpeaker;
  text: string;
  speakerId?: string;
}

// Turno de diarizacion LOCAL (sherpa-onnx, hasta el rediseno de "seleccion de
// hablantes"): distinto de `DiarizedTurn` mas abajo, que es de la diarizacion
// EN NUBE (Ruta B, F4) y usa segundos/roles pendientes de confirmar.
export interface LocalDiarizedTurn {
  id: string;
  speakerId: string;
  role: ScribeSpeaker;
  text: string;
  startCs: number;
  endCs: number;
}

export interface TemplateSegment {
  id: string;
  label: string;
  target: string;
  instructions: string;
  required: boolean;
}

export interface TemplateDefinition {
  id: string;
  segments: TemplateSegment[];
}

export interface SegmentDraft {
  segment_id: string;
  content: string;
  confidence: ScribeConfidence;
  source_turns: string[];
  warnings: string[];
}

export interface SourceTurnReference {
  id: string;
  label: string;
  text: string;
  missing: boolean;
}

export interface ScribeNoteContent {
  subjective: string;
  objective: string;
  assessment: string;
  diagnosis: string;
  plan: string;
  instructions: string;
  specialty: GeneralMedicinePayload | DentalPayload;
}

const SPEAKER_PREFIX = /^(medico|m[eé]dico|doctor|dra?\.?|paciente)\s*:\s*/i;

function normalizeSpeaker(raw: string | undefined, fallback: ScribeSpeaker): ScribeSpeaker {
  if (!raw) return fallback;
  return /^paciente$/i.test(raw.trim()) ? "PACIENTE" : "MEDICO";
}

// Solo alterna Medico<->Paciente; Acompanante/Otro (Ruta B, F4) se dejan
// intactos para no corromper esos turnos al alternar o intercambiar roles.
function nextSpeaker(speaker: ScribeSpeaker): ScribeSpeaker {
  if (speaker === "MEDICO") return "PACIENTE";
  if (speaker === "PACIENTE") return "MEDICO";
  return speaker;
}

export function transcriptToTurns(transcript: string | null | undefined): ConsultationTurn[] {
  const turns: ConsultationTurn[] = [];
  let fallbackSpeaker: ScribeSpeaker = "MEDICO";

  // Guarda defensiva: un borrador sin texto (o malformado) no debe tumbar la
  // pantalla de consulta; simplemente no genera turnos.
  if (!transcript) return turns;

  for (const rawLine of transcript.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = line.match(SPEAKER_PREFIX);
    const speaker = match
      ? normalizeSpeaker(match[1], fallbackSpeaker)
      : fallbackSpeaker;
    const text = (match ? line.slice(match[0].length) : line).trim();
    if (!text) continue;

    turns.push({
      id: `turn-${turns.length + 1}`,
      speaker,
      text
    });
    fallbackSpeaker = nextSpeaker(speaker);
  }

  return turns;
}

// --- Diarizacion en nube (Ruta B, F4) --------------------------------------
// El portal (OpenAI) devuelve hablantes ANONIMOS (speaker_0, speaker_1). MiDoc
// no presume que la primera voz sea el medico: los presenta como "Hablante N"
// con rol UNASSIGNED y el medico confirma el rol localmente antes de acomodar.

export type DiarizedSpeakerRole =
  | "UNASSIGNED"
  | "MEDICO"
  | "PACIENTE"
  | "ACOMPANANTE"
  | "OTRO";

export interface DiarizedSegment {
  speaker: string;
  startSeconds: number;
  endSeconds: number;
  text: string;
}

export interface DiarizedSpeaker {
  id: string;
  label: string;
  role: DiarizedSpeakerRole;
}

export interface DiarizedTurn {
  id: string;
  speakerId: string;
  speakerRole: DiarizedSpeakerRole;
  startSeconds: number;
  endSeconds: number;
  text: string;
}

export interface DiarizedReview {
  speakers: DiarizedSpeaker[];
  turns: DiarizedTurn[];
}

/// Agrupa los segmentos del portal por etiqueta de hablante (en orden de
/// aparicion) y los presenta como "Hablante N" sin asumir roles. Los turnos
/// conservan el orden y el tiempo; el rol arranca en UNASSIGNED.
export function diarizedSegmentsToTurns(segments: DiarizedSegment[]): DiarizedReview {
  const order: string[] = [];
  const seen = new Set<string>();
  for (const segment of segments) {
    if (!seen.has(segment.speaker)) {
      seen.add(segment.speaker);
      order.push(segment.speaker);
    }
  }

  const speakers: DiarizedSpeaker[] = order.map((id, index) => ({
    id,
    label: `Hablante ${index + 1}`,
    role: "UNASSIGNED"
  }));

  const turns: DiarizedTurn[] = segments.map((segment, index) => ({
    id: `turn-${index + 1}`,
    speakerId: segment.speaker,
    speakerRole: "UNASSIGNED",
    startSeconds: segment.startSeconds,
    endSeconds: segment.endSeconds,
    text: segment.text
  }));

  return { speakers, turns };
}

/// Asigna (inmutablemente) un rol a un hablante y lo propaga a sus turnos.
export function assignDiarizedRole(
  review: DiarizedReview,
  speakerId: string,
  role: DiarizedSpeakerRole
): DiarizedReview {
  return {
    speakers: review.speakers.map((speaker) =>
      speaker.id === speakerId ? { ...speaker, role } : speaker
    ),
    turns: review.turns.map((turn) =>
      turn.speakerId === speakerId ? { ...turn, speakerRole: role } : turn
    )
  };
}

/// Gate previo al acomodo en plantilla: todo hablante que aporta texto debe
/// tener un rol asignado. Un hablante sin turnos con texto no bloquea; una
/// revision sin texto tampoco esta lista (nada que acomodar).
export function diarizedRolesResolved(review: DiarizedReview): boolean {
  const usedSpeakerIds = new Set(
    review.turns.filter((turn) => turn.text.trim() !== "").map((turn) => turn.speakerId)
  );
  if (usedSpeakerIds.size === 0) return false;
  return review.speakers
    .filter((speaker) => usedSpeakerIds.has(speaker.id))
    .every((speaker) => speaker.role !== "UNASSIGNED");
}

/// Convierte una revision de diarizacion en nube YA resuelta (todo hablante con
/// texto tiene rol asignado) al formato compartido `ConsultationTurn` que usa el
/// resto de la canalizacion (guardado, estructuracion SOAP, ayuda clinica). Los
/// 4 roles se preservan (no colapsan a MEDICO/PACIENTE); los turnos sin texto se
/// descartan, igual que hace `diarizedRolesResolved` al evaluar el gate.
export function diarizedReviewToConsultationTurns(review: DiarizedReview): ConsultationTurn[] {
  return review.turns
    .filter((turn) => turn.text.trim() !== "" && turn.speakerRole !== "UNASSIGNED")
    .map((turn) => ({
      id: turn.id,
      speaker: turn.speakerRole as ScribeSpeaker,
      text: turn.text
    }));
}

// --- Diarizacion LOCAL: seleccion/reasignacion de hablantes -----------------
// sherpa-onnx tampoco asume que la primera voz es el medico; a diferencia de
// la nube, el motor local solo separa 2 voces (Medico/Paciente por defecto,
// el acompanante se corrige a mano en el selector de turno).

/// Convierte los turnos crudos de diarizacion local (con `speakerId`) al
/// formato compartido `ConsultationTurn`, descartando los turnos sin texto.
export function diarizedTurnsToConsultationTurns(turns: LocalDiarizedTurn[]): ConsultationTurn[] {
  return turns
    .map((turn) => ({
      id: turn.id,
      speaker: turn.role,
      speakerId: turn.speakerId,
      text: turn.text.trim()
    }))
    .filter((turn) => turn.text);
}

export function assignRoleToSpeaker(
  turns: ConsultationTurn[],
  speakerId: string,
  speaker: ScribeSpeaker
): ConsultationTurn[] {
  return turns.map((turn) =>
    turn.speakerId === speakerId
      ? {
          ...turn,
          speaker
        }
      : turn
  );
}

export function swapTwoSpeakerRoles(turns: ConsultationTurn[]): ConsultationTurn[] {
  const speakerIds = Array.from(
    new Set(turns.map((turn) => turn.speakerId).filter((id): id is string => Boolean(id)))
  );

  if (speakerIds.length !== 2) {
    return turns.map((turn) => ({
      ...turn,
      speaker: nextSpeaker(turn.speaker)
    }));
  }

  const currentRoleBySpeakerId = new Map<string, ScribeSpeaker>();
  for (const turn of turns) {
    if (turn.speakerId && !currentRoleBySpeakerId.has(turn.speakerId)) {
      currentRoleBySpeakerId.set(turn.speakerId, turn.speaker);
    }
  }

  return turns.map((turn) => ({
    ...turn,
    speaker: turn.speakerId
      ? nextSpeaker(currentRoleBySpeakerId.get(turn.speakerId) ?? turn.speaker)
      : nextSpeaker(turn.speaker)
  }));
}

function speakerLabel(speaker: ScribeSpeaker): string {
  switch (speaker) {
    case "MEDICO":
      return "Medico";
    case "PACIENTE":
      return "Paciente";
    case "ACOMPANANTE":
      return "Acompanante";
    default:
      return "Otro";
  }
}

export function formatSourceTurnReferences(
  turns: ConsultationTurn[],
  sourceTurnIds: string[]
): SourceTurnReference[] {
  const byId = new Map(turns.map((turn) => [turn.id, turn]));
  return sourceTurnIds.map((id) => {
    const turn = byId.get(id);
    if (!turn) {
      return {
        id,
        label: `Fuente no encontrada · ${id}`,
        text: "",
        missing: true
      };
    }

    return {
      id,
      label: `${speakerLabel(turn.speaker)} · ${turn.id}`,
      text: turn.text,
      missing: false
    };
  });
}

export function buildTemplateSegments(profile: ClinicalProfile): TemplateDefinition {
  const soapSegments: TemplateSegment[] = [
    {
      id: "subjective",
      label: "S - Subjetivo",
      target: "subjective",
      instructions: "Resume lo que refiere el paciente sin inventar hechos.",
      required: true
    },
    {
      id: "objective",
      label: "O - Objetivo",
      target: "objective",
      instructions: "Extrae hallazgos de exploracion fisica o signos vitales mencionados.",
      required: true
    },
    {
      id: "assessment",
      label: "A - Analisis",
      target: "assessment",
      instructions: "Ordena la impresion clinica mencionada o deja claro si no fue mencionada.",
      required: true
    },
    {
      id: "diagnosis",
      label: "Diagnostico",
      target: "diagnosis",
      instructions: "Incluye diagnosticos explicitamente mencionados por el medico.",
      required: false
    },
    {
      id: "plan",
      label: "P - Plan",
      target: "plan",
      instructions: "Extrae tratamientos, estudios, seguimiento y decisiones acordadas.",
      required: true
    },
    {
      id: "instructions",
      label: "Indicaciones",
      target: "instructions",
      instructions: "Redacta indicaciones comprensibles para el paciente a partir de lo dicho.",
      required: false
    }
  ];

  if (profile === "ODONTOLOGY") {
    return {
      id: "soap-odontology",
      segments: [
        ...soapSegments,
        {
          id: "dental_hygiene_plan",
          label: "Plan de higiene",
          target: "specialty.hygienePlan",
          instructions: "Extrae solo indicaciones textuales de higiene dental.",
          required: false
        },
        {
          id: "dental_next_revision",
          label: "Proxima revision",
          target: "specialty.nextRevision",
          instructions: "Extrae fecha o intervalo de proxima revision si fue mencionado.",
          required: false
        }
      ]
    };
  }

  return {
    id: "soap-general",
    segments: [
      ...soapSegments,
      {
        id: "general_risk_factors",
        label: "Factores de riesgo",
        target: "specialty.riskFactors",
        instructions: "Extrae factores de riesgo y antecedentes relevantes mencionados.",
        required: false
      },
      {
        id: "general_review_systems",
        label: "Revision por sistemas",
        target: "specialty.reviewOfSystems",
        instructions: "Agrupa sintomas por sistemas si aparecen en la conversacion.",
        required: false
      },
      {
        id: "general_physical_exam",
        label: "Exploracion fisica",
        target: "specialty.physicalExam",
        instructions: "Extrae hallazgos de exploracion fisica para la plantilla general.",
        required: false
      },
      {
        id: "general_labs",
        label: "Laboratorios y estudios",
        target: "specialty.labs",
        instructions: "Lista estudios solicitados o revisados.",
        required: false
      },
      {
        id: "general_screenings",
        label: "Tamizajes",
        target: "specialty.screenings",
        instructions: "Extrae tamizajes preventivos mencionados.",
        required: false
      },
      {
        id: "general_preventive_plan",
        label: "Plan preventivo",
        target: "specialty.preventivePlan",
        instructions: "Extrae vacunacion, cambios de habitos o prevencion indicada.",
        required: false
      },
      {
        id: "general_follow_up",
        label: "Seguimiento",
        target: "specialty.followUp",
        instructions: "Extrae el seguimiento o proxima cita.",
        required: false
      }
    ]
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeTargetSet(profile: ClinicalProfile): Set<string> {
  return new Set(buildTemplateSegments(profile).segments.map((segment) => segment.target));
}

export function normalizeTemplateDefinition(
  value: unknown,
  profile: ClinicalProfile
): TemplateDefinition {
  const fallback = buildTemplateSegments(profile);
  if (!isRecord(value)) return fallback;

  const id = cleanText(value.id) || fallback.id;
  const rawSegments = Array.isArray(value.segments) ? value.segments : [];
  const allowedTargets = safeTargetSet(profile);
  const seen = new Set<string>();
  const segments: TemplateSegment[] = [];

  for (const rawSegment of rawSegments) {
    if (!isRecord(rawSegment)) continue;

    const segment: TemplateSegment = {
      id: cleanText(rawSegment.id),
      label: cleanText(rawSegment.label),
      target: cleanText(rawSegment.target),
      instructions: cleanText(rawSegment.instructions),
      required: rawSegment.required === true
    };

    if (!segment.id || !segment.label || !segment.target) continue;
    if (seen.has(segment.id) || !allowedTargets.has(segment.target)) continue;

    seen.add(segment.id);
    segments.push(segment);
  }

  return {
    id,
    segments: segments.length > 0 ? segments : fallback.segments
  };
}

function appendText(current: string, next: string): string {
  const text = next.trim();
  if (!text) return current;
  const previous = current.trim();
  return previous ? `${previous}\n\n${text}` : text;
}

export function appendSegmentToNote<T extends ScribeNoteContent>(
  note: T,
  segment: SegmentDraft,
  template?: TemplateDefinition
): T {
  const target = buildTargetIndex(note, template).get(segment.segment_id);
  if (!target) return note;

  if (!target.startsWith("specialty.")) {
    return {
      ...note,
      [target]: appendText(String(note[target as keyof ScribeNoteContent] ?? ""), segment.content)
    };
  }

  const specialtyKey = target.slice("specialty.".length);
  const specialty =
    "odontogram" in note.specialty
      ? coerceDentalPayload(note.specialty)
      : coerceGeneralMedicinePayload(note.specialty);

  return {
    ...note,
    specialty: {
      ...specialty,
      [specialtyKey]: appendText(String(specialty[specialtyKey as keyof typeof specialty] ?? ""), segment.content)
    }
  };
}

function buildTargetIndex(note: ScribeNoteContent, template?: TemplateDefinition): Map<string, string> {
  const profile: ClinicalProfile = "odontogram" in note.specialty ? "ODONTOLOGY" : "GENERAL_MEDICINE";
  const definition = template ?? buildTemplateSegments(profile);
  return new Map(
    normalizeTemplateDefinition(definition, profile).segments.map((segment) => [segment.id, segment.target])
  );
}
