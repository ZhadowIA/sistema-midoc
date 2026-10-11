import assert from "node:assert/strict";
import { test } from "node:test";

import { historyDiagnosis } from "./historyModel.ts";

const base = { encounter_id: "e1", signed_at: null, status: "SIGNED" };

test("muestra el texto libre y los codigos CIE-10 con el principal primero", () => {
  assert.deepEqual(
    historyDiagnosis({
      ...base,
      diagnosis: "Crisis asmatica",
      coded_diagnoses: [
        { code: "M545", name: "LUMBAGO NO ESPECIFICADO", principal: false },
        { code: "J459", name: "ASMA, NO ESPECIFICADO", principal: true }
      ]
    }),
    { text: "Crisis asmatica", codes: ["J45.9 ASMA, NO ESPECIFICADO", "M54.5 LUMBAGO NO ESPECIFICADO"] }
  );
});

test("con solo codigos no dice que falta el diagnostico", () => {
  assert.deepEqual(
    historyDiagnosis({ ...base, diagnosis: "  ", coded_diagnoses: [{ code: "J459", name: "ASMA", principal: true }] }),
    { text: "", codes: ["J45.9 ASMA"] }
  );
});

test("sin diagnostico alguno lo dice; una app anterior no manda codigos", () => {
  assert.deepEqual(historyDiagnosis({ ...base, diagnosis: "" }), {
    text: "Sin diagnóstico registrado",
    codes: []
  });
});
