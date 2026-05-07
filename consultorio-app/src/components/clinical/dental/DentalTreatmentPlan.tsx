"use client";

import { useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import {
  TREATMENT_PRIORITY,
  TREATMENT_STATUS,
  TREATMENT_PRIORITY_LABEL,
  TREATMENT_STATUS_LABEL,
  type TreatmentItem,
  type TreatmentPriority,
  type TreatmentStatus,
} from "@/lib/specialtyPayloadSchemas";

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIORITY_COLOR: Record<TreatmentPriority, string> = {
  URGENT:    "text-destructive bg-destructive/10 border-destructive/30",
  ELECTIVE:  "text-primary bg-primary/10 border-primary/30",
  PREVENTIVE:"text-success bg-success/10 border-success/30",
};

const STATUS_COLOR: Record<TreatmentStatus, string> = {
  PLANNED:    "text-warning bg-warning/10 border-warning/30",
  IN_PROGRESS:"text-primary bg-primary/10 border-primary/30",
  COMPLETED:  "text-success bg-success/10 border-success/30",
};

const COMMON_PROCEDURES = [
  "Profilaxis dental",
  "Fluoruración",
  "Selladores de fosetas y fisuras",
  "Restauración con composite",
  "Restauración con amalgama",
  "Corona de porcelana",
  "Corona de zirconia",
  "Endodoncia (tratamiento de conducto)",
  "Extracción simple",
  "Extracción quirúrgica",
  "Pulpotomía",
  "Pulpectomía",
  "Raspado y alisado radicular",
  "Curetaje",
  "Gingivectomía",
  "Implante dental",
  "Puente fijo",
  "Prótesis parcial removible",
  "Prótesis total",
  "Ortodoncia",
  "Blanqueamiento dental",
  "Biopsia de tejido blando",
  "Ferulización",
];

function generateId() {
  return `tx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Row form (inline) ────────────────────────────────────────────────────────

function TreatmentRow({
  item,
  onUpdate,
  onRemove,
  disabled,
}: {
  item: TreatmentItem;
  onUpdate: (updated: TreatmentItem) => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`border rounded-md overflow-hidden transition-colors ${
      item.status === "COMPLETED" ? "border-border/50 bg-secondary/10 opacity-70" : "border-border bg-card"
    }`}>
      {/* Summary row */}
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Priority badge */}
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border flex-shrink-0 ${PRIORITY_COLOR[item.priority]}`}>
          {TREATMENT_PRIORITY_LABEL[item.priority]}
        </span>

        {/* Tooth */}
        <span className="text-xs font-mono bg-secondary/50 px-1.5 py-0.5 rounded text-foreground flex-shrink-0 min-w-[28px] text-center">
          {item.toothId}
        </span>

        {/* Procedure */}
        <span className={`text-sm flex-1 min-w-0 truncate ${item.status === "COMPLETED" ? "line-through text-muted-foreground" : "text-foreground"}`}>
          {item.procedure || <em className="text-muted-foreground">Sin procedimiento</em>}
        </span>

        {/* Status badge */}
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border flex-shrink-0 ${STATUS_COLOR[item.status]}`}>
          {TREATMENT_STATUS_LABEL[item.status]}
        </span>

        {/* Actions */}
        {!disabled && (
          <>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="p-1 rounded hover:bg-secondary/50 text-muted-foreground transition-colors"
              aria-label="Editar"
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              aria-label="Eliminar"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>

      {/* Expanded edit form */}
      {expanded && !disabled && (
        <div className="border-t border-border px-3 py-3 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-secondary/5">
          {/* Tooth ID */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Pieza (FDI o GENERAL)</label>
            <input
              type="text"
              value={item.toothId}
              onChange={(e) => onUpdate({ ...item, toothId: e.target.value.toUpperCase() })}
              className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Ej: 16, 21, GENERAL"
              maxLength={8}
            />
          </div>

          {/* Procedure */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Procedimiento</label>
            <input
              type="text"
              list="procedures-list"
              value={item.procedure}
              onChange={(e) => onUpdate({ ...item, procedure: e.target.value })}
              className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Nombre del procedimiento"
            />
            <datalist id="procedures-list">
              {COMMON_PROCEDURES.map((p) => <option key={p} value={p} />)}
            </datalist>
          </div>

          {/* Priority */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Prioridad</label>
            <select
              value={item.priority}
              onChange={(e) => onUpdate({ ...item, priority: e.target.value as TreatmentPriority })}
              className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {TREATMENT_PRIORITY.map((p) => (
                <option key={p} value={p}>{TREATMENT_PRIORITY_LABEL[p]}</option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Estado</label>
            <select
              value={item.status}
              onChange={(e) => onUpdate({ ...item, status: e.target.value as TreatmentStatus })}
              className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {TREATMENT_STATUS.map((s) => (
                <option key={s} value={s}>{TREATMENT_STATUS_LABEL[s]}</option>
              ))}
            </select>
          </div>

          {/* Session date */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Fecha de sesión</label>
            <input
              type="date"
              value={item.sessionDate ?? ""}
              onChange={(e) => onUpdate({ ...item, sessionDate: e.target.value || undefined })}
              className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Notas</label>
            <input
              type="text"
              value={item.notes ?? ""}
              onChange={(e) => onUpdate({ ...item, notes: e.target.value || undefined })}
              className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Observaciones del procedimiento"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type Props = {
  treatmentPlan: TreatmentItem[];
  hygienePlan:   string | undefined;
  nextRevision:  string | undefined;
  onChange: (plan: TreatmentItem[], hygiene: string | undefined, revision: string | undefined) => void;
  disabled?: boolean;
};

export function DentalTreatmentPlan({
  treatmentPlan,
  hygienePlan,
  nextRevision,
  onChange,
  disabled = false,
}: Props) {
  const addItem = () => {
    const newItem: TreatmentItem = {
      id:        generateId(),
      toothId:   "GENERAL",
      procedure: "",
      priority:  "ELECTIVE",
      status:    "PLANNED",
    };
    onChange([...treatmentPlan, newItem], hygienePlan, nextRevision);
  };

  const updateItem = (idx: number, updated: TreatmentItem) => {
    const next = [...treatmentPlan];
    next[idx] = updated;
    onChange(next, hygienePlan, nextRevision);
  };

  const removeItem = (idx: number) => {
    onChange(treatmentPlan.filter((_, i) => i !== idx), hygienePlan, nextRevision);
  };

  // Sort: urgent first, then elective, then preventive; completed last
  const sorted = [...treatmentPlan].sort((a, b) => {
    if (a.status === "COMPLETED" && b.status !== "COMPLETED") return 1;
    if (b.status === "COMPLETED" && a.status !== "COMPLETED") return -1;
    const priorityOrder = { URGENT: 0, ELECTIVE: 1, PREVENTIVE: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  const pending   = treatmentPlan.filter((i) => i.status !== "COMPLETED").length;
  const completed = treatmentPlan.filter((i) => i.status === "COMPLETED").length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Plan de tratamiento</p>
          {treatmentPlan.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {pending} pendiente{pending !== 1 ? "s" : ""} · {completed} completado{completed !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={addItem}
            className="flex items-center gap-1.5 text-xs text-primary border border-primary/30 bg-primary/5 hover:bg-primary/10 px-2.5 py-1.5 rounded-lg transition-colors font-medium"
          >
            <Plus className="w-3.5 h-3.5" />
            Agregar procedimiento
          </button>
        )}
      </div>

      {/* Treatment rows */}
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          No hay procedimientos en el plan de tratamiento.
          {!disabled && " Usa el botón para agregar."}
        </p>
      ) : (
        <div className="space-y-2">
          {sorted.map((item) => {
            const originalIdx = treatmentPlan.findIndex((i) => i.id === item.id);
            return (
              <TreatmentRow
                key={item.id}
                item={item}
                onUpdate={(updated) => updateItem(originalIdx, updated)}
                onRemove={() => removeItem(originalIdx)}
                disabled={disabled}
              />
            );
          })}
        </div>
      )}

      {/* Hygiene plan + next revision */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Plan de higiene oral</label>
          <textarea
            value={hygienePlan ?? ""}
            disabled={disabled}
            onChange={(e) => onChange(treatmentPlan, e.target.value || undefined, nextRevision)}
            rows={2}
            className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 resize-none"
            placeholder="Instrucciones de higiene y cuidado en casa..."
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Próxima revisión</label>
          <input
            type="date"
            value={nextRevision ?? ""}
            disabled={disabled}
            onChange={(e) => onChange(treatmentPlan, hygienePlan, e.target.value || undefined)}
            className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          />
        </div>
      </div>
    </div>
  );
}
