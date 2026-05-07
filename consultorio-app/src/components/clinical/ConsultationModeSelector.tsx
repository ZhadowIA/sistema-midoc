"use client";

import { Mic, Pencil, Sparkles } from "lucide-react";

export type ConsultationMode = "MANUAL" | "AI_DICTATION" | "HYBRID";

type Props = {
  value: ConsultationMode;
  onChange: (mode: ConsultationMode) => void;
  aiAvailable: boolean;
};

const OPTIONS: Array<{
  value: ConsultationMode;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  requiresAi: boolean;
}> = [
  {
    value: "MANUAL",
    label: "Manual",
    description: "Llenas los campos tú mismo",
    icon: Pencil,
    requiresAi: false,
  },
  {
    value: "AI_DICTATION",
    label: "Dictado + IA",
    description: "Grabas la consulta y la IA redacta",
    icon: Mic,
    requiresAi: true,
  },
  {
    value: "HYBRID",
    label: "Híbrido",
    description: "Tú llenas y la IA completa lo faltante",
    icon: Sparkles,
    requiresAi: true,
  },
];

export function ConsultationModeSelector({ value, onChange, aiAvailable }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {OPTIONS.map((opt) => {
        const disabled = opt.requiresAi && !aiAvailable;
        const active = value === opt.value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => !disabled && onChange(opt.value)}
            className={[
              "text-left rounded-md border p-3 transition-colors",
              active
                ? "border-primary bg-primary/10"
                : "border-border bg-background hover:bg-secondary/30",
              disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
            ].join(" ")}
            aria-pressed={active}
          >
            <div className="flex items-center gap-2">
              <Icon className="w-4 h-4" />
              <span className="font-medium">{opt.label}</span>
              {disabled && (
                <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
                  No disponible
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{opt.description}</p>
          </button>
        );
      })}
    </div>
  );
}
