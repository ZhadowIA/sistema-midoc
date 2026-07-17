import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDateFlexible, parseDateFlexible } from "./dateOnly.ts";

test("una fecha sin hora se parsea como fecha local, no UTC", () => {
  const parsed = parseDateFlexible("2005-08-05");
  // Componentes locales exactos: 5 de agosto, sin corrimiento por zona.
  assert.equal(parsed.getFullYear(), 2005);
  assert.equal(parsed.getMonth(), 7);
  assert.equal(parsed.getDate(), 5);
});

test("formatDateFlexible muestra el dia correcto en es-MX", () => {
  // El bug original: "2005-08-05" se mostraba como "4 ago 2005" en UTC-6/7.
  assert.match(formatDateFlexible("2005-08-05"), /5 ago 2005/);
  assert.match(formatDateFlexible(" 2026-01-01 "), /1 ene 2026/);
});

test("los timestamps completos conservan su parseo normal", () => {
  const iso = "2026-07-09T15:30:00Z";
  assert.equal(parseDateFlexible(iso).getTime(), new Date(iso).getTime());
});

test("valores invalidos se devuelven tal cual, sin NaN visible", () => {
  assert.equal(formatDateFlexible("no-es-fecha"), "no-es-fecha");
});
