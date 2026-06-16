import {
  coerceDentalPayload,
  coerceGeneralMedicinePayload,
  type ClinicalProfile,
  type DentalPayload,
  type GeneralMedicinePayload
} from "./clinicalProfiles.ts";

export type ScribeSpeaker = "MEDICO" | "PACIENTE";
export type ScribeConfidence = "high" | "medium" | "low";

export interface ConsultationTurn {
  id: string;
  speaker: ScribeSpeaker;
  text: string;
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

function nextSpeaker(speaker: ScribeSpeaker): ScribeSpeaker {
  return speaker === "MEDICO" ? "PACIENTE" : "MEDICO";
}

export function transcriptToTurns(transcript: string): ConsultationTurn[] {
  const turns: ConsultationTurn[] = [];
  let fallbackSpeaker: ScribeSpeaker = "MEDICO";

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

function speakerLabel(speaker: ScribeSpeaker): string {
  return speaker === "MEDICO" ? "Medico" : "Paciente";
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
