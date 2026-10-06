import assert from "node:assert/strict";
import { test } from "node:test";
import { shortHash, toPdfSafe, wrapText } from "./pdfText.ts";

// Medida simple: 1 unidad por caracter.
const byChars = (line: string) => line.length;

test("conserva el espanol y traduce lo que la fuente estandar no tiene", () => {
  assert.equal(toPdfSafe("Niño de 8 años, ¿fiebre? 38.5 °C"), "Niño de 8 años, ¿fiebre? 38.5 °C");
  assert.equal(toPdfSafe("PA ≥ 140 → control"), "PA >= 140 -> control");
  assert.equal(toPdfSafe("dosis 5 µg"), "dosis 5 µg", "µ esta en Latin-1");
  assert.equal(toPdfSafe("emoji 😀 y 中"), "emoji ? y ?");
  assert.equal(toPdfSafe("“comillas” – raya"), "“comillas” – raya");
});

test("ajusta por palabras respetando los saltos del medico", () => {
  assert.deepEqual(wrapText("uno dos tres cuatro", 9, byChars), ["uno dos", "tres", "cuatro"]);
  assert.deepEqual(wrapText("linea 1\nlinea 2", 20, byChars), ["linea 1", "linea 2"]);
  assert.deepEqual(wrapText("a\n\nb", 20, byChars), ["a", "", "b"]);
});

test("corta palabras que no caben solas", () => {
  assert.deepEqual(wrapText("abcdefghij", 4, byChars), ["abcd", "efgh", "ij"]);
});

test("sin texto no hay lineas", () => {
  assert.deepEqual(wrapText("", 10, byChars), []);
  assert.deepEqual(wrapText("   \n  ", 10, byChars), []);
});

test("acorta la huella para el pie", () => {
  assert.equal(shortHash(null), "");
  assert.equal(shortHash("a".repeat(64)), `${"a".repeat(12)}…${"a".repeat(6)}`);
});
