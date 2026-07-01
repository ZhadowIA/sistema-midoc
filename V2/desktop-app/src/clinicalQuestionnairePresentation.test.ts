import assert from "node:assert/strict";
import { test } from "node:test";

import { buildPreconsultaPresentation } from "./clinicalQuestionnairePresentation.ts";

test("separa el motivo y las preguntas de la entrevista guiada", () => {
  const result = buildPreconsultaPresentation(
    JSON.stringify({
      motivo: "Revisión",
      conversation: [
        { question: "¿Desde cuándo?", answer: "Cinco días" },
        { question: "", answer: "Sin fiebre" }
      ]
    })
  );

  assert.deepEqual(result, {
    motivo: "Revisión",
    questions: [
      { question: "¿Desde cuándo?", answer: "Cinco días" },
      { question: "Pregunta 2", answer: "Sin fiebre" }
    ],
    legacyRows: []
  });
});

test("conserva las respuestas legadas como filas clínicas", () => {
  const result = buildPreconsultaPresentation(
    JSON.stringify({
      sex: "M",
      currentMedications: "Paracetamol"
    })
  );

  assert.equal(result.motivo, "");
  assert.deepEqual(result.questions, []);
  assert.deepEqual(result.legacyRows, [
    ["Sexo biologico", "Masculino"],
    ["Medicamentos cronicos", "Paracetamol"]
  ]);
});

test("presenta texto no JSON como una respuesta legada", () => {
  assert.deepEqual(buildPreconsultaPresentation("Texto recibido"), {
    motivo: "",
    questions: [],
    legacyRows: [["Respuestas", "Texto recibido"]]
  });
});
