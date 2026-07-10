import type { TreatmentPlanItem } from "./clinicalProfiles.ts";

// Presupuestos dentales (paso 26 rebanada 3), lado presentacion.
// El dinero vive en tablas OPERATIVO del backend; aqui solo hay tipos espejo,
// borradores de captura y formato. Los montos siempre son centavos enteros.

export interface BudgetItem {
  id: string;
  budget_id: string;
  tooth_id: string;
  procedure: string;
  price_cents: number;
  status: string;
  completed_at: string | null;
}

export interface Budget {
  id: string;
  patient_id: string;
  encounter_id: string | null;
  label: string;
  status: string;
  discount_cents: number;
  notes: string | null;
  alternative_group: string | null;
  created_at: string;
  decided_at: string | null;
  items: BudgetItem[];
  total_cents: number;
  paid_cents: number;
  balance_cents: number;
}

export interface DentalBalance {
  accepted_total_cents: number;
  paid_cents: number;
  balance_cents: number;
  accepted_budgets: number;
}

export interface BudgetItemDraft {
  toothId: string;
  procedure: string;
  priceText: string;
}

export interface BudgetDraft {
  label: string;
  notes: string;
  discountText: string;
  items: BudgetItemDraft[];
}

export const EMPTY_BUDGET_DRAFT: BudgetDraft = {
  label: "",
  notes: "",
  discountText: "",
  items: []
};

export const BUDGET_STATUS_LABELS: Record<string, string> = {
  PROPOSED: "Propuesto",
  ACCEPTED: "Aceptado",
  REJECTED: "Rechazado"
};

export const ITEM_STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "PLANNED", label: "Planeado" },
  { value: "IN_PROGRESS", label: "En progreso" },
  { value: "COMPLETED", label: "Realizado" }
];

const PESOS = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2
});

export function formatCents(cents: number): string {
  return PESOS.format(cents / 100);
}

// Acepta "1500", "1,500.50", "$ 1500.5"; rechaza vacio, negativos y basura.
export function parseAmountToCents(text: string): number | null {
  const cleaned = text.replace(/[$,\s]/g, "");
  if (cleaned === "" || !/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    return null;
  }
  return Math.round(Number(cleaned) * 100);
}

// Prellena el borrador con las partidas del plan dental de la nota (sin
// precio: ponerlo es justo el trabajo del presupuesto). Ignora renglones sin
// procedimiento.
export function draftFromTreatmentPlan(plan: TreatmentPlanItem[]): BudgetItemDraft[] {
  return plan
    .filter((item) => item.procedure.trim() !== "")
    .map((item) => ({
      toothId: item.toothId.trim() === "" ? "GENERAL" : item.toothId.trim(),
      procedure: item.procedure.trim(),
      priceText: ""
    }));
}

export function createEmptyItemDraft(): BudgetItemDraft {
  return { toothId: "GENERAL", procedure: "", priceText: "" };
}

export interface DraftTotals {
  grossCents: number;
  discountCents: number;
  totalCents: number;
}

export function draftTotals(draft: BudgetDraft): DraftTotals {
  const gross = draft.items.reduce(
    (sum, item) => sum + (parseAmountToCents(item.priceText) ?? 0),
    0
  );
  const discount = parseAmountToCents(draft.discountText || "0") ?? 0;
  return { grossCents: gross, discountCents: discount, totalCents: gross - discount };
}

// Primer problema del borrador en espanol, o null si esta listo para crear.
export function validateBudgetDraft(draft: BudgetDraft): string | null {
  if (draft.label.trim() === "") {
    return "el presupuesto necesita un nombre";
  }
  if (draft.items.length === 0) {
    return "agrega al menos una partida";
  }
  for (const item of draft.items) {
    if (item.procedure.trim() === "") {
      return "cada partida necesita un procedimiento";
    }
    if (parseAmountToCents(item.priceText) === null) {
      return `precio invalido en "${item.procedure.trim()}"`;
    }
  }
  const { grossCents, discountCents } = draftTotals(draft);
  if (draft.discountText.trim() !== "" && parseAmountToCents(draft.discountText) === null) {
    return "descuento invalido";
  }
  if (discountCents > grossCents) {
    return "el descuento no puede exceder el total";
  }
  return null;
}

// Cuerpo del comando dental_create_budget (espejo snake_case de NewBudget).
export function draftToNewBudget(
  draft: BudgetDraft,
  patientId: string,
  encounterId: string | null,
  alternativeGroup: string | null
): Record<string, unknown> {
  return {
    patient_id: patientId,
    encounter_id: encounterId,
    label: draft.label.trim(),
    notes: draft.notes.trim() === "" ? null : draft.notes.trim(),
    discount_cents: parseAmountToCents(draft.discountText || "0") ?? 0,
    alternative_group: alternativeGroup,
    items: draft.items.map((item) => ({
      tooth_id: item.toothId.trim() === "" ? "GENERAL" : item.toothId.trim(),
      procedure: item.procedure.trim(),
      price_cents: parseAmountToCents(item.priceText) ?? 0
    }))
  };
}

export function completedItemCount(budget: Budget): number {
  return budget.items.filter((item) => item.status === "COMPLETED").length;
}
