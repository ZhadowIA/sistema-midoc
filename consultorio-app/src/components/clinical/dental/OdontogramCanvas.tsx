"use client";

import { useState } from "react";
import {
  TOOTH_STATUS,
  TOOTH_STATUS_LABEL,
  TOOTH_STATUS_COLOR,
  PIECE_FINDING,
  PIECE_FINDING_LABEL,
  PIECE_FINDING_COLOR,
  FACE_FINDING,
  FACE_FINDING_LABEL,
  FACE_FINDING_COLOR,
  TOOTH_FACE,
  TOOTH_FACE_LABEL,
  type ToothStatus,
  type ToothRecord,
  type FindingEntry,
  type PieceFinding,
  type FaceFinding,
  type ToothFace,
} from "@/lib/specialtyPayloadSchemas";
import { resolveToothStatusFromFinding } from "@/lib/dentalPayload";

// ─── Tooth type helpers ───────────────────────────────────────────────────────

type ToothType = "incisor" | "canine" | "premolar" | "molar";

function getToothType(id: string): ToothType {
  const pos = parseInt(id) % 10;
  if (pos <= 2) return "incisor";
  if (pos === 3) return "canine";
  if (pos <= 5) return "premolar";
  return "molar";
}

function isUpperTooth(id: string): boolean {
  const q = Math.floor(parseInt(id) / 10);
  return q === 1 || q === 2 || q === 5 || q === 6;
}

// ─── Arch layout constants ────────────────────────────────────────────────────

const TOOTH_W = 34;
const TOOTH_H = 52;
const GAP = 3;

const UPPER_RIGHT = ["18", "17", "16", "15", "14", "13", "12", "11"] as const;
const UPPER_LEFT  = ["21", "22", "23", "24", "25", "26", "27", "28"] as const;
const LOWER_RIGHT = ["48", "47", "46", "45", "44", "43", "42", "41"] as const;
const LOWER_LEFT  = ["31", "32", "33", "34", "35", "36", "37", "38"] as const;
const UPPER_DEC_R = ["55", "54", "53", "52", "51"] as const;
const UPPER_DEC_L = ["61", "62", "63", "64", "65"] as const;
const LOWER_DEC_R = ["85", "84", "83", "82", "81"] as const;
const LOWER_DEC_L = ["71", "72", "73", "74", "75"] as const;

// ─── Anatomical tooth SVG shapes ──────────────────────────────────────────────

/**
 * Draws a stylized tooth crown based on type.
 * Upper teeth point up, lower teeth point down.
 * crownH: height of the crown portion
 * rootH: height visible below/above crown
 */
function toothPath(type: ToothType, upper: boolean, w: number, h: number): string {
  const rootH = Math.round(h * 0.3);
  const crownH = h - rootH;
  const mx = w / 2;
  const flipY = (y: number) => h - y;
  const mirrorPathY = (d: string) =>
    d.replace(/(-?\d+(\.\d+)?),(-?\d+(\.\d+)?)/g, (_, x, _x2, y) => `${x},${flipY(Number(y))}`);

  const crownWidthByType: Record<ToothType, number> = {
    incisor: w * 0.58,
    canine: w * 0.54,
    premolar: w * 0.66,
    molar: w * 0.88,
  };

  const cw = crownWidthByType[type];
  const cl = mx - cw / 2;
  const cr = mx + cw / 2;
  const ct = 0;
  const cb = crownH;

  let upperPath = "";

  if (type === "incisor") {
    upperPath = [
      `M ${cl + 2},${ct + 4}`,
      `Q ${mx - 5},${ct - 0.5} ${mx},${ct + 2}`,
      `Q ${mx + 5},${ct - 0.5} ${cr - 2},${ct + 4}`,
      `C ${cr + 1},${ct + 14} ${cr + 1},${cb - 8} ${cr - 1},${cb - 3}`,
      `Q ${mx + 3},${cb + 1} ${mx},${cb}`,
      `Q ${mx - 3},${cb + 1} ${cl + 1},${cb - 3}`,
      `C ${cl - 1},${cb - 8} ${cl - 1},${ct + 14} ${cl + 2},${ct + 4}`,
      `Z`,
      `M ${mx - 2.5},${cb - 0.5} C ${mx - 2.6},${cb + 7} ${mx - 2},${h - 4} ${mx},${h}`,
      `C ${mx + 2},${h - 4} ${mx + 2.6},${cb + 7} ${mx + 2.5},${cb - 0.5}`,
    ].join(" ");
  } else if (type === "canine") {
    upperPath = [
      `M ${mx},${ct}`,
      `Q ${cr - 5},${ct + 3} ${cr - 1},${ct + 9}`,
      `C ${cr + 1},${ct + 18} ${cr + 1},${cb - 8} ${cr - 1},${cb - 3}`,
      `Q ${mx + 4},${cb + 1} ${mx},${cb}`,
      `Q ${mx - 4},${cb + 1} ${cl + 1},${cb - 3}`,
      `C ${cl - 1},${cb - 8} ${cl - 1},${ct + 18} ${cl + 1},${ct + 9}`,
      `Q ${cl + 5},${ct + 3} ${mx},${ct}`,
      `Z`,
      `M ${mx - 2.6},${cb - 0.5} C ${mx - 2.8},${cb + 9} ${mx - 2.2},${h - 3} ${mx},${h}`,
      `C ${mx + 2.2},${h - 3} ${mx + 2.8},${cb + 9} ${mx + 2.6},${cb - 0.5}`,
    ].join(" ");
  } else if (type === "premolar") {
    upperPath = [
      `M ${cl + 1},${ct + 8}`,
      `Q ${cl + 6},${ct + 1} ${mx - 2},${ct + 3}`,
      `Q ${mx + 1},${ct} ${mx + 4},${ct + 3}`,
      `Q ${cr - 6},${ct + 1} ${cr - 1},${ct + 8}`,
      `C ${cr + 1},${ct + 18} ${cr + 1},${cb - 9} ${cr - 1},${cb - 3}`,
      `Q ${mx + 5},${cb + 1} ${mx},${cb}`,
      `Q ${mx - 5},${cb + 1} ${cl + 1},${cb - 3}`,
      `C ${cl - 1},${cb - 9} ${cl - 1},${ct + 18} ${cl + 1},${ct + 8}`,
      `Z`,
      `M ${mx - 5},${cb - 0.5} C ${mx - 5.2},${cb + 6} ${mx - 4.8},${h - 3} ${mx - 3.2},${h - 1}`,
      `M ${mx + 5},${cb - 0.5} C ${mx + 5.2},${cb + 6} ${mx + 4.8},${h - 3} ${mx + 3.2},${h - 1}`,
    ].join(" ");
  } else {
    upperPath = [
      `M ${cl},${ct + 8}`,
      `Q ${cl + 6},${ct + 1} ${cl + 12},${ct + 7}`,
      `Q ${mx - 2},${ct} ${mx + 3},${ct + 6}`,
      `Q ${cr - 7},${ct + 1} ${cr},${ct + 8}`,
      `C ${cr + 2},${ct + 18} ${cr + 2},${cb - 10} ${cr - 1},${cb - 3}`,
      `Q ${mx + 6},${cb + 1} ${mx},${cb}`,
      `Q ${mx - 6},${cb + 1} ${cl + 1},${cb - 3}`,
      `C ${cl - 2},${cb - 10} ${cl - 2},${ct + 18} ${cl},${ct + 8}`,
      `Z`,
      `M ${cl + 6},${cb - 0.5} C ${cl + 5.7},${cb + 6} ${cl + 6.5},${h - 3} ${cl + 8.5},${h - 1.2}`,
      `M ${mx},${cb - 0.5} C ${mx - 0.2},${cb + 7} ${mx + 0.2},${h - 2.3} ${mx},${h}`,
      `M ${cr - 6},${cb - 0.5} C ${cr - 5.7},${cb + 6} ${cr - 6.5},${h - 3} ${cr - 8.5},${h - 1.2}`,
    ].join(" ");
  }

  return upper ? upperPath : mirrorPathY(upperPath);
}

// ─── 5-surface face indicator ─────────────────────────────────────────────────

function FaceDiamond({
  findings,
  size = 20,
}: {
  findings: FindingEntry[];
  size?: number;
}) {
  const s = size;
  const cx = s / 2;
  const cy = s / 2;
  const r = s * 0.42;

  // Map face → finding color
  const faceColor: Record<ToothFace, string | null> = { V: null, L: null, M: null, D: null, O: null };
  for (const f of findings) {
    if (f.level === "FACE") {
      faceColor[f.face] = FACE_FINDING_COLOR[f.finding];
    }
  }

  const faces: Array<{ face: ToothFace; points: string; label: string }> = [
    {
      face: "V",
      points: `${cx},${cy - r} ${cx - r * 0.55},${cy - r * 0.45} ${cx + r * 0.55},${cy - r * 0.45}`,
      label: "V",
    },
    {
      face: "L",
      points: `${cx},${cy + r} ${cx - r * 0.55},${cy + r * 0.45} ${cx + r * 0.55},${cy + r * 0.45}`,
      label: "L",
    },
    {
      face: "M",
      points: `${cx - r},${cy} ${cx - r * 0.55},${cy - r * 0.45} ${cx - r * 0.55},${cy + r * 0.45}`,
      label: "M",
    },
    {
      face: "D",
      points: `${cx + r},${cy} ${cx + r * 0.55},${cy - r * 0.45} ${cx + r * 0.55},${cy + r * 0.45}`,
      label: "D",
    },
    {
      face: "O",
      points: `${cx - r * 0.55},${cy - r * 0.45} ${cx + r * 0.55},${cy - r * 0.45} ${cx + r * 0.55},${cy + r * 0.45} ${cx - r * 0.55},${cy + r * 0.45}`,
      label: "O",
    },
  ];

  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      {faces.map(({ face, points }) => (
        <polygon
          key={face}
          points={points}
          fill={faceColor[face] ?? "transparent"}
          stroke="#16a34a"
          strokeWidth={1}
          fillOpacity={faceColor[face] ? 0.95 : 0.12}
        />
      ))}
      {faces.map(({ face, points, label }) => {
        const pts = points.split(" ").map((p) => p.split(",").map(Number));
        const lx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
        const ly = pts.reduce((s, p) => s + p[1], 0) / pts.length;
        return (
          <text
            key={face}
            x={lx} y={ly + 1}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={size * 0.24}
            fill={faceColor[face] ? "#fff" : "#15803d"}
            fontFamily="sans-serif"
            fontWeight="700"
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}

function FaceDiamondGlyph({
  findings,
  size = 24,
}: {
  findings: FindingEntry[];
  size?: number;
}) {
  const s = size;
  const cx = s / 2;
  const cy = s / 2;
  const r = s * 0.42;

  const faceColor: Record<ToothFace, string | null> = { V: null, L: null, M: null, D: null, O: null };
  for (const f of findings) {
    if (f.level === "FACE") {
      faceColor[f.face] = FACE_FINDING_COLOR[f.finding];
    }
  }

  const faces: Array<{ face: ToothFace; points: string; label: string }> = [
    { face: "V", points: `${cx},${cy - r} ${cx - r * 0.55},${cy - r * 0.45} ${cx + r * 0.55},${cy - r * 0.45}`, label: "V" },
    { face: "L", points: `${cx},${cy + r} ${cx - r * 0.55},${cy + r * 0.45} ${cx + r * 0.55},${cy + r * 0.45}`, label: "L" },
    { face: "M", points: `${cx - r},${cy} ${cx - r * 0.55},${cy - r * 0.45} ${cx - r * 0.55},${cy + r * 0.45}`, label: "M" },
    { face: "D", points: `${cx + r},${cy} ${cx + r * 0.55},${cy - r * 0.45} ${cx + r * 0.55},${cy + r * 0.45}`, label: "D" },
    { face: "O", points: `${cx - r * 0.55},${cy - r * 0.45} ${cx + r * 0.55},${cy - r * 0.45} ${cx + r * 0.55},${cy + r * 0.45} ${cx - r * 0.55},${cy + r * 0.45}`, label: "O" },
  ];

  return (
    <g>
      {faces.map(({ face, points }) => (
        <polygon
          key={face}
          points={points}
          fill={faceColor[face] ?? "transparent"}
          stroke="#16a34a"
          strokeWidth={1}
          fillOpacity={faceColor[face] ? 0.95 : 0.12}
        />
      ))}
      {faces.map(({ face, points, label }) => {
        const pts = points.split(" ").map((p) => p.split(",").map(Number));
        const lx = pts.reduce((sum, p) => sum + p[0], 0) / pts.length;
        const ly = pts.reduce((sum, p) => sum + p[1], 0) / pts.length;
        return (
          <text
            key={face}
            x={lx}
            y={ly + 1}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={size * 0.24}
            fill={faceColor[face] ? "#fff" : "#15803d"}
            fontFamily="sans-serif"
            fontWeight="700"
          >
            {label}
          </text>
        );
      })}
    </g>
  );
}

// ─── Tooth SVG component ──────────────────────────────────────────────────────

function ToothSVG({
  id,
  record,
  selected,
  onClick,
  small = false,
}: {
  id: string;
  record: ToothRecord | undefined;
  selected: boolean;
  onClick: () => void;
  small?: boolean;
}) {
  const w = small ? 24 : TOOTH_W;
  const h = small ? 36 : TOOTH_H;
  const numberFontSize = small ? 7.5 : 10;
  const upperNumberY = h + (small ? 6 : 10);
  const lowerNumberY = small ? -3 : -4;
  const status = record?.status ?? "HEALTHY";
  const statusColor = TOOTH_STATUS_COLOR[status];
  const outlineColor = "#22c55e";
  const isMissing = status === "MISSING";
  const type = getToothType(id);
  const upper = isUpperTooth(id);
  const findings = record?.findings ?? [];
  const hasFaceFindings = findings.some((f) => f.level === "FACE");
  const hasPieceFindings = findings.some((f) => f.level === "PIECE");
  const hasAnyFindings = findings.length > 0;
  const firstPieceFinding = findings.find((f) => f.level === "PIECE");
  const firstFaceFinding = findings.find((f) => f.level === "FACE");
  const findingOutlineColor =
    firstPieceFinding
      ? PIECE_FINDING_COLOR[firstPieceFinding.finding as PieceFinding]
      : firstFaceFinding
        ? FACE_FINDING_COLOR[firstFaceFinding.finding as FaceFinding]
        : null;
  const toothStroke = findingOutlineColor ?? (hasAnyFindings ? statusColor : outlineColor);

  return (
    <g
      onClick={onClick}
      style={{ cursor: "pointer" }}
      role="button"
      aria-label={`Pieza ${id}: ${TOOTH_STATUS_LABEL[status]}`}
    >
      {/* Selection ring */}
      <rect
        x={-1} y={-1} width={w + 2} height={h + 2}
        rx={5} ry={5}
        fill="transparent"
        stroke={selected ? "#2563eb" : "transparent"}
        strokeWidth={selected ? 2 : 0}
      />

      {isMissing ? (
        <>
          <line x1={4} y1={4} x2={w - 4} y2={h - 4} stroke="#9ca3af" strokeWidth={1.5} strokeLinecap="round" />
          <line x1={w - 4} y1={4} x2={4} y2={h - 4} stroke="#9ca3af" strokeWidth={1.5} strokeLinecap="round" />
        </>
      ) : (
        <>
          {/* Anatomical tooth shape */}
          <path
            d={toothPath(type, upper, w, h)}
            fill={status === "HEALTHY" ? "#ffffff" : statusColor}
            fillOpacity={status === "HEALTHY" ? 1 : 0.22}
            stroke={toothStroke}
            strokeWidth={hasAnyFindings ? 1.9 : 1.35}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* Piece-level finding indicator */}
          {hasPieceFindings && (
            <circle
              cx={w / 2}
              cy={upper ? h * 0.38 : h * 0.62}
              r={4}
              fill={PIECE_FINDING_COLOR[findings.find((f) => f.level === "PIECE")!.finding as PieceFinding]}
              fillOpacity={0.9}
            />
          )}
          {/* Face-level finding indicator (mini diamond) */}
          {hasFaceFindings && (
            <g transform={`translate(${w / 2 - 15}, ${upper ? h * 0.2 : h * 0.36})`}>
              <FaceDiamondGlyph findings={findings} size={30} />
            </g>
          )}
        </>
      )}

      {/* Tooth number */}
      <text
        x={w / 2}
        y={upper ? upperNumberY : lowerNumberY}
        textAnchor="middle"
        fontSize={numberFontSize}
        fill={isMissing ? "#9ca3af" : "#374151"}
        fontWeight="700"
        fontFamily="sans-serif"
      >
        {id}
      </text>
    </g>
  );
}

// ─── 3-step finding picker ────────────────────────────────────────────────────

type PickerStep = "level" | "finding" | "face";

function FindingPicker({
  toothId,
  record,
  onAddFinding,
  onDeleteFinding,
  onStatusChange,
  onClose,
}: {
  toothId: string;
  record: ToothRecord;
  onAddFinding: (entry: FindingEntry) => void;
  onDeleteFinding: (id: string) => void;
  onStatusChange: (s: ToothStatus) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"add" | "history" | "status">("add");
  const [step, setStep] = useState<PickerStep>("level");
  const [level, setLevel] = useState<"PIECE" | "FACE" | null>(null);
  const [finding, setFinding] = useState<PieceFinding | FaceFinding | null>(null);
  const [notes, setNotes] = useState("");

  const findings = record.findings ?? [];
  const status = record.status ?? "HEALTHY";

  function reset() {
    setStep("level");
    setLevel(null);
    setFinding(null);
    setNotes("");
  }

  function confirm(face?: ToothFace) {
    if (!level || !finding) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const date = new Date().toISOString().slice(0, 10);
    if (level === "PIECE") {
      onAddFinding({ id, date, level: "PIECE", finding: finding as PieceFinding, notes: notes || undefined });
    } else if (face) {
      onAddFinding({ id, date, level: "FACE", finding: finding as FaceFinding, face, notes: notes || undefined });
    }
    reset();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-card border border-border rounded-xl shadow-2xl p-0 w-[320px] max-h-[80vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-border">
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-sm font-semibold text-foreground">
              Pieza <span className="text-primary font-mono">{toothId}</span>
            </p>
            <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
          </div>
          <div className="flex gap-1">
            {(["add", "history", "status"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => { setTab(t); reset(); }}
                className={`flex-1 text-xs py-1.5 rounded-lg transition-colors ${
                  tab === t
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-muted-foreground hover:bg-secondary/40"
                }`}
              >
                {t === "add" ? "Agregar" : t === "history" ? `Historial (${findings.length})` : "Estado"}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-4">
          {/* ── ADD TAB ── */}
          {tab === "add" && (
            <div className="space-y-3">
              {step === "level" && (
                <>
                  <p className="text-xs text-muted-foreground">¿Dónde se localiza el hallazgo?</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => { setLevel("PIECE"); setStep("finding"); }}
                      className="flex min-h-[146px] flex-col items-center justify-center gap-2 rounded-lg border border-border p-4 hover:border-primary hover:bg-primary/5 transition-colors"
                    >
                      <svg width="40" height="40" viewBox="0 0 32 32" className="opacity-70">
                        <circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" strokeWidth="1.5" />
                        <circle cx="16" cy="16" r="5" fill="currentColor" opacity="0.4" />
                      </svg>
                      <span className="text-sm font-semibold text-foreground">Pieza completa</span>
                      <span className="text-xs text-muted-foreground text-center">Absceso, fractura, corona…</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setLevel("FACE"); setStep("finding"); }}
                      className="flex min-h-[146px] flex-col items-center justify-center gap-2 rounded-lg border border-border p-4 hover:border-primary hover:bg-primary/5 transition-colors"
                    >
                      <FaceDiamond findings={[]} size={40} />
                      <span className="text-sm font-semibold text-foreground">Cara / Superficie</span>
                      <span className="text-xs text-muted-foreground text-center">Caries, amalgama, resina…</span>
                    </button>
                  </div>
                </>
              )}

              {step === "finding" && level === "PIECE" && (
                <>
                  <div className="flex items-center gap-1.5 mb-1">
                    <button type="button" onClick={() => setStep("level")} className="text-xs text-muted-foreground hover:text-foreground">← Atrás</button>
                    <span className="text-xs text-muted-foreground">Hallazgo — pieza completa</span>
                  </div>
                  <div className="grid grid-cols-1 gap-1">
                    {PIECE_FINDING.map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => { setFinding(f); setStep("face"); }}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:bg-secondary/40 text-xs text-left transition-colors"
                      >
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: PIECE_FINDING_COLOR[f] }} />
                        {PIECE_FINDING_LABEL[f]}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {step === "finding" && level === "FACE" && (
                <>
                  <div className="flex items-center gap-1.5 mb-1">
                    <button type="button" onClick={() => setStep("level")} className="text-xs text-muted-foreground hover:text-foreground">← Atrás</button>
                    <span className="text-xs text-muted-foreground">Hallazgo — cara</span>
                  </div>
                  <div className="grid grid-cols-1 gap-1">
                    {FACE_FINDING.map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => { setFinding(f); setStep("face"); }}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:bg-secondary/40 text-xs text-left transition-colors"
                      >
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: FACE_FINDING_COLOR[f] }} />
                        {FACE_FINDING_LABEL[f]}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {step === "face" && level === "PIECE" && finding && (
                <>
                  <div className="flex items-center gap-1.5 mb-1">
                    <button type="button" onClick={() => setStep("finding")} className="text-xs text-muted-foreground hover:text-foreground">← Atrás</button>
                    <span className="text-xs text-muted-foreground">Confirmar hallazgo</span>
                  </div>
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-secondary/30 mb-3">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: PIECE_FINDING_COLOR[finding as PieceFinding] }} />
                    <span className="text-xs font-medium">{PIECE_FINDING_LABEL[finding as PieceFinding]}</span>
                    <span className="text-[10px] text-muted-foreground ml-auto">Pieza completa</span>
                  </div>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Notas (opcional)"
                    rows={2}
                    className="w-full text-xs border border-border rounded-lg px-2.5 py-2 bg-background resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={() => { confirm(); }}
                    className="w-full mt-2 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
                  >
                    Registrar hallazgo
                  </button>
                </>
              )}

              {step === "face" && level === "FACE" && finding && (
                <>
                  <div className="flex items-center gap-1.5 mb-1">
                    <button type="button" onClick={() => setStep("finding")} className="text-xs text-muted-foreground hover:text-foreground">← Atrás</button>
                    <span className="text-xs text-muted-foreground">Selecciona la cara</span>
                  </div>
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-secondary/30 mb-3">
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: FACE_FINDING_COLOR[finding as FaceFinding] }} />
                    <span className="text-xs font-medium">{FACE_FINDING_LABEL[finding as FaceFinding]}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-1 mb-3">
                    {TOOTH_FACE.map((face) => (
                      <button
                        key={face}
                        type="button"
                        onClick={() => confirm(face)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border hover:border-primary hover:bg-primary/5 text-xs text-left transition-colors"
                      >
                        <span className="w-5 h-5 rounded-full bg-secondary/50 flex items-center justify-center font-mono text-[10px] font-bold">{face}</span>
                        {TOOTH_FACE_LABEL[face]}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Notas (opcional)"
                    rows={2}
                    className="w-full text-xs border border-border rounded-lg px-2.5 py-2 bg-background resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </>
              )}
            </div>
          )}

          {/* ── HISTORY TAB ── */}
          {tab === "history" && (
            <div className="space-y-2">
              {findings.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Sin hallazgos registrados</p>
              ) : (
                [...findings].sort((a, b) => b.date.localeCompare(a.date)).map((f) => {
                  const isface = f.level === "FACE";
                  const color = isface ? FACE_FINDING_COLOR[f.finding as FaceFinding] : PIECE_FINDING_COLOR[f.finding as PieceFinding];
                  const label = isface ? FACE_FINDING_LABEL[f.finding as FaceFinding] : PIECE_FINDING_LABEL[f.finding as PieceFinding];
                  return (
                    <div key={f.id} className="flex gap-2 p-2.5 rounded-lg border border-border bg-secondary/10">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: color }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-medium text-foreground">{label}</span>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">{f.date}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isface ? "bg-blue-500/10 text-blue-600" : "bg-purple-500/10 text-purple-600"}`}>
                            {isface ? `Cara ${f.face} · ${TOOTH_FACE_LABEL[f.face]}` : "Pieza completa"}
                          </span>
                        </div>
                        {f.notes && <p className="text-[10px] text-muted-foreground mt-1 truncate">{f.notes}</p>}
                      </div>
                      <button
                        type="button"
                        onClick={() => onDeleteFinding(f.id)}
                        className="text-muted-foreground hover:text-destructive text-xs flex-shrink-0"
                        aria-label="Eliminar"
                      >
                        ×
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ── STATUS TAB ── */}
          {tab === "status" && (
            <div className="grid grid-cols-1 gap-1">
              {TOOTH_STATUS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { onStatusChange(s); onClose(); }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs text-left transition-colors ${
                    s === status
                      ? "border-primary bg-primary/10 text-primary font-semibold"
                      : "border-border hover:bg-secondary/40 text-foreground"
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: TOOTH_STATUS_COLOR[s] }} />
                  {TOOTH_STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Arch row ─────────────────────────────────────────────────────────────────

function ArchRow({
  teeth,
  odontogram,
  selectedTooth,
  onToothClick,
  small = false,
}: {
  teeth: readonly string[];
  odontogram: Record<string, ToothRecord>;
  selectedTooth: string | null;
  onToothClick: (id: string) => void;
  small?: boolean;
}) {
  const w = small ? 24 : TOOTH_W;
  const h = small ? 36 : TOOTH_H;
  const gap = small ? 2 : GAP;
  const cell = w + gap;
  const totalW = teeth.length * cell - gap;
  const padTop = small ? 8 : 12;
  const padBottom = small ? 10 : 14;
  const totalH = h + padTop + padBottom;

  return (
    <svg width={totalW} height={totalH} viewBox={`0 0 ${totalW} ${totalH}`} overflow="visible">
      {teeth.map((id, idx) => (
        <g key={id} transform={`translate(${idx * cell}, ${padTop})`}>
          <ToothSVG
            id={id}
            record={odontogram[id]}
            selected={selectedTooth === id}
            onClick={() => onToothClick(id)}
            small={small}
          />
        </g>
      ))}
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type Props = {
  odontogram: Record<string, ToothRecord>;
  onChange: (updated: Record<string, ToothRecord>) => void;
  disabled?: boolean;
};

export function OdontogramCanvas({ odontogram, onChange, disabled = false }: Props) {
  const [selectedTooth, setSelectedTooth] = useState<string | null>(null);
  const [showDeciduous, setShowDeciduous] = useState(false);

  const handleToothClick = (id: string) => {
    if (disabled) return;
    setSelectedTooth(id);
  };

  const getRecord = (id: string): ToothRecord => odontogram[id] ?? { status: "HEALTHY" as ToothStatus, findings: [] };

  const handleStatusChange = (id: string, status: ToothStatus) => {
    const rec = getRecord(id);
    onChange({ ...odontogram, [id]: { ...rec, status } });
  };

  const handleAddFinding = (id: string, entry: FindingEntry) => {
    const rec = getRecord(id);
    const findings = [...(rec.findings ?? []), entry];
    const status = resolveToothStatusFromFinding(entry) ?? rec.status;
    onChange({ ...odontogram, [id]: { ...rec, status, findings } });
  };

  const handleDeleteFinding = (id: string, findingId: string) => {
    const rec = getRecord(id);
    const findings = (rec.findings ?? []).filter((f) => f.id !== findingId);
    onChange({ ...odontogram, [id]: { ...rec, findings } });
  };

  // Summary counts
  const totalFindings = Object.values(odontogram).reduce(
    (sum, r) => sum + (r.findings?.length ?? 0), 0
  );
  const nonHealthy = Object.values(odontogram).filter((r) => r.status !== "HEALTHY").length;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Dentición:</span>
          {(["Permanente", "Decidua"] as const).map((label, i) => {
            const active = showDeciduous === (i === 1);
            return (
              <button
                key={label}
                type="button"
                onClick={() => setShowDeciduous(i === 1)}
                className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                  active
                    ? "border-primary bg-primary/10 text-primary font-medium"
                    : "border-border text-muted-foreground hover:bg-secondary/40"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
        {disabled && (
          <span className="text-xs text-muted-foreground bg-secondary/50 px-2 py-1 rounded">Solo lectura</span>
        )}
      </div>

      {/* Odontogram grid */}
      <div className="overflow-x-auto">
        <div className="flex flex-col items-center gap-1 min-w-max py-2">
          {/* Upper arch */}
          <div className="flex items-end gap-1">
            <div className="flex flex-col items-center">
              <span className="text-[9px] text-muted-foreground mb-1">Sup. Der.</span>
              <ArchRow
                teeth={showDeciduous ? UPPER_DEC_R : UPPER_RIGHT}
                odontogram={odontogram}
                selectedTooth={selectedTooth}
                onToothClick={handleToothClick}
                small={showDeciduous}
              />
            </div>
            <div className="w-px h-10 bg-border self-end mb-1" />
            <div className="flex flex-col items-center">
              <span className="text-[9px] text-muted-foreground mb-1">Sup. Izq.</span>
              <ArchRow
                teeth={showDeciduous ? UPPER_DEC_L : UPPER_LEFT}
                odontogram={odontogram}
                selectedTooth={selectedTooth}
                onToothClick={handleToothClick}
                small={showDeciduous}
              />
            </div>
          </div>

          {/* Midline */}
          <div className="flex items-center gap-2 my-0.5">
            <div className="h-px w-28 bg-border/60" />
            <span className="text-[9px] text-muted-foreground whitespace-nowrap">Línea media</span>
            <div className="h-px w-28 bg-border/60" />
          </div>

          {/* Lower arch */}
          <div className="flex items-start gap-1">
            <div className="flex flex-col items-center">
              <ArchRow
                teeth={showDeciduous ? LOWER_DEC_R : LOWER_RIGHT}
                odontogram={odontogram}
                selectedTooth={selectedTooth}
                onToothClick={handleToothClick}
                small={showDeciduous}
              />
              <span className="text-[9px] text-muted-foreground mt-1">Inf. Der.</span>
            </div>
            <div className="w-px h-10 bg-border self-start mt-1" />
            <div className="flex flex-col items-center">
              <ArchRow
                teeth={showDeciduous ? LOWER_DEC_L : LOWER_LEFT}
                odontogram={odontogram}
                selectedTooth={selectedTooth}
                onToothClick={handleToothClick}
                small={showDeciduous}
              />
              <span className="text-[9px] text-muted-foreground mt-1">Inf. Izq.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Instruction */}
      {!disabled && (
        <p className="text-xs text-muted-foreground text-center">
          Haz clic en cualquier pieza para registrar hallazgos o cambiar su estado
        </p>
      )}

      {/* Summary */}
      {(totalFindings > 0 || nonHealthy > 0) && (
        <div className="border border-border rounded-lg p-3 bg-secondary/10">
          <p className="text-xs font-semibold text-foreground mb-2">Resumen clínico</p>
          <div className="flex flex-wrap gap-2">
            {nonHealthy > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full border border-amber-400/40 text-amber-600 bg-amber-500/5">
                {nonHealthy} pieza{nonHealthy !== 1 ? "s" : ""} con estado clínico
              </span>
            )}
            {totalFindings > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full border border-primary/30 text-primary bg-primary/5">
                {totalFindings} hallazgo{totalFindings !== 1 ? "s" : ""} registrado{totalFindings !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Finding picker modal */}
      {selectedTooth && !disabled && (
        <FindingPicker
          toothId={selectedTooth}
          record={getRecord(selectedTooth)}
          onAddFinding={(entry) => handleAddFinding(selectedTooth, entry)}
          onDeleteFinding={(fid) => handleDeleteFinding(selectedTooth, fid)}
          onStatusChange={(s) => handleStatusChange(selectedTooth, s)}
          onClose={() => setSelectedTooth(null)}
        />
      )}
    </div>
  );
}
