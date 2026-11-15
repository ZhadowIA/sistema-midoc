import { z } from "zod";

import { medicalHistorySchema } from "./medical-history";
import { isValidNationalNumber, onlyDigits } from "./phone";
import type { PreconsultaQuestion, PreconsultaQuestionnaire } from "./preconsulta-questionnaire";

/**
 * Respuestas de la preconsulta (paso 32, rebanada 2). Todo esto se arma y se
 * cifra en el celular del paciente: la nube solo recibe el sobre sellado para
 * la llave del medico. Este modulo es puro y lo usan el formulario (navegador)
 * y las pruebas; el escritorio lo leera con su espejo en la rebanada 3.
 */

/** `meta.kind` del sobre (`seal-envelope.ts`); el escritorio lo usa para enrutar. */
export const PRECONSULTA_ENVELOPE_KIND = "preconsulta";
export const PRECONSULTA_ENVELOPE_VERSION = 1;

/** Respuesta explicita "Prefiero no responder" en preguntas no indispensables. */
export const NO_ANSWER = "prefiero_no_responder";

export const ANSWER_LIMITS = {
  text: 2000,
  firstName: 80,
  lastName: 120,
  changes: 2000
} as const;

export type AnswerValue = string | string[];
export type Answers = Record<string, AnswerValue>;

/** "1990-05-01" valida, no futura y razonable. */
export function isValidBirthDate(value: string, today = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return false;
  return date.getUTCFullYear() >= 1900 && date.getTime() <= today.getTime();
}

export const identitySchema = z.strictObject({
  firstName: z.string().trim().min(1).max(ANSWER_LIMITS.firstName),
  lastName: z.string().trim().min(1).max(ANSWER_LIMITS.lastName),
  birthDate: z.string().refine((value) => isValidBirthDate(value), "fecha de nacimiento invalida"),
  /** Telefono nacional de 10 digitos con su lada de pais ("+52"). */
  phoneCountry: z.string().regex(/^\+\d{1,3}$/),
  phone: z.string().refine((value) => isValidNationalNumber(value), "telefono invalido").transform(onlyDigits)
});

export type Identity = z.infer<typeof identitySchema>;

const answerValue = z.union([
  z.string().max(ANSWER_LIMITS.text),
  z.array(z.string().max(ANSWER_LIMITS.text)).max(20)
]);

/** Lo que va dentro del sobre cifrado. */
export const preconsultaEnvelopeSchema = z.strictObject({
  kind: z.literal(PRECONSULTA_ENVELOPE_KIND),
  version: z.literal(PRECONSULTA_ENVELOPE_VERSION),
  questionnaireVersion: z.number().int().min(1),
  linkKind: z.enum(["GENERAL", "PERSONAL"]),
  submittedAt: z.iso.datetime(),
  consentAt: z.iso.datetime(),
  identity: identitySchema,
  firstVisit: z.boolean(),
  /** Parte 1, solo si es su primera consulta con el medico. */
  medicalHistory: medicalHistorySchema.optional(),
  /** Si ya es paciente: novedades desde la ultima visita. */
  changesSinceLastVisit: z.string().max(ANSWER_LIMITS.changes).optional(),
  answers: z.record(z.string(), answerValue)
});

export type PreconsultaEnvelope = z.infer<typeof preconsultaEnvelopeSchema>;

function answered(value: AnswerValue | undefined): boolean {
  if (value === undefined) return false;
  return Array.isArray(value) ? value.length > 0 : value.trim().length > 0;
}

/** Preguntas que aplican con estas respuestas (las condiciones en cadena). */
export function visibleQuestions(definition: PreconsultaQuestionnaire, answers: Answers): PreconsultaQuestion[] {
  const visible = new Set<string>();
  return definition.questions.filter((question) => {
    const condition = question.showWhen;
    const value = condition ? answers[condition.questionId] : undefined;
    const shown =
      !condition ||
      (visible.has(condition.questionId) &&
        (Array.isArray(value) ? value.includes(condition.equals) : value === condition.equals));
    if (shown) visible.add(question.id);
    return shown;
  });
}

/** Obligatorias visibles sin contestar ("Prefiero no responder" no vale en las obligatorias). */
export function missingRequired(definition: PreconsultaQuestionnaire, answers: Answers): string[] {
  return visibleQuestions(definition, answers)
    .filter((q) => q.required && (!answered(answers[q.id]) || answers[q.id] === NO_ANSWER))
    .map((q) => q.id);
}

/** Solo las respuestas de preguntas visibles y contestadas: lo oculto no viaja. */
export function answersToSend(definition: PreconsultaQuestionnaire, answers: Answers): Answers {
  const result: Answers = {};
  for (const question of visibleQuestions(definition, answers)) {
    const value = answers[question.id];
    if (!answered(value)) continue;
    result[question.id] = Array.isArray(value) ? value : value!.trim();
  }
  return result;
}

/** Paginas del formulario: pocas preguntas por pantalla. */
export function pages<T>(items: T[], size = 3): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}
