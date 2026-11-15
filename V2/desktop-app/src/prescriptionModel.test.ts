import assert from "node:assert/strict";
import test from "node:test";
import { addsInformation, genericBlockText, genericLine, type PrescriptionItem } from "./prescriptionModel.ts";

const base: PrescriptionItem = {
  line: "Paracetamol 500 mg tabletas",
  brand: null,
  generic: "Paracetamol",
  ingredient_ids: ["paracetamol"],
  cnis_description: "Paracetamol 500 mg tableta",
  cnis_product: "010.000.0104",
  cnis_clave: "010.000.0104.00",
  cnis_version: "2025-04-26"
};

test("un generico con clave muestra la denominacion del CNIS y la clave completa", () => {
  assert.equal(genericLine(base), "Paracetamol 500 mg tableta · CNIS 010.000.0104.00");
});

test("una marca se traduce a su generico", () => {
  assert.equal(
    genericLine({ ...base, line: "Fictimed 500 mg", brand: "Fictimed" }),
    "Fictimed → Paracetamol 500 mg tableta · CNIS 010.000.0104.00"
  );
});

test("sin clave completa usa la del producto; sin ninguna, solo el nombre", () => {
  assert.equal(genericLine({ ...base, cnis_clave: null }), "Paracetamol 500 mg tableta · CNIS 010.000.0104");
  const combination: PrescriptionItem = {
    ...base,
    brand: "Mezclafic",
    generic: "Paracetamol + Ibuprofeno",
    cnis_description: null,
    cnis_product: null,
    cnis_clave: null
  };
  assert.equal(genericLine(combination), "Mezclafic → Paracetamol + Ibuprofeno");
});

test("el bloque solo lleva lo que agrega informacion", () => {
  const plain: PrescriptionItem = { ...base, cnis_description: null, cnis_product: null, cnis_clave: null };
  assert.equal(addsInformation(plain), false);
  assert.equal(genericBlockText([plain]), "");
  assert.equal(genericBlockText(undefined), "");
  assert.equal(
    genericBlockText([base, plain, { ...base, brand: "Fictimed" }]),
    "Paracetamol 500 mg tableta · CNIS 010.000.0104.00\nFictimed → Paracetamol 500 mg tableta · CNIS 010.000.0104.00"
  );
});
