import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computePlaqueIndex,
  hasPlaque,
  plaqueClassification,
  togglePlaqueSurface
} from "./plaqueIndex.ts";
import {
  coerceDentalPayload,
  DENTAL_TOOTH_IDS,
  EMPTY_DENTAL_PAYLOAD,
  type DentalPayload
} from "./clinicalProfiles.ts";

function payloadWith(partial: Partial<DentalPayload>): DentalPayload {
  return { ...EMPTY_DENTAL_PAYLOAD, ...partial };
}

test("togglePlaqueSurface marca, desmarca y limpia la pieza sin caras", () => {
  const marked = togglePlaqueSurface(EMPTY_DENTAL_PAYLOAD, "16", "M");
  assert.ok(hasPlaque(marked, "16", "M"));
  assert.ok(!hasPlaque(marked, "16", "D"));
  // Inmutable: el original no cambia.
  assert.deepEqual(EMPTY_DENTAL_PAYLOAD.plaque, {});

  const both = togglePlaqueSurface(marked, "16", "V");
  assert.deepEqual(both.plaque["16"], ["M", "V"]);

  const unmarked = togglePlaqueSurface(togglePlaqueSurface(both, "16", "M"), "16", "V");
  assert.equal(unmarked.plaque["16"], undefined);
});

test("computePlaqueIndex: porcentaje sobre piezas presentes por 4 caras", () => {
  let payload = payloadWith({});
  for (const face of ["M", "D", "V", "L"] as const) {
    payload = togglePlaqueSurface(payload, "16", face);
  }
  payload = togglePlaqueSurface(payload, "17", "M");
  // 32 piezas presentes x 4 = 128 caras; 5 con placa = 3.9%
  const result = computePlaqueIndex(payload, DENTAL_TOOTH_IDS);
  assert.equal(result.presentSurfaces, 128);
  assert.equal(result.markedSurfaces, 5);
  assert.equal(result.percent, 3.9);
});

test("las piezas ausentes salen del denominador y del numerador", () => {
  let payload = payloadWith({
    odontogram: {
      "16": { status: "MISSING", surfaces: {}, notes: "" }
    }
  });
  payload = togglePlaqueSurface(payload, "16", "M"); // marca sobre ausente: no cuenta
  payload = togglePlaqueSurface(payload, "17", "M");
  const result = computePlaqueIndex(payload, ["16", "17"]);
  assert.equal(result.presentSurfaces, 4);
  assert.equal(result.markedSurfaces, 1);
  assert.equal(result.percent, 25);
});

test("sin piezas presentes el porcentaje es null, no division entre cero", () => {
  const payload = payloadWith({
    odontogram: { "16": { status: "MISSING", surfaces: {}, notes: "" } }
  });
  assert.equal(computePlaqueIndex(payload, ["16"]).percent, null);
  assert.equal(computePlaqueIndex(payload, []).percent, null);
});

test("clasificacion O'Leary: ideal hasta 10, aceptable hasta 20, deficiente arriba", () => {
  assert.deepEqual(plaqueClassification(0), { label: "Ideal", tone: "good" });
  assert.deepEqual(plaqueClassification(10), { label: "Ideal", tone: "good" });
  assert.deepEqual(plaqueClassification(15.5), { label: "Aceptable", tone: "warn" });
  assert.deepEqual(plaqueClassification(20), { label: "Aceptable", tone: "warn" });
  assert.deepEqual(plaqueClassification(20.1), { label: "Deficiente", tone: "bad" });
});

test("coerceDentalPayload: retrocompatible y filtra caras invalidas", () => {
  // Payload viejo sin seccion de placa.
  const legacy = coerceDentalPayload({ odontogram: {}, hygienePlan: "cepillado" });
  assert.deepEqual(legacy.plaque, {});
  assert.equal(legacy.hygienePlan, "cepillado");

  // La oclusal no participa del O'Leary; basura y duplicados se filtran.
  const dirty = coerceDentalPayload({
    plaque: { "16": ["M", "O", "M", "X", "L"], "17": ["O"], "18": "no-array" }
  });
  assert.deepEqual(dirty.plaque, { "16": ["M", "L"] });
});
