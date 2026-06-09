"use client";

import { useState } from "react";
import { type PeriodontogramRecord } from "@/lib/specialtyPayloadSchemas";

// ─── Constants ────────────────────────────────────────────────────────────────

// 6-point labels per tooth (buccal side: MB, B, DB | lingual side: ML, L, DL)
const BUCCAL_LABELS  = ["MB", "B", "DB"] as const;
const LINGUAL_LABELS = ["ML", "L", "DL"] as const;

const UPPER_TEETH = ["17","16","15","14","13","12","11","21","22","23","24","25","26","27"] as const;
const LOWER_TEETH = ["47","46","45","44","43","42","41","31","32","33","34","35","36","37"] as const;

// Clinical thresholds for colour coding
const POCKET_WARN   = 4; // mm — mild
const POCKET_SEVERE = 6; // mm — severe

function pocketColor(mm: number): string {
  if (mm >= POCKET_SEVERE) return "#ef4444"; // red
  if (mm >= POCKET_WARN)   return "#f59e0b"; // amber
  return "#22c55e";                           // green
}

// ─── Single cell input ────────────────────────────────────────────────────────

function MeasureCell({
  value,
  onChange,
  disabled,
  isBleed,
}: {
  value: number | boolean | undefined;
  onChange: (v: number | boolean) => void;
  disabled: boolean;
  isBleed: boolean;
}) {
  if (isBleed) {
    const checked = typeof value === "boolean" ? value : false;
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`w-6 h-6 rounded-full border-2 transition-colors text-xs font-bold ${
          checked
            ? "bg-destructive border-destructive text-white"
            : "border-border bg-background text-transparent"
        }`}
        aria-label={checked ? "Sangrado: sí" : "Sangrado: no"}
      >
        •
      </button>
    );
  }

  const num = typeof value === "number" ? value : 0;
  const color = pocketColor(num);

  return (
    <input
      type="number"
      min={0}
      max={15}
      value={num === 0 ? "" : num}
      disabled={disabled}
      onChange={(e) => {
        const v = parseInt(e.target.value, 10);
        onChange(isNaN(v) ? 0 : Math.min(15, Math.max(0, v)));
      }}
      className="w-8 h-7 text-center text-xs rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:cursor-default font-semibold"
      style={{ color }}
      placeholder="–"
    />
  );
}

// ─── Tooth column ─────────────────────────────────────────────────────────────

function ToothColumn({
  toothId,
  record,
  onChange,
  disabled,
  isUpper,
}: {
  toothId: string;
  record: PeriodontogramRecord | undefined;
  onChange: (r: PeriodontogramRecord) => void;
  disabled: boolean;
  isUpper: boolean;
}) {
  const rec: PeriodontogramRecord = record ?? {};
  const pd  = rec.pocketDepth  ?? [0, 0, 0, 0, 0, 0];
  const rec2 = rec.recession    ?? [0, 0, 0, 0, 0, 0];
  const bl  = rec.bleeding     ?? [false, false, false, false, false, false];
  const mob = rec.mobility     ?? 0;
  const fur = rec.furcation    ?? 0;

  const update = (field: keyof PeriodontogramRecord, idx: number, val: number | boolean) => {
    const current = (rec[field] as (number | boolean)[]) ?? (field === "bleeding" ? [false,false,false,false,false,false] : [0,0,0,0,0,0]);
    const next = [...current];
    next[idx] = val;
    onChange({ ...rec, [field]: next });
  };

  const maxPD = Math.max(...pd);

  return (
    <div className="flex flex-col items-center gap-1 min-w-[60px]">
      {/* Tooth ID */}
      <span className={`text-[10px] font-semibold rounded px-1 ${maxPD >= POCKET_SEVERE ? "text-destructive" : maxPD >= POCKET_WARN ? "text-warning" : "text-foreground"}`}>
        {toothId}
      </span>

      {/* Buccal side (shown on top for upper, bottom for lower) */}
      {isUpper && (
        <>
          <div className="flex gap-0.5">
            {BUCCAL_LABELS.map((_, i) => (
              <MeasureCell key={i} value={pd[i]} isBleed={false} disabled={disabled}
                onChange={(v) => update("pocketDepth", i, v)} />
            ))}
          </div>
          <div className="flex gap-0.5">
            {BUCCAL_LABELS.map((_, i) => (
              <MeasureCell key={i} value={rec2[i]} isBleed={false} disabled={disabled}
                onChange={(v) => update("recession", i, v)} />
            ))}
          </div>
          <div className="flex gap-0.5">
            {BUCCAL_LABELS.map((_, i) => (
              <MeasureCell key={i} value={bl[i]} isBleed disabled={disabled}
                onChange={(v) => update("bleeding", i, v)} />
            ))}
          </div>
        </>
      )}

      {/* Mobility & furcation — center row */}
      <div className="flex gap-1 items-center">
        <select
          value={mob}
          disabled={disabled}
          onChange={(e) => onChange({ ...rec, mobility: parseInt(e.target.value) as 0|1|2|3 })}
          className="text-[10px] border border-border rounded px-0.5 py-0.5 bg-background disabled:opacity-50"
          title="Movilidad"
        >
          {[0,1,2,3].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select
          value={fur}
          disabled={disabled}
          onChange={(e) => onChange({ ...rec, furcation: parseInt(e.target.value) as 0|1|2|3 })}
          className="text-[10px] border border-border rounded px-0.5 py-0.5 bg-background disabled:opacity-50"
          title="Furcación"
        >
          {[0,1,2,3].map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>

      {/* Lingual side */}
      {!isUpper && (
        <>
          <div className="flex gap-0.5">
            {LINGUAL_LABELS.map((_, i) => (
              <MeasureCell key={i} value={bl[i+3]} isBleed disabled={disabled}
                onChange={(v) => update("bleeding", i+3, v)} />
            ))}
          </div>
          <div className="flex gap-0.5">
            {LINGUAL_LABELS.map((_, i) => (
              <MeasureCell key={i} value={rec2[i+3]} isBleed={false} disabled={disabled}
                onChange={(v) => update("recession", i+3, v)} />
            ))}
          </div>
          <div className="flex gap-0.5">
            {LINGUAL_LABELS.map((_, i) => (
              <MeasureCell key={i} value={pd[i+3]} isBleed={false} disabled={disabled}
                onChange={(v) => update("pocketDepth", i+3, v)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Arch block ───────────────────────────────────────────────────────────────

function ArchBlock({
  teeth,
  periodontogram,
  onChange,
  disabled,
  isUpper,
  label,
}: {
  teeth: readonly string[];
  periodontogram: Record<string, PeriodontogramRecord>;
  onChange: (toothId: string, r: PeriodontogramRecord) => void;
  disabled: boolean;
  isUpper: boolean;
  label: string;
}) {
  const rowLabels = isUpper
    ? ["Sondaje vestib. (mm)", "Recesión vestib. (mm)", "Sangrado vestib.", "Mov. / Furc."]
    : ["Mov. / Furc.", "Sangrado ling.", "Recesión ling. (mm)", "Sondaje ling. (mm)"];

  return (
    <div className="space-y-1">
      <p className="text-xs font-semibold text-foreground">{label}</p>
      <div className="overflow-x-auto">
        <div className="flex gap-0.5 min-w-max pb-1">
          {/* Row labels */}
          <div className="flex flex-col gap-1 pr-2 justify-around min-w-[130px]">
            {rowLabels.map((l) => (
              <span key={l} className="text-[9px] text-muted-foreground leading-tight">{l}</span>
            ))}
          </div>
          {/* Tooth columns */}
          {teeth.map((id) => (
            <ToothColumn
              key={id}
              toothId={id}
              record={periodontogram[id]}
              onChange={(r) => onChange(id, r)}
              disabled={disabled}
              isUpper={isUpper}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type Props = {
  periodontogram: Record<string, PeriodontogramRecord>;
  onChange: (updated: Record<string, PeriodontogramRecord>) => void;
  disabled?: boolean;
};

export function PeriodontogramGrid({ periodontogram, onChange, disabled = false }: Props) {
  const [expanded, setExpanded] = useState(false);

  const handleChange = (toothId: string, record: PeriodontogramRecord) => {
    onChange({ ...periodontogram, [toothId]: record });
  };

  // Summary: teeth with pocket ≥ 4mm
  const affectedTeeth = [...UPPER_TEETH, ...LOWER_TEETH].filter((id) => {
    const pd = periodontogram[id]?.pocketDepth;
    return pd && Math.max(...pd) >= POCKET_WARN;
  });

  return (
    <div className="space-y-3">
      {/* Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Periodontograma</p>
          {affectedTeeth.length > 0 && (
            <p className="text-xs text-warning">
              {affectedTeeth.length} pieza{affectedTeeth.length > 1 ? "s" : ""} con bolsa ≥ {POCKET_WARN} mm: {affectedTeeth.join(", ")}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-primary hover:underline"
        >
          {expanded ? "Ocultar" : "Mostrar"} periodontograma
        </button>
      </div>

      {expanded && (
        <div className="space-y-6 border border-border rounded-md p-4 bg-secondary/10">
          {/* Legend */}
          <div className="flex gap-4 text-xs">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-success" /> Normal (&lt;{POCKET_WARN}mm)</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-warning" /> Moderada ({POCKET_WARN}-{POCKET_SEVERE-1}mm)</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-destructive" /> Severa (≥{POCKET_SEVERE}mm)</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-destructive text-white text-center text-[8px] leading-3 font-bold">•</span> Sangrado</span>
          </div>

          <ArchBlock
            teeth={UPPER_TEETH}
            periodontogram={periodontogram}
            onChange={handleChange}
            disabled={disabled}
            isUpper={true}
            label="Arcada superior"
          />
          <ArchBlock
            teeth={LOWER_TEETH}
            periodontogram={periodontogram}
            onChange={handleChange}
            disabled={disabled}
            isUpper={false}
            label="Arcada inferior"
          />
        </div>
      )}
    </div>
  );
}
