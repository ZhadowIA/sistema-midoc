/**
 * Espejo del contrato del cuestionario de preconsulta (paso 32, rebanada 1).
 *
 * La fuente de verdad es `consultorio-app/src/lib/preconsulta-questionnaire.ts`
 * (Zod). Este modulo lo replica sin dependencias para el editor del medico:
 * tipos, limites, validacion con mensajes para el medico, condiciones y
 * plantillas. `consultorio-app/tests/unit/preconsulta-questionnaire-mirror.test.ts`
 * vigila que no se separen. Modulo puro para `node --test`.
 */

export const QUESTION_TYPES = [
  "short_text",
  "long_text",
  "yes_no",
  "single_choice",
  "multi_choice",
  "scale",
  "date",
  "number"
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

export const CONDITION_SOURCE_TYPES: readonly QuestionType[] = ["yes_no", "single_choice", "multi_choice"];

export const YES_NO_VALUES = ["si", "no"] as const;

export const QUESTIONNAIRE_LIMITS = {
  questions: 40,
  title: 120,
  label: 200,
  help: 300,
  options: 12,
  option: 80,
  id: 40
} as const;

export const QUESTIONNAIRE_SCHEMA_VERSION = 1;

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  short_text: "Texto corto",
  long_text: "Texto largo",
  yes_no: "Sí / No",
  single_choice: "Opción única",
  multi_choice: "Opción múltiple",
  scale: "Escala 0 a 10",
  date: "Fecha",
  number: "Número"
};

export interface PreconsultaQuestion {
  id: string;
  label: string;
  help?: string;
  type: QuestionType;
  required: boolean;
  options?: string[];
  showWhen?: { questionId: string; equals: string };
}

export interface PreconsultaQuestionnaire {
  schemaVersion: 1;
  title?: string;
  questions: PreconsultaQuestion[];
}

export type PreviewAnswers = Record<string, string | string[]>;

export function emptyQuestionnaire(): PreconsultaQuestionnaire {
  return { schemaVersion: 1, title: "Motivo de consulta", questions: [] };
}

export function isChoice(type: QuestionType): boolean {
  return type === "single_choice" || type === "multi_choice";
}

/** Respuestas posibles de una pregunta que condiciona a otra. */
export function conditionValues(question: PreconsultaQuestion): string[] {
  if (question.type === "yes_no") return [...YES_NO_VALUES];
  return isChoice(question.type) ? (question.options ?? []) : [];
}

const ID_PATTERN = new RegExp(`^[a-z0-9_]{1,${QUESTIONNAIRE_LIMITS.id}}$`);

/** "¿Desde cuándo?" -> "desde_cuando", sin repetir ids existentes. */
export function newQuestionId(label: string, existing: string[]): string {
  const base =
    label
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, QUESTIONNAIRE_LIMITS.id - 3) || "pregunta";
  let candidate = base;
  for (let n = 2; existing.includes(candidate); n += 1) candidate = `${base}_${n}`;
  return candidate;
}

/**
 * Las mismas reglas que el contrato del portal, con mensajes para el medico.
 * Vacio = se puede publicar.
 */
export function validateQuestionnaire(definition: PreconsultaQuestionnaire): string[] {
  const errors: string[] = [];
  if ((definition.title ?? "").trim().length > QUESTIONNAIRE_LIMITS.title) errors.push("El título es demasiado largo.");
  if (definition.questions.length > QUESTIONNAIRE_LIMITS.questions) {
    errors.push(`Puedes tener hasta ${QUESTIONNAIRE_LIMITS.questions} preguntas.`);
  }
  const seen = new Map<string, PreconsultaQuestion>();
  definition.questions.forEach((question, index) => {
    const n = `Pregunta ${index + 1}`;
    if (!ID_PATTERN.test(question.id)) errors.push(`${n}: identificador inválido.`);
    if (seen.has(question.id)) errors.push(`${n}: identificador repetido.`);
    const label = question.label.trim();
    if (!label) errors.push(`${n}: escribe la pregunta.`);
    if (label.length > QUESTIONNAIRE_LIMITS.label) errors.push(`${n}: la pregunta es demasiado larga.`);
    if ((question.help ?? "").trim().length > QUESTIONNAIRE_LIMITS.help) errors.push(`${n}: la ayuda es demasiado larga.`);
    if (!QUESTION_TYPES.includes(question.type)) errors.push(`${n}: tipo desconocido.`);

    const options = question.options ?? [];
    if (isChoice(question.type)) {
      if (options.length < 2) errors.push(`${n}: necesita al menos dos opciones.`);
      if (options.length > QUESTIONNAIRE_LIMITS.options) errors.push(`${n}: hasta ${QUESTIONNAIRE_LIMITS.options} opciones.`);
      if (options.some((o) => !o.trim() || o.trim().length > QUESTIONNAIRE_LIMITS.option)) {
        errors.push(`${n}: hay una opción vacía o demasiado larga.`);
      }
      if (new Set(options.map((o) => o.trim().toLowerCase())).size !== options.length) errors.push(`${n}: opciones repetidas.`);
    }
    // Las opciones sobrantes de una pregunta que dejo de ser de opciones se
    // quitan al publicar (`cleanForPublish`): no impiden publicar.

    if (question.showWhen) {
      const source = seen.get(question.showWhen.questionId);
      if (!source) errors.push(`${n}: la condición debe depender de una pregunta anterior.`);
      else if (!CONDITION_SOURCE_TYPES.includes(source.type)) errors.push(`${n}: solo condicionan preguntas Sí/No o de opciones.`);
      else if (!conditionValues(source).includes(question.showWhen.equals)) {
        errors.push(`${n}: la condición usa una respuesta que ya no existe.`);
      }
    }
    seen.set(question.id, question);
  });
  return errors;
}

/** Quita lo vacio para publicar: ayuda en blanco, opciones de preguntas que no las usan. */
export function cleanForPublish(definition: PreconsultaQuestionnaire): PreconsultaQuestionnaire {
  const title = definition.title?.trim();
  return {
    schemaVersion: 1,
    ...(title ? { title } : {}),
    questions: definition.questions.map((q) => {
      const help = q.help?.trim();
      return {
        id: q.id,
        label: q.label.trim(),
        ...(help ? { help } : {}),
        type: q.type,
        required: q.required,
        ...(isChoice(q.type) ? { options: (q.options ?? []).map((o) => o.trim()) } : {}),
        ...(q.showWhen ? { showWhen: q.showWhen } : {})
      };
    })
  };
}

/** Preguntas que ve el paciente con estas respuestas (las condiciones en cadena). */
export function visibleQuestions(definition: PreconsultaQuestionnaire, answers: PreviewAnswers): PreconsultaQuestion[] {
  const visible = new Set<string>();
  return definition.questions.filter((question) => {
    const condition = question.showWhen;
    const shown =
      !condition ||
      (visible.has(condition.questionId) &&
        (Array.isArray(answers[condition.questionId])
          ? (answers[condition.questionId] as string[]).includes(condition.equals)
          : answers[condition.questionId] === condition.equals));
    if (shown) visible.add(question.id);
    return shown;
  });
}

/** Plantillas de inicio (decision del diseno): medicina general y odontologia. */
export const QUESTIONNAIRE_TEMPLATES: Record<"general" | "odontologia", PreconsultaQuestionnaire> = {
  general: {
    schemaVersion: 1,
    title: "Motivo de consulta",
    questions: [
      { id: "motivo", label: "¿Qué te trae a consulta?", type: "long_text", required: true },
      { id: "desde_cuando", label: "¿Desde cuándo tienes estas molestias?", type: "short_text", required: false },
      { id: "dolor", label: "¿Tienes dolor?", type: "yes_no", required: true },
      {
        id: "dolor_intensidad",
        label: "¿Qué tan fuerte es el dolor?",
        help: "0 es sin dolor y 10 el peor dolor imaginable.",
        type: "scale",
        required: false,
        showWhen: { questionId: "dolor", equals: "si" }
      },
      { id: "dolor_donde", label: "¿Dónde te duele?", type: "short_text", required: false, showWhen: { questionId: "dolor", equals: "si" } },
      { id: "fiebre", label: "¿Has tenido fiebre?", type: "yes_no", required: false },
      {
        id: "medicamentos_actuales",
        label: "¿Qué medicamentos estás tomando ahora?",
        help: "Incluye los que compras sin receta, vitaminas y remedios.",
        type: "long_text",
        required: false
      },
      { id: "otros", label: "¿Algo más que quieras que sepa tu médico?", type: "long_text", required: false }
    ]
  },
  odontologia: {
    schemaVersion: 1,
    title: "Motivo de consulta dental",
    questions: [
      { id: "motivo", label: "¿Qué te trae a consulta?", type: "long_text", required: true },
      { id: "dolor", label: "¿Tienes dolor en dientes o encías?", type: "yes_no", required: true },
      {
        id: "dolor_intensidad",
        label: "¿Qué tan fuerte es el dolor?",
        help: "0 es sin dolor y 10 el peor dolor imaginable.",
        type: "scale",
        required: false,
        showWhen: { questionId: "dolor", equals: "si" }
      },
      {
        id: "dolor_con",
        label: "¿El dolor aparece con...?",
        type: "multi_choice",
        required: false,
        options: ["Frío", "Calor", "Dulce", "Al morder", "Sin causa aparente"],
        showWhen: { questionId: "dolor", equals: "si" }
      },
      { id: "sangrado", label: "¿Te sangran las encías al cepillarte?", type: "yes_no", required: false },
      {
        id: "ultima_visita",
        label: "¿Cuándo fue tu última visita al dentista?",
        type: "single_choice",
        required: false,
        options: ["Hace menos de 6 meses", "Entre 6 meses y 1 año", "Hace más de 1 año", "Nunca he ido"]
      },
      { id: "otros", label: "¿Algo más que quieras que sepa tu dentista?", type: "long_text", required: false }
    ]
  }
};

/** Quita una pregunta y las condiciones que dependian de ella. */
export function removeQuestion(definition: PreconsultaQuestionnaire, id: string): PreconsultaQuestionnaire {
  return {
    ...definition,
    questions: definition.questions
      .filter((q) => q.id !== id)
      .map((q) => (q.showWhen?.questionId === id ? { ...q, showWhen: undefined } : q))
  };
}

/** Mueve una pregunta un lugar; si una condicion queda antes de su origen, el validador lo dice. */
export function moveQuestion(definition: PreconsultaQuestionnaire, index: number, delta: -1 | 1): PreconsultaQuestionnaire {
  const target = index + delta;
  if (target < 0 || target >= definition.questions.length) return definition;
  const questions = [...definition.questions];
  [questions[index], questions[target]] = [questions[target], questions[index]];
  return { ...definition, questions };
}

/** Pregunta nueva con id unico. */
export function newQuestion(definition: PreconsultaQuestionnaire): PreconsultaQuestion {
  return {
    id: newQuestionId("pregunta", definition.questions.map((q) => q.id)),
    label: "",
    type: "short_text",
    required: false
  };
}

/** JSON con las llaves ordenadas: dos definiciones iguales comparan igual aunque el orden de sus llaves cambie. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Lo que se publicaria hoy es igual a lo ya publicado. */
export function samePublished(draft: PreconsultaQuestionnaire, published: unknown): boolean {
  return published != null && canonical(cleanForPublish(draft)) === canonical(published);
}
