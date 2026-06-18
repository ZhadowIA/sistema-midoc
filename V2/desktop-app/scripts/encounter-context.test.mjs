import assert from "node:assert/strict";
import {
  allergyText,
  buildContextHistory,
  isFirstVisit
} from "../src/encounterContext.ts";

// allergyText: solo alerta cuando hay contenido real.
assert.equal(allergyText(null), null);
assert.equal(allergyText(undefined), null);
assert.equal(allergyText("   "), null);
assert.equal(allergyText("Penicilina, AINEs"), "Penicilina, AINEs");
assert.equal(allergyText("  Sulfas  "), "Sulfas");

// buildContextHistory: fecha formateada vs (sin firmar) y respaldo de diagnóstico.
const fmt = (iso) => `D:${iso}`;
const rows = buildContextHistory(
  [
    { encounter_id: "e1", signed_at: "2026-03-12", diagnosis: "Hipertension" },
    { encounter_id: "e2", signed_at: null, diagnosis: "" }
  ],
  fmt
);
assert.equal(rows.length, 2);
assert.deepEqual(rows[0], { encounterId: "e1", when: "D:2026-03-12", diagnosis: "Hipertension" });
assert.equal(rows[1].when, null);
assert.equal(rows[1].diagnosis, "Sin diagnostico registrado");

// limita la cantidad de filas mostradas en el panel.
const many = Array.from({ length: 8 }, (_, i) => ({
  encounter_id: `e${i}`,
  signed_at: "2026-01-01",
  diagnosis: "x"
}));
assert.equal(buildContextHistory(many, fmt).length, 5);
assert.equal(buildContextHistory(many, fmt, 3).length, 3);

// isFirstVisit
assert.equal(isFirstVisit([]), true);
assert.equal(isFirstVisit([{ encounter_id: "e1", signed_at: null, diagnosis: "" }]), false);

console.log("encounter-context.test.mjs OK");
