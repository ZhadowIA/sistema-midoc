import assert from "node:assert/strict";
import { buildEncounterModes, resolveActiveSection } from "../src/encounterModes.ts";

const ids = (modes) => modes.map((m) => m.id);

// Caso completo, sin firmar, con preconsulta e historial.
const full = buildEncounterModes({
  hasPreconsulta: true,
  hasHistory: true,
  signed: false,
  moduleLabel: "Modulo odontologico"
});
assert.deepEqual(ids(full), [
  "preconsulta",
  "historial",
  "antecedentes",
  "ia",
  "nota",
  "modulo",
  "receta"
]);
assert.equal(full.find((m) => m.id === "modulo").label, "Modulo odontologico");

// Sin preconsulta ni historial: esos modos no aparecen.
const lean = buildEncounterModes({
  hasPreconsulta: false,
  hasHistory: false,
  signed: false,
  moduleLabel: "Modulo general"
});
assert.deepEqual(ids(lean), ["antecedentes", "ia", "nota", "modulo", "receta"]);

// Firmada: desaparece la asistencia de IA.
const signed = buildEncounterModes({
  hasPreconsulta: true,
  hasHistory: false,
  signed: true,
  moduleLabel: "Modulo general"
});
assert.equal(signed.some((m) => m.id === "ia"), false);

// resolveActiveSection: respeta el activo si existe; si no, cae en nota.
assert.equal(resolveActiveSection(full, "receta"), "receta");
assert.equal(resolveActiveSection(signed, "ia"), "nota"); // ia ya no existe

console.log("encounter-modes.test.mjs OK");
