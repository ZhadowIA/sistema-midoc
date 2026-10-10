import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_CODED_DIAGNOSES,
  addDiagnosis,
  displayCode,
  nextActiveIndex,
  removeDiagnosis,
  setPrincipal,
  type CodedDiagnosis
} from "./cie10Model.ts";

const asma = { code: "J459", name: "ASMA, NO ESPECIFICADO" };
const lumbago = { code: "M545", name: "LUMBAGO NO ESPECIFICADO" };

test("muestra la clave con punto solo en subcategorias", () => {
  assert.equal(displayCode("J459"), "J45.9");
  assert.equal(displayCode("A09"), "A09");
});

test("el primer diagnostico es principal y no se repiten", () => {
  let list: CodedDiagnosis[] = [];
  list = addDiagnosis(list, asma);
  list = addDiagnosis(list, lumbago);
  list = addDiagnosis(list, asma);
  assert.deepEqual(
    list.map((d) => [d.code, d.principal]),
    [
      ["J459", true],
      ["M545", false]
    ]
  );
});

test("cambiar el principal deja uno solo", () => {
  const list = setPrincipal(addDiagnosis(addDiagnosis([], asma), lumbago), "M545");
  assert.deepEqual(
    list.map((d) => d.principal),
    [false, true]
  );
});

test("al quitar el principal, el siguiente toma su lugar", () => {
  const list = removeDiagnosis(addDiagnosis(addDiagnosis([], asma), lumbago), "J459");
  assert.deepEqual(list, [{ ...lumbago, principal: true }]);
  assert.deepEqual(removeDiagnosis(list, "M545"), []);
});

test("respeta el maximo de diagnosticos por nota", () => {
  let list: CodedDiagnosis[] = [];
  for (let i = 0; i < MAX_CODED_DIAGNOSES + 3; i += 1) {
    list = addDiagnosis(list, { code: `A0${i}`, name: `X${i}` });
  }
  assert.equal(list.length, MAX_CODED_DIAGNOSES);
});

test("las flechas recorren los resultados dando la vuelta", () => {
  assert.equal(nextActiveIndex(-1, 3, "ArrowDown"), 0);
  assert.equal(nextActiveIndex(2, 3, "ArrowDown"), 0);
  assert.equal(nextActiveIndex(0, 3, "ArrowUp"), 2);
  assert.equal(nextActiveIndex(0, 0, "ArrowDown"), -1);
});
