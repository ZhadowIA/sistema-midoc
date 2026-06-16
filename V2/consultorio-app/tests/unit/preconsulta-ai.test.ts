import { describe, expect, it } from "vitest";

import {
  FakePreconsultaProvider,
  type PreconsultaContext
} from "../../src/services/ai/preconsulta-ai";

function ctx(partial: Partial<PreconsultaContext> = {}): PreconsultaContext {
  return { motivo: "Dolor de cabeza", answers: [], maxQuestions: 5, ...partial };
}

describe("FakePreconsultaProvider (paso 19, rebanada 8)", () => {
  const provider = new FakePreconsultaProvider();

  it("arranca pidiendo el sintoma principal cuando no hay motivo", async () => {
    const result = await provider.nextQuestion(ctx({ motivo: "" }));
    expect(result).toEqual({ type: "question", question: expect.stringContaining("síntoma principal") });
  });

  it("no repite preguntas: avanza por turno", async () => {
    const first = await provider.nextQuestion(ctx({ answers: [] }));
    const second = await provider.nextQuestion(
      ctx({ answers: [{ question: "q1", answer: "a1" }] })
    );
    expect(first.type).toBe("question");
    expect(second.type).toBe("question");
    if (first.type === "question" && second.type === "question") {
      expect(second.question).not.toBe(first.question);
    }
  });

  it("termina al alcanzar el maximo de preguntas", async () => {
    const answers = Array.from({ length: 5 }, (_, i) => ({ question: `q${i}`, answer: `a${i}` }));
    const result = await provider.nextQuestion(ctx({ answers, maxQuestions: 5 }));
    expect(result).toEqual({ type: "done" });
  });
});
