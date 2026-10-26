import { describe, expect, it } from "vitest";

import { preconsultaQuestionnaireSchema } from "../../src/lib/preconsulta-questionnaire";

const valid = {
  schemaVersion: 1,
  title: "Motivo de consulta",
  questions: [
    { id: "motivo", label: "¿Qué te trae a consulta?", type: "long_text", required: true },
    { id: "dolor", label: "¿Tienes dolor?", type: "yes_no", required: true },
    {
      id: "intensidad",
      label: "¿Qué tan fuerte es el dolor?",
      type: "scale",
      required: false,
      showWhen: { questionId: "dolor", equals: "si" }
    },
    { id: "zona", label: "¿Dónde?", type: "single_choice", required: false, options: ["Cabeza", "Abdomen"] },
    {
      id: "desde",
      label: "¿Desde cuándo te duele la cabeza?",
      type: "date",
      required: false,
      showWhen: { questionId: "zona", equals: "Cabeza" }
    }
  ]
};

describe("preconsulta questionnaire contract", () => {
  it("accepts a well formed questionnaire and an empty one", () => {
    expect(preconsultaQuestionnaireSchema.safeParse(valid).success).toBe(true);
    expect(preconsultaQuestionnaireSchema.safeParse({ schemaVersion: 1, questions: [] }).success).toBe(true);
  });

  it("rejects unknown fields, versions and types", () => {
    expect(preconsultaQuestionnaireSchema.safeParse({ ...valid, extra: 1 }).success).toBe(false);
    expect(preconsultaQuestionnaireSchema.safeParse({ ...valid, schemaVersion: 2 }).success).toBe(false);
    const badType = { ...valid, questions: [{ id: "x", label: "X", type: "file", required: false }] };
    expect(preconsultaQuestionnaireSchema.safeParse(badType).success).toBe(false);
  });

  it("requires valid ids, unique and within limits", () => {
    const repeated = { ...valid, questions: [valid.questions[0], valid.questions[0]] };
    expect(preconsultaQuestionnaireSchema.safeParse(repeated).success).toBe(false);
    const badId = { ...valid, questions: [{ ...valid.questions[0], id: "Motivo Principal" }] };
    expect(preconsultaQuestionnaireSchema.safeParse(badId).success).toBe(false);
    const tooMany = {
      schemaVersion: 1,
      questions: Array.from({ length: 41 }, (_, i) => ({ id: `q${i}`, label: "P", type: "short_text", required: false }))
    };
    expect(preconsultaQuestionnaireSchema.safeParse(tooMany).success).toBe(false);
  });

  it("checks options only on choice questions", () => {
    const oneOption = { ...valid, questions: [{ id: "z", label: "Z", type: "single_choice", required: false, options: ["A"] }] };
    expect(preconsultaQuestionnaireSchema.safeParse(oneOption).success).toBe(false);
    const textWithOptions = { ...valid, questions: [{ id: "t", label: "T", type: "short_text", required: false, options: ["A", "B"] }] };
    expect(preconsultaQuestionnaireSchema.safeParse(textWithOptions).success).toBe(false);
    const duplicated = { ...valid, questions: [{ id: "z", label: "Z", type: "multi_choice", required: false, options: ["A", "a"] }] };
    expect(preconsultaQuestionnaireSchema.safeParse(duplicated).success).toBe(false);
  });

  it("checks that conditions point to an earlier compatible question and a real answer", () => {
    const forward = {
      schemaVersion: 1,
      questions: [
        { id: "a", label: "A", type: "short_text", required: false, showWhen: { questionId: "b", equals: "si" } },
        { id: "b", label: "B", type: "yes_no", required: false }
      ]
    };
    expect(preconsultaQuestionnaireSchema.safeParse(forward).success).toBe(false);
    const fromText = {
      schemaVersion: 1,
      questions: [
        { id: "a", label: "A", type: "short_text", required: false },
        { id: "b", label: "B", type: "yes_no", required: false, showWhen: { questionId: "a", equals: "x" } }
      ]
    };
    expect(preconsultaQuestionnaireSchema.safeParse(fromText).success).toBe(false);
    const impossible = {
      schemaVersion: 1,
      questions: [
        { id: "a", label: "A", type: "yes_no", required: false },
        { id: "b", label: "B", type: "short_text", required: false, showWhen: { questionId: "a", equals: "tal vez" } }
      ]
    };
    expect(preconsultaQuestionnaireSchema.safeParse(impossible).success).toBe(false);
  });
});
