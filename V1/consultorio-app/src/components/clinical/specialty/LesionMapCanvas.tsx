"use client";

import { useState } from "react";
import { Trash2, X } from "lucide-react";
import {
  LESION_MORPHOLOGY,
  LESION_MORPHOLOGY_LABEL,
  type Lesion,
  type LesionMorphology,
} from "@/lib/specialtyPayloadSchemas";

// ─── Color palette by morphology ──────────────────────────────────────────────

const MORPH_COLOR: Partial<Record<LesionMorphology, string>> = {
  MACULE:          "#94a3b8",
  PATCH:           "#64748b",
  PAPULE:          "#f97316",
  PLAQUE:          "#ea580c",
  NODULE:          "#dc2626",
  TUMOR:           "#7f1d1d",
  VESICLE:         "#3b82f6",
  BULLA:           "#1d4ed8",
  PUSTULE:         "#eab308",
  WHEAL:           "#f59e0b",
  SCALE:           "#a8a29e",
  CRUST:           "#92400e",
  EROSION:         "#d97706",
  ULCER:           "#b91c1c",
  FISSURE:         "#78716c",
  SCAR:            "#d1d5db",
  ATROPHY:         "#e2e8f0",
  LICHENIFICATION: "#a16207",
};

function lesionColor(m: LesionMorphology | undefined): string {
  return (m && MORPH_COLOR[m]) ? MORPH_COLOR[m]! : "#6366f1";
}

function uid() { return `l-${Date.now()}-${Math.random().toString(36).slice(2,6)}`; }

// ─── Body silhouette SVG (simplified front + back) ────────────────────────────
// Coordinates are relative to a 200×420 viewBox

const BODY_SVG_PATHS = {
  // Front view — simplified anatomical silhouette
  head:    "M85,10 Q100,0 115,10 L120,45 Q100,55 80,45 Z",
  neck:    "M88,44 L92,58 L108,58 L112,44 Z",
  torso:   "M75,58 L60,130 L65,200 L135,200 L140,130 L125,58 Z",
  leftArm: "M75,62 L55,65 L40,140 L55,142 L68,80 L80,80 Z",
  rightArm:"M125,62 L145,65 L160,140 L145,142 L132,80 L120,80 Z",
  leftLeg: "M65,200 L60,310 L75,312 L90,240 L95,200 Z",
  rightLeg:"M105,200 L110,240 L125,312 L140,310 L135,200 Z",
  leftFoot:"M60,310 L55,330 L80,332 L80,312 Z",
  rightFoot:"M120,312 L120,332 L145,330 L140,310 Z",
};

// ─── Lesion marker on SVG ─────────────────────────────────────────────────────

function LesionMarker({
  lesion,
  selected,
  onClick,
}: {
  lesion: Lesion;
  selected: boolean;
  onClick: () => void;
}) {
  // x/y are percentages of 200×420 viewBox
  const cx = (lesion.x / 100) * 200;
  const cy = (lesion.y / 100) * 420;
  const color = lesionColor(lesion.morphology);

  return (
    <g onClick={(e) => { e.stopPropagation(); onClick(); }} style={{ cursor: "pointer" }}>
      <circle cx={cx} cy={cy} r={selected ? 8 : 6}
        fill={color} fillOpacity={0.8}
        stroke={selected ? "#1d4ed8" : "white"}
        strokeWidth={selected ? 2 : 1.5} />
      {selected && (
        <circle cx={cx} cy={cy} r={12} fill="transparent" stroke="#1d4ed8" strokeWidth={1} strokeDasharray="3 2" />
      )}
    </g>
  );
}

// ─── Lesion detail form ───────────────────────────────────────────────────────

function LesionDetail({
  lesion,
  onUpdate,
  onRemove,
  onClose,
  disabled,
}: {
  lesion: Lesion;
  onUpdate: (l: Lesion) => void;
  onRemove: () => void;
  onClose: () => void;
  disabled: boolean;
}) {
  const set = (patch: Partial<Lesion>) => onUpdate({ ...lesion, ...patch });

  return (
    <div className="border border-border rounded-md bg-card shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-sm font-semibold text-foreground">
          Lesión #{lesion.id.slice(-4)}
          {lesion.morphology && (
            <span className="ml-2 text-xs font-normal" style={{ color: lesionColor(lesion.morphology) }}>
              {LESION_MORPHOLOGY_LABEL[lesion.morphology]}
            </span>
          )}
        </span>
        <div className="flex items-center gap-1">
          {!disabled && (
            <button type="button" onClick={onRemove}
              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button type="button" onClick={onClose}
            className="p-1 rounded hover:bg-secondary/50 text-muted-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Fields */}
      <div className="p-3 grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className="text-xs text-muted-foreground block mb-1">Morfología</label>
          <select value={lesion.morphology ?? ""} disabled={disabled}
            onChange={(e) => set({ morphology: (e.target.value || undefined) as LesionMorphology })}
            className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50">
            <option value="">— Seleccionar —</option>
            {LESION_MORPHOLOGY.map((m) => (
              <option key={m} value={m}>{LESION_MORPHOLOGY_LABEL[m]}</option>
            ))}
          </select>
        </div>

        {([
          { label: "Color",       field: "color",     placeholder: "Eritematosa, hiperpigmentada…" },
          { label: "Tamaño",      field: "size",      placeholder: "2 × 3 cm" },
          { label: "Bordes",      field: "border",    placeholder: "Definidos, irregulares…" },
          { label: "Superficie",  field: "surface",   placeholder: "Lisa, descamativa…" },
          { label: "Evolución",   field: "evolution", placeholder: "2 semanas, crecimiento progresivo…" },
        ] as const).map(({ label, field, placeholder }) => (
          <div key={field}>
            <label className="text-xs text-muted-foreground block mb-1">{label}</label>
            <input type="text" value={(lesion[field] as string) ?? ""} disabled={disabled}
              onChange={(e) => set({ [field]: e.target.value || undefined })}
              className="w-full text-xs border border-border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              placeholder={placeholder} />
          </div>
        ))}

        <div className="col-span-2">
          <label className="text-xs text-muted-foreground block mb-1">Notas clínicas</label>
          <textarea rows={2} value={lesion.notes ?? ""} disabled={disabled}
            onChange={(e) => set({ notes: e.target.value || undefined })}
            className="w-full text-xs border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 resize-none"
            placeholder="Observaciones adicionales, síntomas asociados…" />
        </div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type Props = {
  lesions: Lesion[];
  onChange: (lesions: Lesion[]) => void;
  disabled?: boolean;
};

export function LesionMapCanvas({ lesions, onChange, disabled = false }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const addLesion = (x: number, y: number) => {
    if (disabled) return;
    const newLesion: Lesion = { id: uid(), region: "CHEST", x, y, photos: [] };
    const updated = [...lesions, newLesion];
    onChange(updated);
    setSelectedId(newLesion.id);
  };

  const updateLesion = (updated: Lesion) => {
    onChange(lesions.map((l) => l.id === updated.id ? updated : l));
  };

  const removeLesion = (id: string) => {
    onChange(lesions.filter((l) => l.id !== id));
    setSelectedId(null);
  };

  const selectedLesion = lesions.find((l) => l.id === selectedId) ?? null;

  return (
    <div className="space-y-3">
      {/* Instructions */}
      {!disabled && (
        <p className="text-xs text-muted-foreground">
          Haz clic sobre la silueta para marcar una lesión. Selecciona un marcador para editar sus características.
        </p>
      )}

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Body map */}
        <div className="relative bg-secondary/10 border border-border rounded-md overflow-hidden"
          style={{ minWidth: 160, maxWidth: 220, width: "100%", aspectRatio: "200/420" }}>
          <svg viewBox="0 0 200 420" className="w-full h-full absolute inset-0">
            {/* Clickable silhouette */}
            {!disabled && (
              <rect x={0} y={0} width={200} height={420} fill="transparent"
                onClick={(e) => {
                  const svg = e.currentTarget.closest("svg")!;
                  const rect2 = svg.getBoundingClientRect();
                  const scaleX = 200 / rect2.width;
                  const scaleY = 420 / rect2.height;
                  const x = Math.round(((e.clientX - rect2.left) * scaleX / 200) * 1000) / 10;
                  const y = Math.round(((e.clientY - rect2.top)  * scaleY / 420) * 1000) / 10;
                  addLesion(x, y);
                }}
                style={{ cursor: disabled ? "default" : "crosshair" }}
              />
            )}
            {/* Body paths */}
            {Object.values(BODY_SVG_PATHS).map((d, i) => (
              <path key={i} d={d} fill="#e2e8f0" stroke="#94a3b8" strokeWidth={1}
                onClick={(e) => {
                  if (disabled) return;
                  const svg = (e.currentTarget as SVGPathElement).closest("svg")!;
                  const rect2 = svg.getBoundingClientRect();
                  const scaleX = 200 / rect2.width;
                  const scaleY = 420 / rect2.height;
                  const x = Math.round(((e.clientX - rect2.left) * scaleX / 200) * 1000) / 10;
                  const y = Math.round(((e.clientY - rect2.top)  * scaleY / 420) * 1000) / 10;
                  addLesion(x, y);
                }}
              />
            ))}
            {/* Lesion markers */}
            {lesions.map((l) => (
              <LesionMarker key={l.id} lesion={l}
                selected={l.id === selectedId}
                onClick={() => setSelectedId(l.id === selectedId ? null : l.id)} />
            ))}
          </svg>
        </div>

        {/* Detail panel */}
        <div className="flex-1 space-y-2">
          {selectedLesion ? (
            <LesionDetail
              lesion={selectedLesion}
              onUpdate={updateLesion}
              onRemove={() => removeLesion(selectedLesion.id)}
              onClose={() => setSelectedId(null)}
              disabled={disabled}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground text-center py-8 border border-dashed border-border rounded-md">
              {lesions.length === 0
                ? disabled ? "Sin lesiones registradas" : "Haz clic en la silueta para agregar una lesión"
                : "Selecciona un marcador para ver los detalles"}
            </div>
          )}

          {/* Lesion list */}
          {lesions.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">{lesions.length} lesión{lesions.length !== 1 ? "es" : ""} registrada{lesions.length !== 1 ? "s" : ""}</p>
              {lesions.map((l, idx) => (
                <button key={l.id} type="button"
                  onClick={() => setSelectedId(l.id === selectedId ? null : l.id)}
                  className={`w-full flex items-center gap-2 text-left px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
                    l.id === selectedId ? "border-primary bg-primary/5" : "border-border hover:bg-secondary/30"
                  }`}>
                  <span className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: lesionColor(l.morphology) }} />
                  <span className="flex-1 truncate">
                    #{idx + 1} — {l.morphology ? LESION_MORPHOLOGY_LABEL[l.morphology] : "Sin clasificar"}
                    {l.size ? ` · ${l.size}` : ""}
                  </span>
                  <span className="text-muted-foreground">{l.x.toFixed(0)}%·{l.y.toFixed(0)}%</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Morphology legend */}
      <div className="flex flex-wrap gap-1.5 pt-2">
        {(["MACULE","PAPULE","NODULE","VESICLE","PUSTULE","SCALE","ULCER","SCAR"] as LesionMorphology[]).map((m) => (
          <span key={m} className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: lesionColor(m) }} />
            {LESION_MORPHOLOGY_LABEL[m]}
          </span>
        ))}
      </div>
    </div>
  );
}
