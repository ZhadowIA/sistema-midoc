import { z } from "zod";

/**
 * Cuestionario de preconsulta configurable (paso 32, `V2/16_preconsulta_configurable.md`).
 *
 * Este es el contrato de la parte 2 ("motivo de consulta"): las preguntas que
 * el medico arma en su app. La parte 1 (antecedentes para quien consulta por
 * primera vez) es el contrato comun de `medical-history.ts` y no se edita.
 *
 * La definicion no es dato clinico: son preguntas, no respuestas. Se publica en
 * el portal para pintar el formulario (clase OPERATIVO). Las respuestas viajan
 * cifradas para la llave del medico y la nube nunca las ve.
 *
 * El escritorio tiene un espejo (`desktop-app/src/preconsultaQuestionnaire.ts`)
 * vigilado por `tests/unit/preconsulta-questionnaire-mirror.test.ts`.
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

/** Tipos cuya respuesta puede condicionar a otra pregunta. */
export const CONDITION_SOURCE_TYPES: readonly QuestionType[] = ["yes_no", "single_choice", "multi_choice"];

/** Valores de una pregunta si/no, tal como se guardan en la respuesta. */
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

const QUESTION_ID = new RegExp(`^[a-z0-9_]{1,${QUESTIONNAIRE_LIMITS.id}}$`);

const questionSchema = z.strictObject({
  id: z.string().regex(QUESTION_ID),
  label: z.string().trim().min(1).max(QUESTIONNAIRE_LIMITS.label),
  help: z.string().trim().max(QUESTIONNAIRE_LIMITS.help).optional(),
  type: z.enum(QUESTION_TYPES),
  required: z.boolean(),
  options: z
    .array(z.string().trim().min(1).max(QUESTIONNAIRE_LIMITS.option))
    .max(QUESTIONNAIRE_LIMITS.options)
    .optional(),
  showWhen: z
    .strictObject({
      questionId: z.string().regex(QUESTION_ID),
      equals: z.string().trim().min(1).max(QUESTIONNAIRE_LIMITS.option)
    })
    .optional()
});

export type PreconsultaQuestion = z.infer<typeof questionSchema>;

export const preconsultaQuestionnaireSchema = z
  .strictObject({
    schemaVersion: z.literal(QUESTIONNAIRE_SCHEMA_VERSION),
    title: z.string().trim().max(QUESTIONNAIRE_LIMITS.title).optional(),
    questions: z.array(questionSchema).max(QUESTIONNAIRE_LIMITS.questions)
  })
  .superRefine((definition, ctx) => {
    const seen = new Map<string, PreconsultaQuestion>();
    definition.questions.forEach((question, index) => {
      const at = (message: string) => ctx.addIssue({ code: "custom", path: ["questions", index], message });
      if (seen.has(question.id)) at(`id repetido: ${question.id}`);

      const isChoice = question.type === "single_choice" || question.type === "multi_choice";
      const options = question.options ?? [];
      if (isChoice && options.length < 2) at("una pregunta de opciones necesita al menos dos");
      if (!isChoice && options.length > 0) at("solo las preguntas de opciones llevan opciones");
      if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) at("opciones repetidas");

      // La condicion apunta a una pregunta anterior que pueda condicionar, con un valor que exista.
      if (question.showWhen) {
        const source = seen.get(question.showWhen.questionId);
        if (!source) {
          at("la condicion debe apuntar a una pregunta anterior");
        } else if (!CONDITION_SOURCE_TYPES.includes(source.type)) {
          at("solo condicionan las preguntas si/no o de opciones");
        } else {
          const values = source.type === "yes_no" ? [...YES_NO_VALUES] : (source.options ?? []);
          if (!values.includes(question.showWhen.equals)) at("el valor de la condicion no es una respuesta posible");
        }
      }
      seen.set(question.id, question);
    });
  });

export type PreconsultaQuestionnaire = z.infer<typeof preconsultaQuestionnaireSchema>;
