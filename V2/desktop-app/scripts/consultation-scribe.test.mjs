import assert from "node:assert/strict";
import {
  appendSegmentToNote,
  buildTemplateSegments,
  normalizeTemplateDefinition,
  transcriptToTurns
} from "../src/consultationScribe.ts";

const turns = transcriptToTurns(
  "Medico: ¿Desde cuando tiene dolor?\nPaciente: Desde hace tres dias.\n¿Ha tomado algo?\nIbuprofeno."
);

assert.deepEqual(
  turns.map((turn) => ({ speaker: turn.speaker, text: turn.text })),
  [
    { speaker: "MEDICO", text: "¿Desde cuando tiene dolor?" },
    { speaker: "PACIENTE", text: "Desde hace tres dias." },
    { speaker: "MEDICO", text: "¿Ha tomado algo?" },
    { speaker: "PACIENTE", text: "Ibuprofeno." }
  ],
  "convierte una transcripcion en turnos editables Medico/Paciente"
);

const generalSegments = buildTemplateSegments("GENERAL_MEDICINE");

assert.ok(
  generalSegments.segments.some((segment) => segment.id === "subjective" && segment.target === "subjective"),
  "incluye el segmento subjetivo para SOAP general"
);
assert.ok(
  generalSegments.segments.some(
    (segment) => segment.id === "general_follow_up" && segment.target === "specialty.followUp"
  ),
  "incluye seguimiento de medicina general como segmento textual seguro"
);

const dentalSegments = buildTemplateSegments("ODONTOLOGY");

assert.ok(
  dentalSegments.segments.some((segment) => segment.target === "specialty.hygienePlan"),
  "incluye higiene dental como segmento textual seguro"
);
assert.equal(
  dentalSegments.segments.some((segment) => segment.target.includes("odontogram")),
  false,
  "no expone odontograma al acomodo automatico del MVP"
);

const customTemplate = normalizeTemplateDefinition(
  {
    id: "custom-general-control",
    segments: [
      {
        id: "control_reason",
        label: "Motivo de control",
        target: "subjective",
        instructions: "Extrae el motivo principal de seguimiento.",
        required: true
      },
      {
        id: "unsafe_chart",
        label: "Odontograma",
        target: "specialty.odontogram",
        instructions: "No debe entrar al MVP.",
        required: false
      },
      {
        id: "follow_up",
        label: "Seguimiento",
        target: "specialty.followUp",
        instructions: "Extrae el siguiente control.",
        required: false
      }
    ]
  },
  "GENERAL_MEDICINE"
);

assert.equal(customTemplate.id, "custom-general-control", "conserva el id local de plantilla");
assert.deepEqual(
  customTemplate.segments.map((segment) => segment.id),
  ["control_reason", "follow_up"],
  "filtra segmentos personalizados hacia campos textuales seguros"
);

const note = {
  subjective: "Texto previo.",
  objective: "",
  assessment: "",
  diagnosis: "",
  plan: "",
  instructions: "",
  specialty: {
    riskFactors: "",
    reviewOfSystems: "",
    physicalExam: "",
    labs: "",
    screenings: "",
    preventivePlan: "",
    followUp: ""
  }
};

const next = appendSegmentToNote(note, {
  segment_id: "subjective",
  content: "Dolor abdominal de tres dias.",
  confidence: "high",
  source_turns: ["turn-1"],
  warnings: []
});

assert.equal(
  next.subjective,
  "Texto previo.\n\nDolor abdominal de tres dias.",
  "agrega el segmento al final sin reemplazar el contenido previo"
);
assert.equal(note.subjective, "Texto previo.", "no muta la nota original");

const customApplied = appendSegmentToNote(
  note,
  {
    segment_id: "follow_up",
    content: "Control en dos semanas.",
    confidence: "medium",
    source_turns: ["turn-2"],
    warnings: []
  },
  customTemplate
);

assert.equal(
  customApplied.specialty.followUp,
  "Control en dos semanas.",
  "aplica segmentos personalizados usando el target definido por la plantilla activa"
);
