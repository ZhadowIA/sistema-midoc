import assert from "node:assert/strict";
import { test } from "node:test";
import {
  allKeys,
  alternatives,
  applyCorrections,
  canonicalStrength,
  displayAlternatives,
  uninvert,
  diffTables,
  genericName,
  isSingleIngredient,
  normalize,
  parseCnisText,
  parseCorrections,
  toCsv
} from "./catalog.ts";

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
  "                 Envase con 30 tabletas.",
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
  "Generalidades",
  // Nota entre parentesis en el nombre y concentracion antes del nombre.
  "AMLODIPINO (Acceso)",
  "",
  "Clave                          Descripción                    Indicaciones",
  "                 TABLETA O CAPSULA",
  "                                                          Hipertensión",
  "                                                          sistémica.",
  "                 Cada tableta o capsula contiene:",
  "                 Besilato o Maleato de                    Angina de pecho",
  "                 amlodipino",
  "                 equivalente a 5 mg",
  "                 de Amlodipino.",
  "010.000.2111.00  Envase con 10 tabletas o cápsulas.",
  "010.000.2111.01  Envase con 30 tabletas o cápsulas.",
  "",
  "Generalidades",
  // Alternativas en un mismo producto, cada una con su concentracion.
  "PANTOPRAZOL O RABEPRAZOL U OMEPRAZOL",
  "",
  "Clave                              Descripción                   Indicaciones",
  "                  TABLETA O GRAGEA O CÁPSULA            Úlcera péptica.",
  "                  Cada tableta o gragea o cápsula       Úlcera gástrica.",
  "                  contiene:                             Úlcera duodenal.",
  "                  Pantoprazol 40 mg. o                  Esofagitis por reflujo.",
  "                  Rabeprazol sódico 20 mg. u",
  "                  Omeprazol 20 mg.",
  "010.000.5186.00   Envase con 7 tabletas o grageas o     Síndrome de Zollinger-",
  "010.000.5186.01",
  "                  Envase con 14 tabletas o grageas o",
  "",
  "Generalidades",
  // Grupo 040 (psicotropicos) y "Caja con".
  "CLONAZEPAM",
  "",
  "Clave                          Descripción                    Indicaciones",
  "                 TABLETA",
  "                 Cada tableta contiene:",
  "                 Clonazepam 2 mg.",
  "040.000.2612.00  Caja con 30 tabletas.",
  "",
  // Clave en la linea de la forma, con su descripcion despues.
  "AMOXICILINA (Acceso)",
  "",
  "       Clave                      Descripción                      Indicaciones",
  "010.000.2127.00  SUSPENSIÓN ORAL                                                                                Oral.",
  "                                                             Infecciones por bacterias",
  "                 Cada frasco con polvo contiene:                                                                Adultos:",
  "                 Amoxicilina trihidratada equivalente a      gram                                    negativas",
  "                 7.5 g de amoxicilina.",
  "                 Envase con polvo para 75 mL",
  "                 CÁPSULA",
  "                 Cada cápsula contiene:",
  "                 Amoxicilina trihidratada equivalente a",
  "                 500 mg de amoxicilina.",
  "010.000.2128.00  Envase con 12 cápsulas.",
  "010.000.2128.01  Envase con 15 cápsulas.",
  "Generalidades",
  "Otra seccion del compendio repite el producto 5721 con un envase ilegible:",
  "PARACETAMOL (continúa)",
  "",
  "Clave                          Descripción                    Indicaciones",
  "                 SOLUCIÓN INYECTABLE",
  "                 Cada frasco ámpula contiene:",
  "                 Envase con 4 frascos.",
  "010.000.5721.02"
].join("\n");

const entries = parseCnisText(TEXT);
const row = (clave: string, generic?: string) => {
  const entry = entries.find((e) => e.clave === clave && (!generic || e.generic === generic));
  assert.ok(entry, `${clave} ${generic ?? ""}`);
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

test("reconoce genericos con notas y sus alternativas", () => {
  assert.equal(genericName("AMOXICILINA (Acceso)"), "AMOXICILINA");
  assert.equal(genericName("PARACETAMOL (continúa)"), "PARACETAMOL");
  assert.equal(genericName("Generalidades"), null);
  assert.deepEqual(alternatives("PANTOPRAZOL O RABEPRAZOL U OMEPRAZOL"), ["pantoprazol", "rabeprazol", "omeprazol"]);
  assert.deepEqual(alternatives("PARACETAMOL"), ["paracetamol"]);
  assert.deepEqual(displayAlternatives("ÁCIDO ACETILSALICÍLICO"), ["Ácido acetilsalicílico"]);
  assert.deepEqual(displayAlternatives("ANFEBUTAMONA O BUPROPIÓN"), ["Anfebutamona", "Bupropión"]);
  assert.deepEqual(displayAlternatives("ISOSORBIDA, DINITRATO DE"), ["Dinitrato de isosorbida"]);
  assert.deepEqual(displayAlternatives("FACTOR IX Ó NONACOG ALFA"), ["Factor ix", "Nonacog alfa"]);
  assert.equal(uninvert("LIDOCAÍNA, EPINEFRINA"), "LIDOCAÍNA, EPINEFRINA", "una combinacion no se invierte");
});

test("lee generico, forma, concentracion y envase de una clave limpia", () => {
  assert.deepEqual(row("010.000.0104.00"), {
    clave: "010.000.0104.00",
    product: "010.000.0104",
    generic: "paracetamol",
    genericDisplay: "Paracetamol",
    form: "tableta",
    strengthValue: "500",
    strengthUnit: "mg",
    packageQty: 10,
    packages: 1,
    complete: true,
    source: "pdf"
  });
});

test("el generico en la linea del encabezado no hereda el anterior", () => {
  const e = row("010.000.4307.00");
  assert.equal(e.generic, "cilostazol");
  assert.equal(e.strengthValue, "100");
  assert.equal(e.packageQty, 30);
  assert.equal(e.complete, true);
});

test("une la concentracion separada y los miles con espacio", () => {
  const e = row("010.000.2618.00");
  assert.equal(e.strengthValue, "1000");
  assert.equal(e.complete, true);
});

test("une la forma justificada en varios trozos", () => {
  const e = row("010.000.2114.00");
  assert.equal(e.form, "tableta de liberacion prolongada");
  assert.equal(e.complete, true);
});

test("claves de productos distintos en un mismo bloque quedan incompletas", () => {
  assert.equal(row("010.000.0261.00").complete, false);
  assert.equal(row("010.000.0262.00").complete, false);
});

test("las combinaciones no se codifican", () => {
  assert.equal(isSingleIngredient("METFORMINA/ GLIBENCLAMIDA"), false);
  assert.equal(isSingleIngredient("CLORFENAMINA COMPUESTA"), false);
  assert.equal(isSingleIngredient("PANTOPRAZOL O RABEPRAZOL U OMEPRAZOL"), true);
  assert.ok(entries.filter((e) => e.clave === "010.000.6273.00").every((e) => !e.complete));
});

test("ignora la columna de indicaciones y acepta la concentracion antes del nombre", () => {
  const e = row("010.000.2111.00");
  assert.equal(e.generic, "amlodipino");
  assert.equal(e.strengthValue, "5");
  assert.equal(e.complete, true);
  assert.deepEqual(
    entries.filter((x) => x.product === "010.000.2111").map((x) => x.packageQty),
    [10, 30]
  );
});

test("un producto con alternativas da una fila por alternativa con su concentracion", () => {
  assert.equal(row("010.000.5186.00", "pantoprazol").strengthValue, "40");
  assert.equal(row("010.000.5186.00", "rabeprazol").strengthValue, "20");
  const omeprazol = row("010.000.5186.01", "omeprazol");
  assert.equal(omeprazol.strengthValue, "20");
  assert.equal(omeprazol.form, "tableta o gragea o capsula");
  assert.equal(omeprazol.packageQty, 14);
  assert.equal(row("010.000.5186.00", "omeprazol").packageQty, 7);
});

test("la clave en la linea de la forma toma la descripcion que sigue", () => {
  const suspension = row("010.000.2127.00");
  assert.equal(suspension.form, "suspension oral");
  assert.equal(suspension.strengthValue, "7500");
  assert.equal(suspension.complete, true);
  const capsule = row("010.000.2128.01");
  assert.equal(capsule.form, "capsula");
  assert.equal(capsule.strengthValue, "500");
  assert.equal(capsule.packageQty, 15);
  assert.equal(capsule.complete, true);
});

test("lee el grupo 040 y los envases con 'Caja con'", () => {
  const e = row("040.000.2612.00");
  assert.equal(e.product, "040.000.2612");
  assert.equal(e.generic, "clonazepam");
  assert.equal(e.packageQty, 30);
  assert.equal(e.complete, true);
});

test("cuenta los envases del producto y completa el envase ilegible con sus hermanos", () => {
  for (const clave of ["010.000.5721.00", "010.000.5721.01", "010.000.5721.02"]) {
    const e = row(clave);
    assert.equal(e.packages, 3, clave);
    assert.equal(e.strengthValue, "1000", clave);
    assert.equal(e.complete, true, clave);
  }
});

const CORRECTIONS = [
  "# comentario",
  "clave,generic,form,strength_value,strength_unit,package_qty,motivo,revisado_por",
  '010.000.0262.00,Lidocaína,Solución inyectable al 1%,500,mg,,"Claves apiladas en el PDF, leida a mano",Farmacéutico piloto'
].join("\n");

test("las correcciones reemplazan la lectura y exigen motivo y revisor", () => {
  const corrections = parseCorrections(CORRECTIONS);
  assert.equal(corrections.length, 1);
  assert.equal(corrections[0].generic, "lidocaina");
  const corrected = applyCorrections(entries, corrections, allKeys(TEXT));
  const lidocaine = corrected.find((e) => e.clave === "010.000.0262.00");
  assert.equal(lidocaine?.complete, true);
  assert.equal(lidocaine?.source, "correccion");
  assert.equal(lidocaine?.form, "solucion inyectable al 1%");

  assert.throws(() => parseCorrections(CORRECTIONS.replace(",Farmacéutico piloto", ",")), /revis/);
  assert.throws(() => parseCorrections("clave,otra\n"), /encabezado/);
  assert.throws(
    () => parseCorrections(CORRECTIONS.replace("010.000.0262.00", "999.000.0262.00")),
    /clave invalida/
  );
});

test("la tabla es estable y la comparacion muestra lo que cambia", () => {
  const csv = toCsv(entries);
  const lines = csv.trimEnd().split("\n");
  assert.equal(lines[0], "clave,product,generic,form,strength_value,strength_unit,package_qty,packages,complete,source,generic_display");
  assert.ok(lines.includes("010.000.0104.00,010.000.0104,paracetamol,tableta,500,mg,10,1,1,pdf,Paracetamol"));
  assert.equal(toCsv(parseCnisText(TEXT)), csv, "misma entrada, misma tabla");

  const next = csv
    .replace("010.000.0104.00,010.000.0104,paracetamol,tableta,500,mg,10,1,1,pdf,Paracetamol", "010.000.0104.00,010.000.0104,paracetamol,tableta,500,mg,20,1,1,pdf,Paracetamol")
    .replace(/^040\.000\.2612\.00.*\n/m, "");
  const diff = diffTables(csv, `${next}099.000.0000.00,x,nuevo,,,,,1,0,pdf\n`);
  assert.deepEqual(diff.changed, ["010.000.0104.00 paracetamol"]);
  assert.deepEqual(diff.removed, ["040.000.2612.00 clonazepam"]);
  assert.deepEqual(diff.added, ["099.000.0000.00 nuevo"]);
});
