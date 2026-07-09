import assert from "node:assert/strict";
import { test } from "node:test";
import {
  archRowsForDentition,
  cycleSurfaceStatus,
  describeTooth,
  hasFindings,
  inferDentition,
  isUpperTooth,
  PRIMARY_TOOTH_IDS,
  surfaceSlots,
  surfaceStatusClass,
  toothMarker,
  toothStatusClass
} from "./odontogramModel.ts";
import {
  DENTAL_TOOTH_IDS,
  getDefaultDentalToothRecord,
  SURFACE_STATUS_OPTIONS,
  TOOTH_STATUS_OPTIONS,
  type DentalToothRecord
} from "./clinicalProfiles.ts";

function record(partial: Partial<DentalToothRecord>): DentalToothRecord {
  return { ...getDefaultDentalToothRecord(), ...partial };
}

test("la denticion temporal tiene 20 piezas FDI en cuadrantes 5-8", () => {
  assert.equal(PRIMARY_TOOTH_IDS.length, 20);
  assert.ok(PRIMARY_TOOTH_IDS.every((id) => ["5", "6", "7", "8"].includes(id[0])));
  assert.ok(PRIMARY_TOOTH_IDS.every((id) => ["1", "2", "3", "4", "5"].includes(id[1])));
  // Sin traslape con la denticion permanente.
  const permanent = new Set<string>(DENTAL_TOOTH_IDS);
  assert.ok(PRIMARY_TOOTH_IDS.every((id) => !permanent.has(id)));
});

test("las filas por denticion cubren las piezas correctas", () => {
  const permanent = archRowsForDentition("PERMANENT");
  assert.equal(permanent.length, 2);
  assert.deepEqual(
    permanent.flatMap((row) => [...row.teeth]),
    [...DENTAL_TOOTH_IDS]
  );

  const primary = archRowsForDentition("PRIMARY");
  assert.equal(primary.length, 2);
  assert.deepEqual(
    primary.flatMap((row) => [...row.teeth]),
    [...PRIMARY_TOOTH_IDS]
  );

  const mixed = archRowsForDentition("MIXED");
  assert.equal(mixed.length, 4);
  // Las filas temporales quedan al centro, entre las permanentes.
  assert.deepEqual(
    mixed.map((row) => row.id),
    ["upper-permanent", "upper-primary", "lower-primary", "lower-permanent"]
  );
  assert.equal(new Set(mixed.flatMap((row) => [...row.teeth])).size, 52);
});

test("distingue arcada superior e inferior por cuadrante FDI", () => {
  assert.ok(isUpperTooth("18"));
  assert.ok(isUpperTooth("21"));
  assert.ok(isUpperTooth("55"));
  assert.ok(isUpperTooth("61"));
  assert.ok(!isUpperTooth("48"));
  assert.ok(!isUpperTooth("31"));
  assert.ok(!isUpperTooth("85"));
  assert.ok(!isUpperTooth("71"));
});

test("orientacion clinica: vestibular hacia afuera y mesial hacia la linea media", () => {
  // Superior: vestibular arriba; inferior: vestibular abajo.
  assert.equal(surfaceSlots("11").V, "top");
  assert.equal(surfaceSlots("41").V, "bottom");
  assert.equal(surfaceSlots("51").V, "top");
  assert.equal(surfaceSlots("81").V, "bottom");
  // Oclusal siempre al centro.
  assert.equal(surfaceSlots("16").O, "center");
  // Cuadrante 1 (lado derecho del paciente, izquierda del espectador): mesial a la derecha.
  assert.equal(surfaceSlots("11").M, "right");
  assert.equal(surfaceSlots("18").D, "left");
  // Cuadrante 2 (espejo): mesial a la izquierda.
  assert.equal(surfaceSlots("21").M, "left");
  assert.equal(surfaceSlots("28").D, "right");
  // Inferiores espejan igual por cuadrante.
  assert.equal(surfaceSlots("46").M, "right");
  assert.equal(surfaceSlots("36").M, "left");
  // Temporales siguen la misma regla.
  assert.equal(surfaceSlots("55").M, "right");
  assert.equal(surfaceSlots("65").M, "left");
});

test("cada cara ocupa un slot distinto en el glifo", () => {
  for (const toothId of ["11", "28", "36", "44", "51", "75"]) {
    const slots = surfaceSlots(toothId);
    assert.equal(new Set(Object.values(slots)).size, 5, `slots duplicados en ${toothId}`);
  }
});

test("el clic cicla la superficie en el orden del catalogo y regresa a sano", () => {
  const order = SURFACE_STATUS_OPTIONS.map((option) => option.value);
  let current = order[0];
  const seen = [current];
  for (let i = 0; i < order.length; i += 1) {
    current = cycleSurfaceStatus(current);
    seen.push(current);
  }
  assert.deepEqual(seen, [...order, order[0]]);
  // undefined se trata como sano.
  assert.equal(cycleSurfaceStatus(undefined), order[1]);
});

test("clases CSS derivadas cubren todos los estados del catalogo", () => {
  for (const option of TOOTH_STATUS_OPTIONS) {
    assert.match(toothStatusClass(option.value), /^tooth-status-[a-z-]+$/);
  }
  for (const option of SURFACE_STATUS_OPTIONS) {
    assert.match(surfaceStatusClass(option.value), /^surface-status-[a-z]+$/);
  }
  assert.equal(toothStatusClass("EXTRACTION_INDICATED"), "tooth-status-extraction-indicated");
  assert.equal(surfaceStatusClass(undefined), "surface-status-healthy");
});

test("marcadores de pieza completa siguen la notacion clasica", () => {
  assert.equal(toothMarker("MISSING"), "cross");
  assert.equal(toothMarker("EXTRACTION_INDICATED"), "slash");
  assert.equal(toothMarker("CROWN"), "circle");
  assert.equal(toothMarker("ROOT_CANAL"), "triangle");
  assert.equal(toothMarker("IMPLANT"), "post");
  assert.equal(toothMarker("HEALTHY"), null);
  assert.equal(toothMarker("CARIES"), null);
  assert.equal(toothMarker("RESTORED"), null);
  assert.equal(toothMarker("FRACTURE"), null);
});

test("hasFindings ignora registros por defecto y detecta hallazgos", () => {
  assert.ok(!hasFindings(undefined));
  assert.ok(!hasFindings(record({})));
  assert.ok(!hasFindings(record({ surfaces: { O: "HEALTHY" } })));
  assert.ok(hasFindings(record({ status: "CARIES" })));
  assert.ok(hasFindings(record({ surfaces: { M: "RESTORED" } })));
  assert.ok(hasFindings(record({ notes: "seguimiento" })));
});

test("inferDentition sugiere la vista segun las piezas con hallazgos", () => {
  assert.equal(inferDentition({}), "PERMANENT");
  assert.equal(inferDentition({ "16": record({ status: "CARIES" }) }), "PERMANENT");
  assert.equal(inferDentition({ "55": record({ status: "CARIES" }) }), "PRIMARY");
  assert.equal(
    inferDentition({
      "55": record({ status: "CARIES" }),
      "16": record({ surfaces: { O: "SEALANT" } })
    }),
    "MIXED"
  );
  // Registros sin hallazgos no cambian la sugerencia.
  assert.equal(inferDentition({ "55": record({}) }), "PERMANENT");
});

test("describeTooth resume estado y superficies en espanol", () => {
  assert.equal(describeTooth("16", undefined), "Pieza 16: sana");
  assert.equal(describeTooth("16", record({})), "Pieza 16: sana");
  assert.equal(describeTooth("16", record({ status: "CARIES" })), "Pieza 16: Caries");
  assert.equal(
    describeTooth("16", record({ status: "RESTORED", surfaces: { O: "RESTORED", M: "CARIES" } })),
    "Pieza 16: Restaurado — O restaurado, M caries"
  );
  // Pieza sana con hallazgo de superficie: no antepone "Sano".
  assert.equal(describeTooth("16", record({ surfaces: { O: "CARIES" } })), "Pieza 16: O caries");
});
