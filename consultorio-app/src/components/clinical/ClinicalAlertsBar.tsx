"use client";

import { AlertTriangle } from "lucide-react";

type Alert = Record<string, unknown>;

type Props = {
  alerts: Alert[];
  allergies?: Alert[];
};

function describe(item: Alert): string {
  if (typeof item.description === "string") return item.description;
  if (typeof item.label === "string") return item.label;
  if (typeof item.name === "string") return item.name;
  return JSON.stringify(item);
}

export function ClinicalAlertsBar({ alerts, allergies = [] }: Props) {
  const items = [
    ...allergies.map((a) => ({ kind: "Alergia", text: describe(a) })),
    ...alerts.map((a) => ({ kind: "Alerta", text: describe(a) })),
  ];
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3">
      <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
      <div className="flex flex-wrap gap-2">
        {items.map((it, idx) => (
          <span
            key={idx}
            className="text-xs font-medium rounded-full bg-destructive/15 text-destructive px-2.5 py-1 border border-destructive/30"
          >
            {it.kind}: {it.text}
          </span>
        ))}
      </div>
    </div>
  );
}
