"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { TextArea } from "@/components/TextArea";

export type AssessmentItem = {
  diagnosis: string;
  probabilityPct?: number;
  basis?: string;
  studiesToConfirm?: string[];
};

type Props = {
  value: AssessmentItem[];
  onChange: (next: AssessmentItem[]) => void;
  disabled?: boolean;
};

export function AssessmentList({ value, onChange, disabled }: Props) {
  const update = (idx: number, patch: Partial<AssessmentItem>) => {
    onChange(value.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
  };
  const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx));
  const add = () =>
    onChange([...value, { diagnosis: "", probabilityPct: undefined, basis: "" }]);

  return (
    <div className="space-y-3">
      {value.map((item, idx) => (
        <div
          key={idx}
          className="rounded-xl border border-border bg-card/50 p-4 space-y-2"
        >
          <div className="flex gap-2 items-start">
            <Input
              label={`Diagnóstico #${idx + 1}`}
              value={item.diagnosis}
              onChange={(e) => update(idx, { diagnosis: e.target.value })}
              disabled={disabled}
              className="flex-1"
            />
            <Input
              label="Probabilidad (%)"
              type="number"
              min={0}
              max={100}
              value={item.probabilityPct ?? ""}
              onChange={(e) =>
                update(idx, {
                  probabilityPct:
                    e.target.value === ""
                      ? undefined
                      : Math.max(0, Math.min(100, Number(e.target.value))),
                })
              }
              disabled={disabled}
              className="w-32"
            />
            <button
              type="button"
              onClick={() => remove(idx)}
              disabled={disabled}
              className="mt-7 p-2 text-red-600 hover:bg-red-500/10 rounded-lg"
              aria-label="Eliminar diagnóstico"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <TextArea
            label="Fundamento clínico"
            value={item.basis ?? ""}
            onChange={(e) => update(idx, { basis: e.target.value })}
            disabled={disabled}
            rows={2}
          />
          <Input
            label="Estudios para confirmar (separados por coma)"
            value={(item.studiesToConfirm ?? []).join(", ")}
            onChange={(e) =>
              update(idx, {
                studiesToConfirm: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            disabled={disabled}
          />
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={add}
        disabled={disabled}
      >
        <Plus className="w-4 h-4" /> Agregar diagnóstico
      </Button>
    </div>
  );
}
