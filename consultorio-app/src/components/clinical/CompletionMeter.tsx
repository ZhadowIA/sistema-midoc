"use client";

type Props = {
  pct: number;
  label?: string;
  className?: string;
};

export function CompletionMeter({ pct, label, className = "" }: Props) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  const color =
    clamped >= 80
      ? "bg-success"
      : clamped >= 40
      ? "bg-warning"
      : "bg-destructive";
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {label && <span className="text-sm text-muted-foreground">{label}</span>}
      <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-300`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="text-sm font-medium tabular-nums min-w-[3ch] text-right">
        {clamped}%
      </span>
    </div>
  );
}
