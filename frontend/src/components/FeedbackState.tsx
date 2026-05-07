import React from "react";
import { Button } from "./Button";
import { Badge } from "./Badge";

type FeedbackStateProps = {
  type: "loading" | "error" | "success" | "empty";
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
};

const toneByType: Record<FeedbackStateProps["type"], { badge: "info" | "destructive" | "success" | "default"; label: string }> = {
  loading: { badge: "info", label: "Procesando" },
  error: { badge: "destructive", label: "Atención" },
  success: { badge: "success", label: "Completado" },
  empty: { badge: "default", label: "Sin resultados" },
};

export function FeedbackState({ type, title, description, actionLabel, onAction }: FeedbackStateProps) {
  const tone = toneByType[type];
  return (
    <div className="rounded-2xl border border-dashed border-border bg-white p-8 text-center">
      <div className="mb-4 flex justify-center">
        <Badge variant={tone.badge}>{tone.label}</Badge>
      </div>
      <h3 className="mb-2 text-xl font-semibold text-foreground">{title}</h3>
      <p className="mb-5 text-sm text-muted-foreground">{description}</p>
      {actionLabel && onAction && (
        <Button variant="secondary" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
