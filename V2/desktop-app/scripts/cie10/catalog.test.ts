import assert from "node:assert/strict";
import { test } from "node:test";
import { displayCode, normalizeCode, parseAgeLimit, toCsv, toEntries, type RawCie10Row } from "./catalog.ts";

function row(partial: Partial<RawCie10Row>): RawCie10Row {
  return {
    CATALOG_KEY: "A000",
    NOMBRE: "COLERA",
    LSEX: "NO",
    LINF: "NO",
    LSUP: "NO",
    VALID: "SI",
    RUBRICA_TYPE: "NO",
    DIA_SIS: "SI",
    ...partial
  };
}

test("convierte los limites de edad del catalogo a dias", () => {
  assert.equal(parseAgeLimit("028D"), 28);
  assert.equal(parseAgeLimit("011M"), 330);
  assert.equal(parseAgeLimit("010A"), 3650);
  assert.equal(parseAgeLimit("000H"), 0);
  assert.equal(parseAgeLimit("NO"), null);
  assert.equal(parseAgeLimit(""), null);
});

test("normaliza y presenta las claves", () => {
  assert.equal(normalizeCode("A09X"), "A09");
  assert.equal(normalizeCode(" a182 "), "A182");
  assert.equal(displayCode("A182"), "A18.2");
  assert.equal(displayCode("A09"), "A09");
});

test("solo deja codigos vigentes y no borrados, ordenados", () => {
  const entries = toEntries([
    row({ CATALOG_KEY: "O800", NOMBRE: "PARTO  UNICO ESPONTANEO", LSEX: "MUJER", LINF: "010A", LSUP: "054A" }),
    row({ CATALOG_KEY: "A09X", NOMBRE: "DIARREA Y GASTROENTERITIS" }),
    row({ CATALOG_KEY: "B001", VALID: "NO" }),
    row({ CATALOG_KEY: "B002", RUBRICA_TYPE: "B" }),
    row({ CATALOG_KEY: "9999", NOMBRE: "CLAVE ESPECIAL" }),
    row({ CATALOG_KEY: "A15", DIA_SIS: "NO" })
  ]);
  assert.deepEqual(entries, [
    { code: "A09", name: "DIARREA Y GASTROENTERITIS", sex: "", minAgeDays: null, maxAgeDays: null, outpatient: true },
    { code: "A15", name: "COLERA", sex: "", minAgeDays: null, maxAgeDays: null, outpatient: false },
    { code: "O800", name: "PARTO UNICO ESPONTANEO", sex: "F", minAgeDays: 3650, maxAgeDays: 19710, outpatient: true }
  ]);
});

test("escribe un CSV estable que respeta comas en el nombre", () => {
  const csv = toCsv(
    toEntries([row({ CATALOG_KEY: "A010", NOMBRE: "FIEBRE TIFOIDEA, NO ESPECIFICADA", LSEX: "HOMBRE", LINF: "028D" })])
  );
  assert.equal(
    csv,
    'code,name,sex,min_age_days,max_age_days,outpatient\nA010,"FIEBRE TIFOIDEA, NO ESPECIFICADA",M,28,,1\n'
  );
});
