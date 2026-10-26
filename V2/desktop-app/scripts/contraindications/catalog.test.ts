import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRules, proposalsCsv, toCsv, validateRules } from "./catalog.ts";

const HEADER = "ingrediente,cie10,padecimiento,gravedad,recomendacion,fuente,revisado_por";
const INGREDIENTS = "id,display,names,interaction_key,cnis\nibuprofeno,Ibuprofeno,ibuprofeno,ibuprofen,1\nmetformina,Metformina,metformina,metformin,1\n";
const CIE10 = "code,name,sex,min_age_days,max_age_days,outpatient\nN180,ENFERMEDAD RENAL CRONICA,,,,1\nN189,ENFERMEDAD RENAL CRONICA NO ESPECIFICADA,,,,1\nK259,ULCERA GASTRICA,,,,1\n";

const RULES = [
  "# comentario",
  HEADER,
  'Ibuprofeno,K25,Úlcera gástrica,Contraindicada,"Evitar AINE; considerar paracetamol",CNIS 2025 (Contraindicaciones del ibuprofeno),Farmaceutico piloto',
  "metformina,N18.9,Enfermedad renal cronica,precaucion,Ajustar dosis segun TFG,CNIS 2025,Medico piloto"
].join("\n");

test("lee reglas revisadas y normaliza la CIE-10 y la gravedad", () => {
  const rules = parseRules(RULES);
  assert.deepEqual(
    rules.map((r) => [r.ingredient, r.cie10, r.severity]),
    [
      ["ibuprofeno", "K25", "CONTRAINDICADA"],
      ["metformina", "N189", "PRECAUCION"]
    ]
  );
  const csv = toCsv(validateRules(rules, INGREDIENTS, CIE10));
  assert.ok(csv.startsWith("ingredient,cie10,condition,severity,recommendation,source\n"));
  assert.ok(csv.includes('ibuprofeno,K25,Úlcera gástrica,CONTRAINDICADA,Evitar AINE; considerar paracetamol,CNIS 2025 (Contraindicaciones del ibuprofeno)\n'));
});

test("sin fuente, sin revisor o con gravedad desconocida la regla no entra", () => {
  assert.throws(() => parseRules(`${HEADER}\nibuprofeno,K25,Ulcera,contraindicada,Evitar,,Revisor`), /fuente/);
  assert.throws(() => parseRules(`${HEADER}\nibuprofeno,K25,Ulcera,contraindicada,Evitar,Fuente,`), /revis/);
  assert.throws(() => parseRules(`${HEADER}\nibuprofeno,K25,Ulcera,grave,Evitar,Fuente,Revisor`), /gravedad/);
  assert.throws(() => parseRules(`${HEADER}\nibuprofeno,25K,Ulcera,precaucion,Evitar,Fuente,Revisor`), /CIE-10 invalida/);
  assert.throws(() => parseRules("ingrediente,otra\n"), /encabezado/);
});

test("valida contra los catalogos de ingredientes y CIE-10", () => {
  const unknownIngredient = parseRules(`${HEADER}\nnaproxeno,K25,Ulcera,precaucion,Evitar,Fuente,Revisor`);
  assert.throws(() => validateRules(unknownIngredient, INGREDIENTS, CIE10), /no existe el ingrediente/);
  const unknownCode = parseRules(`${HEADER}\nibuprofeno,Z99,Algo,precaucion,Evitar,Fuente,Revisor`);
  assert.throws(() => validateRules(unknownCode, INGREDIENTS, CIE10), /no existe la CIE-10/);
  const twice = parseRules(`${HEADER}\nibuprofeno,K25,Ulcera,precaucion,A,F,R\nIbuprofeno,K25,Ulcera,contraindicada,B,F,R`);
  assert.throws(() => validateRules(twice, INGREDIENTS, CIE10), /repetida/);
});

test("un archivo sin reglas genera una tabla vacia valida", () => {
  assert.equal(toCsv(validateRules(parseRules(`# nada\n${HEADER}\n`), INGREDIENTS, CIE10)), "ingredient,cie10,condition,severity,recommendation,source\n");
});

test("las propuestas llevan el texto del CNIS sin repetir", () => {
  const csv = proposalsCsv([
    { generic: "Ibuprofeno", text: "Contraindicaciones: úlcera péptica." },
    { generic: "Ibuprofeno", text: "Contraindicaciones: úlcera péptica." },
    { generic: "Ácido acetilsalicílico", text: "Contraindicaciones: hemofilia." }
  ]);
  const lines = csv.trimEnd().split("\n").filter((l) => !l.startsWith("#"));
  assert.deepEqual(lines, [
    "generico,ingrediente,texto",
    "Ácido acetilsalicílico,acido acetilsalicilico,Contraindicaciones: hemofilia.",
    "Ibuprofeno,ibuprofeno,Contraindicaciones: úlcera péptica."
  ]);
});
