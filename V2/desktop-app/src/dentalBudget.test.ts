import assert from "node:assert/strict";
import { test } from "node:test";
import {
  draftFromTreatmentPlan,
  draftToNewBudget,
  draftTotals,
  formatCents,
  parseAmountToCents,
  validateBudgetDraft,
  type BudgetDraft
} from "./dentalBudget.ts";
import type { TreatmentPlanItem } from "./clinicalProfiles.ts";

function draft(partial: Partial<BudgetDraft>): BudgetDraft {
  return { label: "Opcion resina", notes: "", discountText: "", items: [], ...partial };
}

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

test("parseAmountToCents acepta formatos usuales y rechaza basura", () => {
  assert.equal(parseAmountToCents("1500"), 150_000);
  assert.equal(parseAmountToCents("1,500.50"), 150_050);
  assert.equal(parseAmountToCents("$ 900.5"), 90_050);
  assert.equal(parseAmountToCents("0"), 0);
  assert.equal(parseAmountToCents(""), null);
  assert.equal(parseAmountToCents("-5"), null);
  assert.equal(parseAmountToCents("12.345"), null);
  assert.equal(parseAmountToCents("abc"), null);
});

test("formatCents presenta pesos mexicanos con centavos", () => {
  assert.match(formatCents(150_000), /1,500\.00/);
  assert.match(formatCents(90_050), /900\.50/);
});

test("draftFromTreatmentPlan toma pieza y procedimiento sin precio", () => {
  const items = draftFromTreatmentPlan([
    planItem({}),
    planItem({ id: "plan-2", toothId: "  ", procedure: "Limpieza" }),
    planItem({ id: "plan-3", procedure: "   " })
  ]);
  assert.deepEqual(items, [
    { toothId: "16", procedure: "Resina oclusal", priceText: "" },
    { toothId: "GENERAL", procedure: "Limpieza", priceText: "" }
  ]);
});

test("draftTotals suma partidas y resta descuento", () => {
  const totals = draftTotals(
    draft({
      discountText: "100",
      items: [
        { toothId: "16", procedure: "Resina", priceText: "900" },
        { toothId: "55", procedure: "Extraccion", priceText: "600" }
      ]
    })
  );
  assert.deepEqual(totals, { grossCents: 150_000, discountCents: 10_000, totalCents: 140_000 });
});

test("validateBudgetDraft detecta cada problema en orden", () => {
  assert.match(validateBudgetDraft(draft({ label: " " })) ?? "", /nombre/);
  assert.match(validateBudgetDraft(draft({})) ?? "", /al menos una partida/);
  assert.match(
    validateBudgetDraft(
      draft({ items: [{ toothId: "16", procedure: " ", priceText: "100" }] })
    ) ?? "",
    /procedimiento/
  );
  assert.match(
    validateBudgetDraft(
      draft({ items: [{ toothId: "16", procedure: "Resina", priceText: "x" }] })
    ) ?? "",
    /precio invalido/
  );
  assert.match(
    validateBudgetDraft(
      draft({
        discountText: "999",
        items: [{ toothId: "16", procedure: "Resina", priceText: "100" }]
      })
    ) ?? "",
    /descuento/
  );
  assert.equal(
    validateBudgetDraft(
      draft({ items: [{ toothId: "16", procedure: "Resina", priceText: "100" }] })
    ),
    null
  );
});

test("draftToNewBudget arma el cuerpo snake_case del comando", () => {
  const body = draftToNewBudget(
    draft({
      label: "  Opcion resina  ",
      notes: "  ",
      discountText: "100",
      items: [{ toothId: " 16 ", procedure: " Resina ", priceText: "900" }]
    }),
    "p1",
    "enc-1",
    "grupo-1"
  );
  assert.deepEqual(body, {
    patient_id: "p1",
    encounter_id: "enc-1",
    label: "Opcion resina",
    notes: null,
    discount_cents: 10_000,
    alternative_group: "grupo-1",
    items: [{ tooth_id: "16", procedure: "Resina", price_cents: 90_000 }]
  });
});
