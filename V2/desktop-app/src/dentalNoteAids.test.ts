import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDentalSessionSummary } from "./dentalEvolution.ts";
import {
  composePostOpInstructions,
  inferPostOpKinds,
  POST_OP_TEMPLATES
} from "./postOpInstructions.ts";
import { EMPTY_DENTAL_PAYLOAD, type DentalPayload, type TreatmentPlanItem } from "./clinicalProfiles.ts";

function planItem(partial: Partial<TreatmentPlanItem>): TreatmentPlanItem {
  return {
    id: "plan-1",
    toothId: "16",
    procedure: "Resina oclusal",
    priority: "ELECTIVE",
    status: "PLANNED",
    sessionDate: "",
    notes: "",
    ...partial
  };
}

test("buildDentalSessionSummary resume hallazgos, placa, plan e higiene", () => {
  const payload: DentalPayload = {
    ...EMPTY_DENTAL_PAYLOAD,
    odontogram: {
      "16": { status: "MISSING", surfaces: {}, notes: "" },
      "18": { status: "HEALTHY", surfaces: { O: { condition: "CARIES" } }, notes: "" },
      "17": { status: "HEALTHY", surfaces: {}, notes: "" }
    },
    plaque: { "17": ["M", "V"] },
    mouthConditions: [
      { id: "c1", date: "2026-07-09", condition: "BRUXISM", resolved: false },
      { id: "c2", date: "2026-07-09", condition: "TMJ", resolved: true }
    ],
    treatmentPlan: [
      planItem({ status: "COMPLETED" }),
      planItem({ id: "plan-2", procedure: "  " })
    ],
    hygienePlan: "Cepillado con tecnica de Bass",
    nextRevision: "2026-08-09"
  };
  const summary = buildDentalSessionSummary(payload);
  assert.match(summary, /^Evolucion dental de la sesion:/);
  assert.match(summary, /Pieza 16: Ausente/);
  assert.match(summary, /Pieza 18: O caries/);
  // Pieza 17 sin hallazgos no aparece en hallazgos.
  assert.ok(!summary.includes("Pieza 17:"));
  // Placa: 2 caras / 31 piezas presentes x 4 = 1.6%.
  assert.match(summary, /Indice de placa \(O'Leary\): 1\.6%/);
  // Solo condiciones activas.
  assert.match(summary, /bruxismo/i);
  assert.ok(!/atm/i.test(summary));
  // Plan sin renglones vacios, con estado.
  assert.match(summary, /Resina oclusal \(pieza 16, electivo, completado\)/);
  assert.match(summary, /Plan de higiene: Cepillado/);
  assert.match(summary, /Proxima revision: 2026-08-09/);

  // Payload vacio: sin resumen que insertar.
  assert.equal(buildDentalSessionSummary(EMPTY_DENTAL_PAYLOAD), "");
});

test("inferPostOpKinds detecta el tipo por palabras clave del procedimiento", () => {
  assert.deepEqual(inferPostOpKinds([planItem({ procedure: "Extraccion de tercer molar" })]), [
    "EXTRACTION"
  ]);
  assert.deepEqual(inferPostOpKinds([planItem({ procedure: "Tratamiento de conductos" })]), [
    "ENDODONTICS"
  ]);
  assert.deepEqual(inferPostOpKinds([planItem({ procedure: "Corona de zirconia" })]), [
    "CROWN_PROSTHESIS"
  ]);
  assert.deepEqual(inferPostOpKinds([planItem({ procedure: "Profilaxis y raspado" })]), [
    "CLEANING"
  ]);
  assert.deepEqual(inferPostOpKinds([planItem({ procedure: "Colocacion de implante" })]), [
    "IMPLANT"
  ]);
  assert.deepEqual(inferPostOpKinds([planItem({ procedure: "Injerto de encia" })]), ["SURGERY"]);
  // Sin coincidencias: nada sugerido.
  assert.deepEqual(inferPostOpKinds([planItem({ procedure: "Valoracion general" })]), []);
});

test("inferPostOpKinds prioriza lo realizado o en progreso de la sesion", () => {
  const plan = [
    planItem({ procedure: "Extraccion 38", status: "COMPLETED" }),
    planItem({ id: "plan-2", procedure: "Corona 16", status: "PLANNED" })
  ];
  // Hay avance: solo lo avanzado sugiere plantillas.
  assert.deepEqual(inferPostOpKinds(plan), ["EXTRACTION"]);
  // Sin avance: se considera todo el plan.
  const allPlanned = plan.map((item) => ({ ...item, status: "PLANNED" as const }));
  assert.deepEqual(inferPostOpKinds(allPlanned), ["EXTRACTION", "CROWN_PROSTHESIS"]);
});

test("composePostOpInstructions une plantillas en orden estable y sin duplicar", () => {
  const text = composePostOpInstructions(["CLEANING", "EXTRACTION", "EXTRACTION"]);
  const extractionAt = text.indexOf(POST_OP_TEMPLATES.EXTRACTION.text);
  const cleaningAt = text.indexOf(POST_OP_TEMPLATES.CLEANING.text);
  assert.ok(extractionAt !== -1 && cleaningAt !== -1);
  assert.ok(extractionAt < cleaningAt, "extraccion va antes que limpieza");
  // Sin duplicados.
  assert.equal(text.split("Despues de la extraccion:").length, 2);
  assert.equal(composePostOpInstructions([]), "");
});
