import { parseAmountToCents } from "./dentalBudget.ts";

// Ordenes de laboratorio dental (paso 26 rebanada 4), lado presentacion.
// Tipos espejo del backend, borrador de alta y reglas de ciclo de vida para
// que la UI solo ofrezca transiciones validas.

export interface LabOrder {
  id: string;
  patient_id: string;
  encounter_id: string | null;
  tooth_id: string;
  work_type: string;
  lab_name: string;
  status: string;
  promised_at: string | null;
  sent_at: string | null;
  received_at: string | null;
  delivered_at: string | null;
  cost_cents: number;
  notes: string | null;
  created_at: string;
}

export interface PendingLabOrder extends LabOrder {
  patient_name: string;
}

export const LAB_STATUS_LABELS: Record<string, string> = {
  PENDING: "Por enviar",
  SENT: "Enviada",
  RECEIVED: "Recibida",
  DELIVERED: "Entregada",
  CANCELLED: "Cancelada"
};

// Transiciones validas (espejo del motor): la UI solo pinta estos botones.
export function nextLabActions(status: string): Array<{ status: string; label: string }> {
  switch (status) {
    case "PENDING":
      return [
        { status: "SENT", label: "Marcar enviada" },
        { status: "CANCELLED", label: "Cancelar" }
      ];
    case "SENT":
      return [
        { status: "RECEIVED", label: "Marcar recibida" },
        { status: "CANCELLED", label: "Cancelar" }
      ];
    case "RECEIVED":
      return [
        { status: "DELIVERED", label: "Entregar al paciente" },
        { status: "CANCELLED", label: "Cancelar" }
      ];
    default:
      return [];
  }
}

// Una orden esta vencida si sigue fuera del consultorio despues de su fecha
// prometida (la comparacion es por dia, en fecha local).
export function isLabOrderOverdue(
  order: Pick<LabOrder, "status" | "promised_at">,
  today: string
): boolean {
  if (!order.promised_at || (order.status !== "PENDING" && order.status !== "SENT")) {
    return false;
  }
  return order.promised_at.slice(0, 10) < today;
}

export interface LabOrderDraft {
  toothId: string;
  workType: string;
  labName: string;
  promisedAt: string;
  costText: string;
  notes: string;
}

export const EMPTY_LAB_ORDER_DRAFT: LabOrderDraft = {
  toothId: "GENERAL",
  workType: "",
  labName: "",
  promisedAt: "",
  costText: "",
  notes: ""
};

export function validateLabOrderDraft(draft: LabOrderDraft): string | null {
  if (draft.workType.trim() === "") {
    return "indica el tipo de trabajo (corona, protesis, guarda...)";
  }
  if (draft.labName.trim() === "") {
    return "indica el laboratorio destino";
  }
  if (draft.costText.trim() !== "" && parseAmountToCents(draft.costText) === null) {
    return "costo invalido";
  }
  return null;
}

// Cuerpo del comando dental_create_lab_order (espejo snake_case).
export function draftToNewLabOrder(
  draft: LabOrderDraft,
  patientId: string,
  encounterId: string | null
): Record<string, unknown> {
  return {
    patient_id: patientId,
    encounter_id: encounterId,
    tooth_id: draft.toothId.trim() === "" ? "GENERAL" : draft.toothId.trim(),
    work_type: draft.workType.trim(),
    lab_name: draft.labName.trim(),
    promised_at: draft.promisedAt.trim() === "" ? null : draft.promisedAt.trim(),
    cost_cents: parseAmountToCents(draft.costText.trim() === "" ? "0" : draft.costText) ?? 0,
    notes: draft.notes.trim() === "" ? null : draft.notes.trim()
  };
}
