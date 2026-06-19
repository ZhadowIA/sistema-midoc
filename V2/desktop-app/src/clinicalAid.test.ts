import assert from "node:assert/strict";
import { test } from "node:test";
import { compatibilityLabel } from "./clinicalAid.ts";

test("traduce niveles de compatibilidad sin porcentajes", () => {
  assert.equal(compatibilityLabel("HIGH"), "Alta");
  assert.equal(compatibilityLabel("MEDIUM"), "Media");
  assert.equal(compatibilityLabel("LOW"), "Baja");
});
