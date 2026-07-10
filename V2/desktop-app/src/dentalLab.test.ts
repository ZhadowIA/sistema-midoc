import assert from "node:assert/strict";
import { test } from "node:test";
import {
  draftToNewLabOrder,
  EMPTY_LAB_ORDER_DRAFT,
  isLabOrderOverdue,
  nextLabActions,
  validateLabOrderDraft,
  type LabOrderDraft
} from "./dentalLab.ts";

function draft(partial: Partial<LabOrderDraft>): LabOrderDraft {
  return { ...EMPTY_LAB_ORDER_DRAFT, workType: "Corona", labName: "ProDent", ...partial };
}

test("nextLabActions solo ofrece transiciones validas por estado", () => {
  assert.deepEqual(nextLabActions("PENDING").map((a) => a.status), ["SENT", "CANCELLED"]);
  assert.deepEqual(nextLabActions("SENT").map((a) => a.status), ["RECEIVED", "CANCELLED"]);
  assert.deepEqual(nextLabActions("RECEIVED").map((a) => a.status), ["DELIVERED", "CANCELLED"]);
  assert.deepEqual(nextLabActions("DELIVERED"), []);
  assert.deepEqual(nextLabActions("CANCELLED"), []);
});

test("isLabOrderOverdue: solo trabajos fuera del consultorio con fecha vencida", () => {
  const today = "2026-07-09";
  assert.ok(isLabOrderOverdue({ status: "SENT", promised_at: "2026-07-08" }, today));
  assert.ok(isLabOrderOverdue({ status: "PENDING", promised_at: "2026-07-01" }, today));
  assert.ok(!isLabOrderOverdue({ status: "SENT", promised_at: "2026-07-09" }, today));
  assert.ok(!isLabOrderOverdue({ status: "SENT", promised_at: null }, today));
  assert.ok(!isLabOrderOverdue({ status: "RECEIVED", promised_at: "2026-07-01" }, today));
  assert.ok(!isLabOrderOverdue({ status: "CANCELLED", promised_at: "2026-07-01" }, today));
});

test("validateLabOrderDraft pide trabajo, laboratorio y costo valido", () => {
  assert.match(validateLabOrderDraft(draft({ workType: " " })) ?? "", /tipo de trabajo/);
  assert.match(validateLabOrderDraft(draft({ labName: "" })) ?? "", /laboratorio/);
  assert.match(validateLabOrderDraft(draft({ costText: "abc" })) ?? "", /costo/);
  assert.equal(validateLabOrderDraft(draft({})), null);
  assert.equal(validateLabOrderDraft(draft({ costText: "1,200.50" })), null);
});

test("draftToNewLabOrder arma el cuerpo snake_case con valores normalizados", () => {
  const body = draftToNewLabOrder(
    draft({ toothId: " 11 ", promisedAt: "2026-07-20", costText: "1200", notes: "  " }),
    "p1",
    "enc-1"
  );
  assert.deepEqual(body, {
    patient_id: "p1",
    encounter_id: "enc-1",
    tooth_id: "11",
    work_type: "Corona",
    lab_name: "ProDent",
    promised_at: "2026-07-20",
    cost_cents: 120_000,
    notes: null
  });
  const minimal = draftToNewLabOrder(draft({ toothId: "" }), "p1", null);
  assert.equal(minimal.tooth_id, "GENERAL");
  assert.equal(minimal.promised_at, null);
  assert.equal(minimal.cost_cents, 0);
});
