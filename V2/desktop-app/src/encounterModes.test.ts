import assert from "node:assert/strict";
import { test } from "node:test";
import { buildEncounterModes, resolveActiveSection } from "./encounterModes.ts";

const base = { hasPreconsulta: false, hasHistory: false, moduleLabel: "Modulo odontologico" };

test("los documentos estan en la ruta de la consulta, antes y despues de firmar", () => {
  const open = buildEncounterModes({ ...base, signed: false }).map((mode) => mode.id);
  assert.deepEqual(open, ["antecedentes", "ia", "nota", "modulo", "receta", "documentos", "ayuda"]);

  const signed = buildEncounterModes({ ...base, signed: true }).map((mode) => mode.id);
  assert.deepEqual(signed, ["antecedentes", "nota", "modulo", "receta", "documentos"]);
});

test("la seccion de documentos sigue activa al firmar; la IA recae en la nota", () => {
  const signed = buildEncounterModes({ ...base, signed: true });
  assert.equal(resolveActiveSection(signed, "documentos"), "documentos");
  assert.equal(resolveActiveSection(signed, "ayuda"), "nota");
});
