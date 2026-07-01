import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyConflictDecisions,
  reconcileMedicalHistories
} from "./medicalHistoryReconciliation.ts";

test("solo crea conflicto cuando ambas versiones tienen valores distintos", () => {
  const result = reconcileMedicalHistories(
    { allergies: "Penicilina", identification: { estado: "Jalisco" } },
    {
      allergies: "Sulfas",
      identification: { municipio: "Guadalajara" }
    }
  );

  assert.equal(result.conflicts.length, 1);
  assert.equal(result.conflicts[0]?.path, "allergies");
  assert.equal(result.merged.identification?.estado, "Jalisco");
  assert.equal(result.merged.identification?.municipio, "Guadalajara");
  assert.equal(result.autoMergedCount, 1);
});

test("conserva datos anteriores ausentes en el cuestionario nuevo", () => {
  const result = reconcileMedicalHistories(
    { pathological: { diabetico: "si", diabeticoDesde: "2018" } },
    { pathological: { diabetico: "si" } }
  );

  assert.deepEqual(result.conflicts, []);
  assert.equal(result.merged.pathological?.diabeticoDesde, "2018");
});

test("compara listas familiares como conjuntos sin importar el orden", () => {
  const result = reconcileMedicalHistories(
    { familyHistory: { diabetes: { relatives: ["madre", "padre"] } } },
    { familyHistory: { diabetes: { relatives: ["padre", "madre"] } } }
  );

  assert.deepEqual(result.conflicts, []);
});

test("aplica decisiones campo por campo sobre el resultado fusionado", () => {
  const reconciliation = reconcileMedicalHistories(
    { allergies: "Penicilina", identification: { estado: "Jalisco" } },
    { allergies: "Sulfas", identification: { estado: "Nayarit" } }
  );

  const result = applyConflictDecisions(reconciliation.merged, reconciliation.conflicts, {
    allergies: "incoming",
    "identification.estado": "current"
  });

  assert.equal(result.allergies, "Sulfas");
  assert.equal(result.identification?.estado, "Jalisco");
});
