"use client";

import { useState } from "react";
import {
  MOUTH_CONDITION,
  MOUTH_CONDITION_LABEL,
  MOUTH_CONDITION_SEVERITY_LABEL,
  type DentalSpecialtyPayload,
  type MouthCondition,
  type MouthConditionEntry,
} from "@/lib/specialtyPayloadSchemas";
import {
  appendMouthCondition,
  removeMouthCondition,
  toggleMouthConditionResolved,
} from "@/lib/dentalPayload";

type Props = {
  payload: DentalSpecialtyPayload;
  onChange: (payload: DentalSpecialtyPayload) => void;
  disabled?: boolean;
};

const SEVERITIES: NonNullable<MouthConditionEntry["severity"]>[] = ["MILD", "MODERATE", "SEVERE"];

export function MouthConditionsPanel({ payload, onChange, disabled = false }: Props) {
  const [condition, setCondition] = useState<MouthCondition>("MALOCCLUSION");
  const [severity, setSeverity] = useState<NonNullable<MouthConditionEntry["severity"]>>("MILD");
  const [notes, setNotes] = useState("");

  const activeConditions = payload.mouthConditions.filter((item) => !item.resolved);
  const resolvedConditions = payload.mouthConditions.filter((item) => item.resolved);

  const addCondition = () => {
    onChange(appendMouthCondition(payload, { condition, severity, notes }));
    setNotes("");
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-secondary/10 p-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Condiciones de toda la boca</p>
            <p className="text-xs text-muted-foreground">
              Registra hallazgos sistémicos de la cavidad oral sin amarrarlos a una pieza.
            </p>
          </div>
          <span className="w-fit rounded-full border border-border bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
            {activeConditions.length} activa{activeConditions.length !== 1 ? "s" : ""}
          </span>
        </div>

        {!disabled && (
          <div className="mt-3 grid gap-2 lg:grid-cols-[1.35fr_0.9fr_1.5fr_auto]">
            <label className="space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground">Padecimiento</span>
              <select
                value={condition}
                onChange={(event) => setCondition(event.target.value as MouthCondition)}
                className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-xs text-foreground outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
              >
                {MOUTH_CONDITION.map((item) => (
                  <option key={item} value={item}>
                    {MOUTH_CONDITION_LABEL[item]}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground">Severidad</span>
              <select
                value={severity}
                onChange={(event) => setSeverity(event.target.value as NonNullable<MouthConditionEntry["severity"]>)}
                className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-xs text-foreground outline-none transition focus:border-primary focus:ring-1 focus:ring-primary"
              >
                {SEVERITIES.map((item) => (
                  <option key={item} value={item}>
                    {MOUTH_CONDITION_SEVERITY_LABEL[item]}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-[11px] font-medium text-muted-foreground">Notas</span>
              <input
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Ej. sangrado, movilidad generalizada"
                className="h-9 w-full rounded-lg border border-border bg-background px-2.5 text-xs text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </label>

            <button
              type="button"
              onClick={addCondition}
              className="h-9 self-end rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              Agregar
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {payload.mouthConditions.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
            <p className="text-sm font-medium text-foreground">Sin padecimientos generales registrados</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Cuando el diagnóstico no pertenece a una pieza, guárdalo aquí para mantener limpio el odontograma.
            </p>
          </div>
        ) : (
          <>
            {activeConditions.map((item) => (
              <ConditionRow
                key={item.id}
                item={item}
                disabled={disabled}
                onToggle={() => onChange(toggleMouthConditionResolved(payload, item.id))}
                onDelete={() => onChange(removeMouthCondition(payload, item.id))}
              />
            ))}

            {resolvedConditions.length > 0 && (
              <div className="pt-2">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Resueltos
                </p>
                <div className="space-y-2 opacity-75">
                  {resolvedConditions.map((item) => (
                    <ConditionRow
                      key={item.id}
                      item={item}
                      disabled={disabled}
                      onToggle={() => onChange(toggleMouthConditionResolved(payload, item.id))}
                      onDelete={() => onChange(removeMouthCondition(payload, item.id))}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ConditionRow({
  item,
  disabled,
  onToggle,
  onDelete,
}: {
  item: MouthConditionEntry;
  disabled: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled}
          className={`mt-0.5 h-5 w-5 rounded-full border text-[10px] transition ${
            item.resolved
              ? "border-success bg-success/15 text-success"
              : "border-warning bg-warning/10 text-warning"
          } disabled:cursor-not-allowed disabled:opacity-60`}
          aria-label={item.resolved ? "Marcar como activo" : "Marcar como resuelto"}
        >
          {item.resolved ? "✓" : "!"}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{MOUTH_CONDITION_LABEL[item.condition]}</p>
            {item.severity && (
              <span className="rounded-full bg-secondary/60 px-2 py-0.5 text-[11px] text-muted-foreground">
                {MOUTH_CONDITION_SEVERITY_LABEL[item.severity]}
              </span>
            )}
            <span className="text-[11px] text-muted-foreground">{item.date}</span>
          </div>
          {item.notes && (
            <p className="mt-1 text-xs text-muted-foreground">{item.notes}</p>
          )}
        </div>

        {!disabled && (
          <button
            type="button"
            onClick={onDelete}
            className="text-sm text-muted-foreground transition hover:text-destructive"
            aria-label="Eliminar padecimiento"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
