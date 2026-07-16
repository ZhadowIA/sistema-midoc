import assert from "node:assert/strict";
import { test } from "node:test";
import { medicalHistoryAiFields } from "./medicalHistoryFormat.ts";
import {
  applyMedicalHistoryProposal,
  valueAtMedicalHistoryPath,
  type MedicalHistoryProposal
} from "./medicalHistoryAi.ts";

test("el contrato IA solo expone rutas reales del cuestionario", () => {
  const fields = medicalHistoryAiFields();
  assert.ok(fields.some((field) => field.path === "pathological.diabetico"));
  assert.ok(fields.some((field) => field.path === "familyHistory.cancer.relatives"));
  assert.ok(fields.every((field) => field.path && field.label));
  assert.equal(new Set(fields.map((field) => field.path)).size, fields.length);
});

test("aplica una propuesta confirmada sin mutar la historia vigente", () => {
  const current = { pathological: { diabetico: "no" } };
  const proposal: MedicalHistoryProposal = {
    path: "pathological.diabetico",
    label: "Diabetes",
    value: "si",
    source_turns: ["turn-2"],
    confidence: "high",
    warning: ""
  };
  const updated = applyMedicalHistoryProposal(current, proposal);
  assert.equal(valueAtMedicalHistoryPath(current, proposal.path), "no");
  assert.equal(valueAtMedicalHistoryPath(updated, proposal.path), "si");
});

test("conserva estructuras heredo-familiares al aplicar familiares", () => {
  const current = { familyHistory: { cancer: { type: "mama" } } };
  const proposal: MedicalHistoryProposal = {
    path: "familyHistory.cancer.relatives",
    label: "Familiares",
    value: ["madre", "abuelaMaterna"],
    source_turns: ["turn-3"],
    confidence: "medium",
    warning: ""
  };
  const updated = applyMedicalHistoryProposal(current, proposal);
  assert.deepEqual(valueAtMedicalHistoryPath(updated, proposal.path), ["madre", "abuelaMaterna"]);
  assert.equal(valueAtMedicalHistoryPath(updated, "familyHistory.cancer.type"), "mama");
});
