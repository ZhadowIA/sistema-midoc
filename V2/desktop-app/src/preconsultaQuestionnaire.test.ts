import assert from "node:assert/strict";
import test from "node:test";
import {
  QUESTIONNAIRE_TEMPLATES,
  cleanForPublish,
  conditionValues,
  emptyQuestionnaire,
  moveQuestion,
  newQuestion,
  removeQuestion,
  samePublished,
  newQuestionId,
  validateQuestionnaire,
  visibleQuestions,
  type PreconsultaQuestionnaire
} from "./preconsultaQuestionnaire.ts";

test("las plantillas son validas", () => {
  for (const template of Object.values(QUESTIONNAIRE_TEMPLATES)) {
    assert.deepEqual(validateQuestionnaire(template), []);
  }
  assert.deepEqual(validateQuestionnaire(emptyQuestionnaire()), []);
});

test("genera ids legibles y sin repetir", () => {
  assert.equal(newQuestionId("¿Desde cuándo?", []), "desde_cuando");
  assert.equal(newQuestionId("¿Desde cuándo?", ["desde_cuando"]), "desde_cuando_2");
  assert.equal(newQuestionId("¿?", []), "pregunta");
  assert.ok(newQuestionId("x".repeat(100), []).length <= 40);
});

test("explica al medico lo que impide publicar", () => {
  const broken: PreconsultaQuestionnaire = {
    schemaVersion: 1,
    questions: [
      { id: "a", label: "", type: "single_choice", required: false, options: ["Una"] },
      { id: "b", label: "B", type: "short_text", required: false, options: ["X", "Y"] },
      { id: "c", label: "C", type: "yes_no", required: false, showWhen: { questionId: "d", equals: "si" } },
      { id: "d", label: "D", type: "yes_no", required: false },
      { id: "e", label: "E", type: "short_text", required: false, showWhen: { questionId: "d", equals: "quiza" } },
      { id: "e", label: "E", type: "short_text", required: false }
    ]
  };
  const errors = validateQuestionnaire(broken);
  assert.ok(errors.includes("Pregunta 1: escribe la pregunta."));
  assert.ok(errors.includes("Pregunta 1: necesita al menos dos opciones."));
  assert.ok(!errors.some((e) => e.startsWith("Pregunta 2")), "las opciones sobrantes se quitan al publicar");
  assert.ok(errors.includes("Pregunta 3: la condición debe depender de una pregunta anterior."));
  assert.ok(errors.includes("Pregunta 5: la condición usa una respuesta que ya no existe."));
  assert.ok(errors.includes("Pregunta 6: identificador repetido."));
});

test("las condiciones muestran preguntas en cadena", () => {
  const general = QUESTIONNAIRE_TEMPLATES.general;
  const ids = (answers: Record<string, string | string[]>) => visibleQuestions(general, answers).map((q) => q.id);
  assert.ok(!ids({}).includes("dolor_intensidad"));
  assert.ok(ids({ dolor: "si" }).includes("dolor_intensidad"));
  assert.ok(!ids({ dolor: "no" }).includes("dolor_donde"));

  const chain: PreconsultaQuestionnaire = {
    schemaVersion: 1,
    questions: [
      { id: "a", label: "A", type: "yes_no", required: false },
      { id: "b", label: "B", type: "multi_choice", required: false, options: ["X", "Y"], showWhen: { questionId: "a", equals: "si" } },
      { id: "c", label: "C", type: "short_text", required: false, showWhen: { questionId: "b", equals: "Y" } }
    ]
  };
  assert.deepEqual(visibleQuestions(chain, { a: "si", b: ["Y"] }).map((q) => q.id), ["a", "b", "c"]);
  // Si la pregunta de la que depende se oculta, la dependiente tambien.
  assert.deepEqual(visibleQuestions(chain, { a: "no", b: ["Y"] }).map((q) => q.id), ["a"]);
  assert.deepEqual(conditionValues(chain.questions[0]), ["si", "no"]);
});

test("al publicar quita lo vacio y las opciones sobrantes", () => {
  const cleaned = cleanForPublish({
    schemaVersion: 1,
    title: "  ",
    questions: [
      { id: "a", label: " A ", help: "  ", type: "short_text", required: true, options: ["vieja"] },
      { id: "b", label: "B", type: "single_choice", required: false, options: [" X ", "Y"] }
    ]
  });
  assert.deepEqual(cleaned, {
    schemaVersion: 1,
    questions: [
      { id: "a", label: "A", type: "short_text", required: true },
      { id: "b", label: "B", type: "single_choice", required: false, options: ["X", "Y"] }
    ]
  });
});

test("quitar y mover preguntas", () => {
  const general = QUESTIONNAIRE_TEMPLATES.general;
  const without = removeQuestion(general, "dolor");
  assert.ok(!without.questions.some((q) => q.id === "dolor"));
  assert.ok(without.questions.every((q) => q.showWhen?.questionId !== "dolor"), "sin condiciones huerfanas");
  assert.deepEqual(validateQuestionnaire(without), []);

  const moved = moveQuestion(general, 3, -1);
  assert.equal(moved.questions[2].id, "dolor_intensidad");
  assert.ok(validateQuestionnaire(moved).some((e) => e.includes("pregunta anterior")));
  assert.equal(moveQuestion(general, 0, -1), general, "no se sale del inicio");

  const fresh = newQuestion({ schemaVersion: 1, questions: [{ id: "pregunta", label: "X", type: "short_text", required: false }] });
  assert.equal(fresh.id, "pregunta_2");
});

test("compara lo publicado sin importar el orden de las llaves", () => {
  const draft = QUESTIONNAIRE_TEMPLATES.odontologia;
  const scrambled = {
    questions: cleanForPublish(draft).questions.map((q) => Object.fromEntries(Object.entries(q).reverse())),
    title: draft.title,
    schemaVersion: 1
  };
  assert.equal(samePublished(draft, scrambled), true);
  assert.equal(samePublished(draft, null), false);
  assert.equal(samePublished({ ...draft, title: "Otro" }, scrambled), false);
});
