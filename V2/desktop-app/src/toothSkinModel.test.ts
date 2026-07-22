import assert from "node:assert/strict";
import { test } from "node:test";
import { vendorToothPlacement } from "./toothSkinModel.ts";

test("elige una de las cuatro plantillas MIT por posicion FDI", () => {
  assert.equal(vendorToothPlacement("11")?.template, "11");
  assert.equal(vendorToothPlacement("12")?.template, "11");
  assert.equal(vendorToothPlacement("13")?.template, "13");
  assert.equal(vendorToothPlacement("14")?.template, "14");
  assert.equal(vendorToothPlacement("15")?.template, "14");
  assert.equal(vendorToothPlacement("16")?.template, "16");
  assert.equal(vendorToothPlacement("18")?.template, "16");
});

test("conserva la orientacion por cuadrante dentro del volteo de cada arcada", () => {
  assert.equal(vendorToothPlacement("11")?.mirrorWithinArch, false);
  assert.equal(vendorToothPlacement("21")?.mirrorWithinArch, true);
  assert.equal(vendorToothPlacement("31")?.mirrorWithinArch, true);
  assert.equal(vendorToothPlacement("41")?.mirrorWithinArch, false);
});

test("reutiliza el cuadrante equivalente para denticion temporal", () => {
  assert.deepEqual(vendorToothPlacement("51"), vendorToothPlacement("11"));
  assert.deepEqual(vendorToothPlacement("63"), vendorToothPlacement("23"));
  assert.deepEqual(vendorToothPlacement("74"), vendorToothPlacement("34"));
  assert.deepEqual(vendorToothPlacement("85"), vendorToothPlacement("45"));
});

test("rechaza identificadores que no son piezas FDI soportadas", () => {
  assert.equal(vendorToothPlacement("09"), null);
  assert.equal(vendorToothPlacement("99"), null);
  assert.equal(vendorToothPlacement("1"), null);
  assert.equal(vendorToothPlacement("abc"), null);
});
