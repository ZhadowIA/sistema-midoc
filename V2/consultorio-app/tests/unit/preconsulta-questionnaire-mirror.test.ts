import { describe, expect, it } from "vitest";

import * as escritorio from "../../../desktop-app/src/preconsultaQuestionnaire";
import * as portal from "../../src/lib/preconsulta-questionnaire";

/**
 * Guarda contra la deriva del cuestionario de preconsulta (paso 32): el portal
 * valida con Zod lo que el medico publica y el escritorio lo arma con un espejo
 * sin dependencias. Si se separan, el editor dejaria publicar algo que el
 * portal rechaza (o al reves). Vive en el portal porque su CI instala las
 * dependencias de ambos lados, como `medical-history-mirror.test.ts`.
 */
describe("preconsulta questionnaire mirror", () => {
  it("shares types, limits and condition rules", () => {
    expect([...escritorio.QUESTION_TYPES]).toEqual([...portal.QUESTION_TYPES]);
    expect(escritorio.QUESTIONNAIRE_LIMITS).toEqual(portal.QUESTIONNAIRE_LIMITS);
    expect([...escritorio.YES_NO_VALUES]).toEqual([...portal.YES_NO_VALUES]);
    expect([...escritorio.CONDITION_SOURCE_TYPES]).toEqual([...portal.CONDITION_SOURCE_TYPES]);
    expect(escritorio.QUESTIONNAIRE_SCHEMA_VERSION).toBe(portal.QUESTIONNAIRE_SCHEMA_VERSION);
    expect(Object.keys(escritorio.QUESTION_TYPE_LABELS).sort()).toEqual([...portal.QUESTION_TYPES].sort());
  });

  it("publishes templates the portal accepts", () => {
    for (const template of Object.values(escritorio.QUESTIONNAIRE_TEMPLATES)) {
      expect(portal.preconsultaQuestionnaireSchema.safeParse(escritorio.cleanForPublish(template)).success).toBe(true);
    }
  });

  it("agrees with the portal on what can be published", () => {
    const cases: escritorio.PreconsultaQuestionnaire[] = [
      escritorio.emptyQuestionnaire(),
      { schemaVersion: 1, questions: [{ id: "a", label: "A", type: "single_choice", required: false, options: ["X"] }] },
      { schemaVersion: 1, questions: [{ id: "a", label: "A", type: "short_text", required: false, options: ["X", "Y"] }] },
      {
        schemaVersion: 1,
        questions: [
          { id: "a", label: "A", type: "short_text", required: false },
          { id: "b", label: "B", type: "short_text", required: false, showWhen: { questionId: "a", equals: "x" } }
        ]
      },
      {
        schemaVersion: 1,
        questions: [
          { id: "a", label: "A", type: "yes_no", required: false },
          { id: "b", label: "B", type: "short_text", required: false, showWhen: { questionId: "a", equals: "si" } }
        ]
      },
      { schemaVersion: 1, questions: [{ id: "Mal Id", label: "A", type: "short_text", required: false }] }
    ];
    for (const definition of cases) {
      const desktopOk = escritorio.validateQuestionnaire(definition).length === 0;
      const portalOk = portal.preconsultaQuestionnaireSchema.safeParse(escritorio.cleanForPublish(definition)).success;
      expect({ definition, desktopOk }).toEqual({ definition, desktopOk: portalOk });
    }
  });
});
