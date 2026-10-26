import { describe, expect, it } from "vitest";

import {
  NO_ANSWER,
  answersToSend,
  identitySchema,
  isValidBirthDate,
  missingRequired,
  pages,
  preconsultaEnvelopeSchema,
  visibleQuestions
} from "../../src/lib/preconsulta-answers";
import type { PreconsultaQuestionnaire } from "../../src/lib/preconsulta-questionnaire";

const definition: PreconsultaQuestionnaire = {
  schemaVersion: 1,
  questions: [
    { id: "motivo", label: "Motivo", type: "long_text", required: true },
    { id: "dolor", label: "Dolor", type: "yes_no", required: true },
    { id: "intensidad", label: "Intensidad", type: "scale", required: true, showWhen: { questionId: "dolor", equals: "si" } },
    { id: "con", label: "Con", type: "multi_choice", required: false, options: ["Frio", "Calor"], showWhen: { questionId: "dolor", equals: "si" } },
    { id: "frio", label: "Frio", type: "short_text", required: false, showWhen: { questionId: "con", equals: "Frio" } }
  ]
};

const identity = { firstName: "Ana", lastName: "Ruiz Paz", birthDate: "1990-05-01", phoneCountry: "+52", phone: "614 000 1111" };

describe("preconsulta answers", () => {
  it("validates the mandatory identification", () => {
    expect(identitySchema.parse(identity).phone).toBe("6140001111");
    expect(identitySchema.safeParse({ ...identity, firstName: " " }).success).toBe(false);
    expect(identitySchema.safeParse({ ...identity, phone: "12345" }).success).toBe(false);
    expect(identitySchema.safeParse({ ...identity, birthDate: "1990-02-30" }).success).toBe(false);
    expect(isValidBirthDate("2999-01-01")).toBe(false);
    expect(isValidBirthDate("1899-12-31")).toBe(false);
  });

  it("shows conditional questions in chain and asks only the visible required ones", () => {
    const ids = (answers: Record<string, string | string[]>) => visibleQuestions(definition, answers).map((q) => q.id);
    expect(ids({ dolor: "no" })).toEqual(["motivo", "dolor"]);
    expect(ids({ dolor: "si", con: ["Frio"] })).toEqual(["motivo", "dolor", "intensidad", "con", "frio"]);
    expect(missingRequired(definition, { dolor: "no" })).toEqual(["motivo"]);
    expect(missingRequired(definition, { motivo: "Tos", dolor: "si" })).toEqual(["intensidad"]);
    expect(missingRequired(definition, { motivo: "Tos", dolor: "si", intensidad: NO_ANSWER })).toEqual(["intensidad"]);
    expect(missingRequired(definition, { motivo: "Tos", dolor: "si", intensidad: "7" })).toEqual([]);
  });

  it("sends only visible and answered questions", () => {
    const sent = answersToSend(definition, { motivo: "  Tos  ", dolor: "no", intensidad: "8", con: ["Frio"], frio: "" });
    expect(sent).toEqual({ motivo: "Tos", dolor: "no" });
  });

  it("splits questions in short pages", () => {
    expect(pages([1, 2, 3, 4, 5, 6, 7]).map((p) => p.length)).toEqual([3, 3, 1]);
    expect(pages([])).toEqual([]);
  });

  it("defines the envelope the doctor's app opens", () => {
    const envelope = {
      kind: "preconsulta",
      version: 1,
      questionnaireVersion: 2,
      linkKind: "GENERAL",
      submittedAt: "2026-10-25T18:00:00.000Z",
      consentAt: "2026-10-25T17:59:00.000Z",
      identity: identitySchema.parse(identity),
      firstVisit: false,
      changesSinceLastVisit: "Empecé a tomar losartán",
      answers: { motivo: "Tos", dolor: "no" }
    };
    expect(preconsultaEnvelopeSchema.safeParse(envelope).success).toBe(true);
    expect(preconsultaEnvelopeSchema.safeParse({ ...envelope, extra: 1 }).success).toBe(false);
    expect(preconsultaEnvelopeSchema.safeParse({ ...envelope, answers: { motivo: "x".repeat(2001) } }).success).toBe(false);
  });
});
