import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { compatibilityLabel } from "./clinicalAid.ts";

test("traduce niveles de compatibilidad sin porcentajes", () => {
  assert.equal(compatibilityLabel("HIGH"), "Alta");
  assert.equal(compatibilityLabel("MEDIUM"), "Media");
  assert.equal(compatibilityLabel("LOW"), "Baja");
});

test("la Ayuda IA es una ruta de la consulta, no un riel lateral", () => {
  const source = readFileSync(new URL("./Atencion.tsx", import.meta.url), "utf8");

  // Ya no debe existir el riel de contexto a la derecha: la asistencia migró a
  // una ruta más dentro del centro de la consulta.
  assert.doesNotMatch(source, /consultation-context-rail/);

  // El ClinicalAidRail se renderiza cuando la ruta activa es "ayuda".
  assert.match(
    source,
    /resolvedSection === "ayuda" \?[\s\S]*?<ClinicalAidRail/
  );
});
