"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, ListChecks } from "lucide-react";

type Block = {
  key: string;
  title: string;
  items: string[];
};

const BLOCKS: Block[] = [
  {
    key: "chiefComplaint",
    title: "1. Motivo de consulta",
    items: [
      "¿Qué le trae hoy a la consulta?",
      "¿Cuál es el síntoma que más le molesta?",
    ],
  },
  {
    key: "presentIllness",
    title: "2. Enfermedad actual (OPQRST)",
    items: [
      "Onset: ¿cuándo comenzó y cómo inició (súbito o gradual)?",
      "Provocadores / alivio: ¿qué lo empeora o mejora?",
      "Quality: ¿cómo describiría el dolor o la molestia? (punzante, opresivo, ardoroso)",
      "Región / irradiación: ¿dónde se localiza? ¿se irradia a otra parte?",
      "Severidad: del 1 al 10, ¿qué intensidad tiene?",
      "Tiempo: ¿es continuo o intermitente? ¿cuánto dura cada episodio?",
      "¿Ha tomado algún medicamento o tratamiento? ¿con qué resultado?",
    ],
  },
  {
    key: "pertinentNegatives",
    title: "3. Negativos pertinentes",
    items: [
      "¿Ha tenido fiebre, pérdida de peso o sudoraciones nocturnas?",
      "Sintomatología de alarma según el cuadro (p. ej. dolor torácico, disnea, sangrado)",
    ],
  },
  {
    key: "reviewOfSystems",
    title: "4. Revisión por aparatos y sistemas",
    items: [
      "Cardiovascular: dolor precordial, palpitaciones, edema",
      "Respiratorio: tos, disnea, expectoración",
      "Digestivo: náusea, vómito, cambios en evacuaciones",
      "Genitourinario: disuria, hematuria, cambios menstruales",
      "Neurológico: cefalea, mareo, debilidad, parestesias",
      "Musculoesquelético: dolor articular, limitación funcional",
      "Piel: erupciones, prurito, lesiones",
      "Endocrino: poliuria, polidipsia, intolerancia al calor/frío",
      "Psiquiátrico: ánimo, sueño, ansiedad",
    ],
  },
  {
    key: "history",
    title: "5. Antecedentes relevantes",
    items: [
      "Personales patológicos: hipertensión, diabetes, alergias, cirugías",
      "Medicamentos actuales y dosis",
      "Familiares: enfermedades crónicas, cáncer, cardiopatía temprana",
      "Hábitos: tabaco, alcohol, actividad física, alimentación",
    ],
  },
  {
    key: "vitals",
    title: "6. Signos vitales a registrar",
    items: [
      "TA, FC, FR, temperatura, SpO₂",
      "Peso, talla, IMC",
    ],
  },
  {
    key: "physicalExam",
    title: "7. Exploración física dirigida",
    items: [
      "Aspecto general y estado de hidratación",
      "Cabeza y cuello, cardiopulmonar, abdomen",
      "Exploración dirigida al sistema afectado",
      "Neurológico básico si aplica",
    ],
  },
  {
    key: "closing",
    title: "8. Cierre",
    items: [
      "Resumir al paciente el plan diagnóstico y terapéutico",
      "Confirmar comprensión (teach-back)",
      "Acordar seguimiento y datos de alarma",
    ],
  },
];

export function NarrationScript() {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const toggle = (id: string) =>
    setChecked((m) => ({ ...m, [id]: !m[id] }));

  return (
    <div className="rounded-xl border border-border bg-secondary/5 p-3 space-y-2">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-2 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <ListChecks className="w-4 h-4" />
          Guion de preguntas para obtener los datos necesarios
        </span>
        {open ? (
          <ChevronDown className="w-4 h-4" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
      </button>
      {!open && (
        <p className="text-xs text-muted-foreground">
          Sigue este guion mientras narra la consulta para que la IA pueda
          estructurar toda la historia clínica automáticamente.
        </p>
      )}
      {open && (
        <div className="space-y-3 pt-1">
          {BLOCKS.map((block) => (
            <div key={block.key} className="space-y-1">
              <p className="text-sm font-medium">{block.title}</p>
              <ul className="space-y-1">
                {block.items.map((item, idx) => {
                  const id = `${block.key}-${idx}`;
                  const isChecked = Boolean(checked[id]);
                  return (
                    <li key={id} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={isChecked}
                        onChange={() => toggle(id)}
                      />
                      <span
                        className={
                          isChecked
                            ? "line-through text-muted-foreground"
                            : undefined
                        }
                      >
                        {item}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
