import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { compatibilityLabel } from "./clinicalAid.ts";

test("traduce niveles de compatibilidad sin porcentajes", () => {
  assert.equal(compatibilityLabel("HIGH"), "Alta");
  assert.equal(compatibilityLabel("MEDIUM"), "Media");
  assert.equal(compatibilityLabel("LOW"), "Baja");
});

test("el riel derecho termina en Ayuda IA y no repite información del paciente debajo", () => {
  const source = readFileSync(new URL("./Atencion.tsx", import.meta.url), "utf8");
  const aside = source.match(
    /<aside className="encounter-context"[\s\S]*?<\/aside>/
  )?.[0];

  assert.ok(aside, "debe existir el riel derecho de consulta");
  assert.doesNotMatch(aside, /alert-allergies|context-block|Consultas previas|Preconsulta \(IA\)/);
});
