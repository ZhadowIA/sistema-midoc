import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalStrength, isSingleIngredient, normalize, parseCnisText, toCsv } from "./catalog.ts";

// Fragmentos con el acomodo real de `pdftotext -layout` del CNIS.
const TEXT = [
  "PARACETAMOL",
  "",
  "Clave                          Descripción                           Indicaciones           Vía de administración",
  "                 TABLETA                              Dolor leve.                  Oral.",
  "                 Cada tableta contiene:               Fiebre.                      Adultos:",
  "                 Paracetamol 500 mg.",
  "010.000.0104.00  Envase con 10 tabletas.",
  "                 SOLUCIÓN INYECTABLE",
  "                 Cada frasco ámpula contiene:",
  "                 Paracetamol 1 g.",
  "010.000.5721.00  Envase con 1 frasco.",
  "010.000.5721.01  Envase con 2 frascos.",
  "",
  "Generalidades",
  "CILOSTAZOL                     Descripción                             Indicaciones                  Vía",
  "                 TABLETA                                                                     Oral.",
  "        Clave                                              Claudicación intermitente en",
  "                 Cada tableta contiene:                    pacientes con enfermedad          Adultos:",
  "010.000.4307.00  Cilostazol 100 mg.                        arterial periférica.",
  "",
  "Generalidades",
  "LEVETIRACETAM",
  "",
  "Clave                          Descripción                    Indicaciones",
  "                 TABLETA",
  "                 Cada tableta contiene:",
  "                 Levetiracetam              1 000 mg.",
  "010.000.2618.00 Envase con 30 tabletas.",
  "",
  "Generalidades",
  "FELODIPINO                Descripción                           Indicaciones",
  "                                                       Angina de pecho",
  "        Clave    TABLETA     DE          LIBERACIÓN",
  "                 PROLONGADA",
  "                 Cada tableta contiene:",
  "                 Felodipino 5 mg.",
  "010.000.2114.00  Envase con 10 tabletas.",
  "",
  "Generalidades",
  "LIDOCAÍNA                       Descripción                     Indicaciones                      Vía",
  "                 SOLUCIÓN INYECTABLE AL 1%         Anestesia local.                      Intravenosa.",
  "        Clave",
  "010.000.0261.00  Cada frasco ámpula contiene:      Anestesia epidural caudal.            Adultos:",
  "010.000.0262.00  Clorhidrato de Lidocaína 500 mg.",
  "",
  "Generalidades",
  "METFORMINA/ GLIBENCLAMIDA",
  "",
  "Clave                          Descripción                    Indicaciones",
  "                 TABLETA",
  "                 Cada tableta contiene:",
  "                 Clorhidrato de metformina 500 mg.",
  "                 Glibenclamida 2.5 mg",
  "010.000.6273.00 Envase con 30 tabletas.",
  "",
  "Otra seccion del compendio repite el producto 5721 con un envase ilegible:",
  "PARACETAMOL",
  "",
  "Clave                          Descripción                    Indicaciones",
  "                 SOLUCIÓN INYECTABLE",
  "                 Cada frasco ámpula contiene:",
  "                 Envase con 4 frascos.",
  "010.000.5721.02"
].join("\n");

const entries = parseCnisText(TEXT);
const byKey = (clave: string) => {
  const entry = entries.find((e) => e.clave === clave);
  assert.ok(entry, clave);
  return entry;
};

test("normaliza texto y concentraciones", () => {
  assert.equal(normalize("  Ácido  Acetilsalicílico "), "acido acetilsalicilico");
  assert.deepEqual(canonicalStrength("1", "g"), { value: "1000", unit: "mg" });
  assert.deepEqual(canonicalStrength("0.500", "mg"), { value: "0.5", unit: "mg" });
  assert.deepEqual(canonicalStrength("1 000", "mg"), { value: "1000", unit: "mg" });
  assert.deepEqual(canonicalStrength("100", "µg"), { value: "100", unit: "mcg" });
  assert.deepEqual(canonicalStrength("2,5", "mg"), { value: "2.5", unit: "mg" });
});

test("lee generico, forma y concentracion de una clave limpia", () => {
  assert.deepEqual(byKey("010.000.0104.00"), {
    clave: "010.000.0104.00",
    product: "0104",
    generic: "paracetamol",
    form: "tableta",
    strengthValue: "500",
    strengthUnit: "mg",
    packages: 1,
    complete: true
  });
});

test("el generico en la linea del encabezado no hereda el anterior", () => {
  const e = byKey("010.000.4307.00");
  assert.equal(e.generic, "cilostazol");
  assert.equal(e.strengthValue, "100");
  assert.equal(e.complete, true);
});

test("une la concentracion separada y los miles con espacio", () => {
  const e = byKey("010.000.2618.00");
  assert.equal(e.strengthValue, "1000");
  assert.equal(e.complete, true);
});

test("une la forma justificada en varios trozos", () => {
  const e = byKey("010.000.2114.00");
  assert.equal(e.form, "tableta de liberacion prolongada");
  assert.equal(e.complete, true);
});

test("claves de productos distintos en un mismo bloque quedan incompletas", () => {
  assert.equal(byKey("010.000.0261.00").complete, false);
  assert.equal(byKey("010.000.0262.00").complete, false);
});

test("las combinaciones no se codifican", () => {
  assert.equal(isSingleIngredient("METFORMINA/ GLIBENCLAMIDA"), false);
  assert.equal(isSingleIngredient("CLORFENAMINA COMPUESTA"), false);
  assert.equal(isSingleIngredient("PARACETAMOL"), true);
  assert.equal(byKey("010.000.6273.00").complete, false);
});

test("cuenta los envases del producto y completa el envase ilegible con sus hermanos", () => {
  for (const clave of ["010.000.5721.00", "010.000.5721.01", "010.000.5721.02"]) {
    const e = byKey(clave);
    assert.equal(e.packages, 3, clave);
    assert.equal(e.strengthValue, "1000", clave);
    assert.equal(e.complete, true, clave);
  }
});

test("el CSV es estable y con encabezado", () => {
  const csv = toCsv(entries);
  const lines = csv.trimEnd().split("\n");
  assert.equal(lines[0], "clave,product,generic,form,strength_value,strength_unit,packages,complete");
  assert.equal(lines[1].split(",")[0], "010.000.0104.00");
  assert.ok(lines.includes("010.000.0104.00,0104,paracetamol,tableta,500,mg,1,1"));
});
