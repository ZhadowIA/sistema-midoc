"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import type { PrescriptionForm } from "./useClinicalNote";

type Props = {
  prescriptions: PrescriptionForm[];
  onAdd: () => void;
  onUpdate: (index: number, key: keyof PrescriptionForm, value: string) => void;
  onRemove: (index: number) => void;
  disabled?: boolean;
};

export function PrescriptionsSection({
  prescriptions,
  onAdd,
  onUpdate,
  onRemove,
  disabled,
}: Props) {
  return (
    <div className="space-y-3">
      {prescriptions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aún no hay medicamentos recetados.
        </p>
      ) : (
        prescriptions.map((p, i) => (
          <div
            key={i}
            className="rounded-md border border-border bg-secondary/15 p-3 space-y-2"
          >
            <div className="flex items-start gap-2">
              <Input
                placeholder="Medicamento"
                value={p.medication ?? ""}
                onChange={(e) => onUpdate(i, "medication", e.target.value)}
                disabled={disabled}
              />
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="mt-2 text-destructive/80 hover:text-destructive p-1"
                aria-label="Eliminar medicamento"
                disabled={disabled}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <Input
                placeholder="Dosis"
                value={p.dosage ?? ""}
                onChange={(e) => onUpdate(i, "dosage", e.target.value)}
                disabled={disabled}
              />
              <Input
                placeholder="Frecuencia"
                value={p.frequency ?? ""}
                onChange={(e) => onUpdate(i, "frequency", e.target.value)}
                disabled={disabled}
              />
              <Input
                placeholder="Duración"
                value={p.duration ?? ""}
                onChange={(e) => onUpdate(i, "duration", e.target.value)}
                disabled={disabled}
              />
              <Input
                placeholder="Indicaciones"
                value={p.instructions ?? ""}
                onChange={(e) => onUpdate(i, "instructions", e.target.value)}
                disabled={disabled}
              />
            </div>
          </div>
        ))
      )}
      <Button variant="secondary" size="sm" onClick={onAdd} disabled={disabled}>
        <Plus className="w-4 h-4" /> Agregar medicamento
      </Button>
    </div>
  );
}
