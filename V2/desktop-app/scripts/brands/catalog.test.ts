import assert from "node:assert/strict";
import { test } from "node:test";
import { parseBrands, toCsv, validateBrands } from "./catalog.ts";

const INGREDIENTS = [
  "id,display,names,interaction_key,cnis",
  "paracetamol,Paracetamol,acetaminophen|paracetamol,acetaminophen,1",
  "cafeina,Cafeína,cafeina,,1",
  "ibuprofeno,Ibuprofeno,ibuprofen|ibuprofeno,ibuprofen,1"
].join("\n");

const HEADER = "marca,ingredientes,laboratorio,fuente,revisado_por";

test("lee marcas revisadas con uno o varios ingredientes", () => {
  const brands = parseBrands(
    [
      "# comentario",
      HEADER,
      "Tempra,paracetamol,Laboratorio X,IPP COFEPRIS,Farmaceutico piloto",
      'Analgésico Plus,"Paracetamol + Cafeína",,PLM 2026,Farmaceutico piloto'
    ].join("\n")
  );
  assert.deepEqual(
    brands.map((b) => [b.name, b.display, b.ingredients]),
    [
      ["tempra", "Tempra", ["paracetamol"]],
      ["analgesico plus", "Analgésico Plus", ["paracetamol", "cafeina"]]
    ]
  );
  const valid = validateBrands(brands, INGREDIENTS);
  assert.deepEqual(valid.map((b) => b.name), ["analgesico plus", "tempra"]);
  assert.equal(
    toCsv(valid),
    "name,display,ingredients,laboratory\nanalgesico plus,Analgésico Plus,paracetamol|cafeina,\ntempra,Tempra,paracetamol,Laboratorio X\n"
  );
});

test("sin fuente o sin revisor la marca no entra", () => {
  assert.throws(() => parseBrands(`${HEADER}\nTempra,paracetamol,Lab,,Revisor`), /fuente/);
  assert.throws(() => parseBrands(`${HEADER}\nTempra,paracetamol,Lab,Fuente,`), /revis/);
  assert.throws(() => parseBrands("marca,otra\n"), /encabezado/);
});

test("valida contra el catalogo de ingredientes", () => {
  const unknown = parseBrands(`${HEADER}\nTempra,acetaminofen raro,Lab,Fuente,Revisor`);
  assert.throws(() => validateBrands(unknown, INGREDIENTS), /no existe el ingrediente/);
  const shadow = parseBrands(`${HEADER}\nParacetamol,paracetamol,Lab,Fuente,Revisor`);
  assert.throws(() => validateBrands(shadow, INGREDIENTS), /igual que un ingrediente/);
  const twice = parseBrands(`${HEADER}\nTempra,paracetamol,Lab,Fuente,Revisor\nTEMPRA,paracetamol,Lab,Fuente,Revisor`);
  assert.throws(() => validateBrands(twice, INGREDIENTS), /repetida/);
});

test("un nucleo vacio genera una tabla vacia valida", () => {
  assert.equal(toCsv(validateBrands(parseBrands(`# solo comentario\n${HEADER}\n`), INGREDIENTS)), "name,display,ingredients,laboratory\n");
});
