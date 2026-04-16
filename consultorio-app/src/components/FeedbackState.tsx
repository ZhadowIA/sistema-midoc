"use client";

import { Loader2, Inbox, AlertTriangle } from "lucide-react";
import type { ComponentType } from "react";

type FeedbackStateVariant = "loading" | "empty" | "error";

type FeedbackStateProps = {
  variant: FeedbackStateVariant;
  title: string;
  description?: string;
  className?: string;
  compact?: boolean;
};

const styleByVariant: Record<FeedbackStateVariant, { icon: ComponentType<{ className?: string }>; iconClass: string; bubbleClass: string }> = {
  loading: {
    icon: Loader2,
    iconClass: "animate-spin text-primary",
    bubbleClass: "bg-primary/10",
  },
  empty: {
    icon: Inbox,
    iconClass: "text-muted-foreground",
    bubbleClass: "bg-secondary/70",
  },
  error: {
    icon: AlertTriangle,
    iconClass: "text-destructive",
    bubbleClass: "bg-destructive/10",
  },
};

export function FeedbackState({
  variant,
  title,
  description,
  className,
  compact = false,
}: FeedbackStateProps) {
  const Icon = styleByVariant[variant].icon;

  return (
    <div
      className={[
        "flex flex-col items-center justify-center text-center rounded-xl border border-border bg-secondary/20",
        compact ? "py-6 px-4" : "py-12 px-6",
        className || "",
      ].join(" ")}
    >
      <div className={["mb-3 rounded-full p-3", styleByVariant[variant].bubbleClass].join(" ")}>
        <Icon className={["h-6 w-6", styleByVariant[variant].iconClass].join(" ")} />
      </div>
      <p className={["font-medium text-foreground", compact ? "text-sm" : "text-base"].join(" ")}>{title}</p>
      {description && (
        <p className={["mt-1 text-muted-foreground", compact ? "text-xs" : "text-sm"].join(" ")}>{description}</p>
      )}
    </div>
  );
}
