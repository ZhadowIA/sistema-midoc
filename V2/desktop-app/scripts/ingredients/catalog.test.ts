import assert from "node:assert/strict";
import { test } from "node:test";
import { buildIngredients, isSingleIngredient, parseSynonyms, reviewCsv, toCsv } from "./catalog.ts";

const CNIS = [
  "clave,product,generic,form,strength_value,strength_unit,package_qty,packages,complete,source,generic_display",
  "010.000.0104.00,010.000.0104,paracetamol,tableta,500,mg,10,1,1,pdf,Paracetamol",
  "010.000.0106.00,010.000.0106,paracetamol,solucion oral,100,mg,1,1,1,pdf,Paracetamol",
  "010.000.0101.00,010.000.0101,acido acetilsalicilico,tableta,500,mg,20,1,1,pdf,Ácido acetilsalicílico",
  "010.000.2128.00,010.000.2128,amoxicilina,capsula,500,mg,12,2,1,pdf,Amoxicilina",
  "010.000.6273.00,010.000.6273,metformina/ glibenclamida,tableta,500,mg,30,1,0,pdf,Metformina/ glibenclamida",
  "010.000.3400.00,010.000.3400,dipiridamol-acido acetilsalicilico,capsula,,,60,1,0,pdf,Dipiridamol-ácido acetilsalicílico",
  "010.000.5165.00,010.000.5165,metformina,tableta,850,mg,30,1,1,pdf,Metformina"
].join("\n");

const MEDICATIONS = [
  "name,ingredient,display_name,drug_class",
  "acetaminophen,acetaminophen,Paracetamol,Analgesico",
  "paracetamol,acetaminophen,Paracetamol,Analgesico",
  "acetaminofen,acetaminophen,Paracetamol,Analgesico",
  "tempra,acetaminophen,Paracetamol,Analgesico",
  "aspirin,aspirin,Aspirina,AINE",
  "aspirina,aspirin,Aspirina,AINE",
  "metformin,metformin,Metformina,Biguanida",
  "metformina,metformin,Metformina,Biguanida",
  "phenelzine,phenelzine,Fenelzina,IMAO"
].join("\n");

const byId = (result: ReturnType<typeof buildIngredients>, id: string) => {
  const found = result.ingredients.find((i) => i.id === id);
  assert.ok(found, id);
  return found;
};

test("las combinaciones no son un ingrediente", () => {
  assert.equal(isSingleIngredient("metformina/ glibenclamida"), false);
  assert.equal(isSingleIngredient("dipiridamol-acido acetilsalicilico"), false);
  assert.equal(isSingleIngredient("trimetoprima y sulfametoxazol"), false);
  assert.equal(isSingleIngredient("6-mercaptopurina"), true);
  assert.equal(isSingleIngredient("peginterferon alfa-2a"), true);
});

test("cada generico del CNIS es un ingrediente con su nombre con acentos", () => {
  const result = buildIngredients(CNIS, "name,ingredient,display_name,drug_class\n", []);
  assert.deepEqual(
    result.ingredients.map((i) => i.id),
    ["acido acetilsalicilico", "amoxicilina", "metformina", "paracetamol"]
  );
  assert.equal(byId(result, "acido acetilsalicilico").display, "Ácido acetilsalicílico");
  assert.ok(result.ingredients.every((i) => i.cnis && !i.interactionKey));
});

test("liga el CNIS con la base de interacciones solo por nombre exacto", () => {
  const result = buildIngredients(CNIS, MEDICATIONS, []);
  const paracetamol = byId(result, "paracetamol");
  assert.equal(paracetamol.interactionKey, "acetaminophen");
  assert.deepEqual(paracetamol.names, ["acetaminophen", "paracetamol"]);
  assert.equal(byId(result, "metformina").interactionKey, "metformin");
  // "Aspirina" no es el nombre del CNIS: queda aparte hasta que alguien lo revise.
  assert.equal(byId(result, "acido acetilsalicilico").interactionKey, "");
  const aspirin = byId(result, "aspirina");
  assert.equal(aspirin.cnis, false);
  assert.equal(aspirin.interactionKey, "aspirin");
  // Fuera del CNIS pero con datos de interacciones.
  assert.equal(byId(result, "fenelzina").interactionKey, "phenelzine");
});

test("variantes y marcas de la base no se usan sin revision: van a por-revisar", () => {
  const result = buildIngredients(CNIS, MEDICATIONS, []);
  assert.ok(!byId(result, "paracetamol").names.includes("tempra"));
  assert.ok(!byId(result, "paracetamol").names.includes("acetaminofen"));
  assert.deepEqual(
    result.review.filter((r) => r.ingredient === "paracetamol").map((r) => r.name),
    ["acetaminofen", "tempra"]
  );
  assert.match(reviewCsv(result.review), /^# Generado/);
});

test("un sinonimo revisado agrega el nombre y liga la base de interacciones", () => {
  const synonyms = parseSynonyms(
    [
      "# comentario",
      "ingrediente,sinonimo,motivo,revisado_por",
      "Ácido acetilsalicílico,aspirina,Nombre comun en Mexico,Farmaceutico piloto",
      "paracetamol,acetaminofén,Nombre comun en Mexico,Farmaceutico piloto"
    ].join("\n")
  );
  const result = buildIngredients(CNIS, MEDICATIONS, synonyms);
  const asa = byId(result, "acido acetilsalicilico");
  assert.equal(asa.interactionKey, "aspirin");
  assert.deepEqual(asa.names, ["acido acetilsalicilico", "aspirin", "aspirina"]);
  assert.ok(!result.ingredients.some((i) => i.id === "aspirina"), "ya no queda aparte");
  assert.ok(byId(result, "paracetamol").names.includes("acetaminofen"));
  assert.ok(!result.review.some((r) => r.name === "acetaminofen"), "lo revisado ya no se pide");
});

test("los sinonimos exigen motivo, revisor e ingrediente existente", () => {
  const header = "ingrediente,sinonimo,motivo,revisado_por";
  assert.throws(() => parseSynonyms(`${header}\nparacetamol,acetaminofen,Comun,`), /revis/);
  assert.throws(() => parseSynonyms("otra,cosa\n"), /encabezado/);
  const unknown = parseSynonyms(`${header}\nno existe,algo,Motivo,Revisor`);
  assert.throws(() => buildIngredients(CNIS, MEDICATIONS, unknown), /no existe el ingrediente/);
});

test("un nombre que apunta a dos ingredientes sale de ambos", () => {
  const synonyms = parseSynonyms(
    "ingrediente,sinonimo,motivo,revisado_por\nparacetamol,analgesico,Prueba,Revisor\nmetformina,analgesico,Prueba,Revisor"
  );
  const result = buildIngredients(CNIS, MEDICATIONS, synonyms);
  assert.deepEqual(result.conflicts, ["analgesico"]);
  assert.ok(!byId(result, "paracetamol").names.includes("analgesico"));
  assert.ok(!byId(result, "metformina").names.includes("analgesico"));
});

test("la tabla es estable", () => {
  const csv = toCsv(buildIngredients(CNIS, MEDICATIONS, []).ingredients);
  assert.equal(csv, toCsv(buildIngredients(CNIS, MEDICATIONS, []).ingredients));
  assert.ok(csv.startsWith("id,display,names,interaction_key,cnis\n"));
  assert.ok(csv.includes("paracetamol,Paracetamol,acetaminophen|paracetamol,acetaminophen,1\n"));
});
