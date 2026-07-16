import { useState } from "react";
import {
  getDefaultDentalToothRecord,
  SURFACE_STATUS_OPTIONS,
  TOOTH_FACES,
  type DentalPayload,
  type ToothFace
} from "./clinicalProfiles.ts";
import type { OdontogramTool, ToothDifference } from "./odontogramWorkspaceModel.ts";
import {
  archCurveOffset,
  archRowsForDentition,
  DENTITION_OPTIONS,
  describeTooth,
  hasFindings,
  inferDentition,
  isUpperTooth,
  surfaceSlots,
  surfaceStatusClass,
  toothMarker,
  toothStatusClass,
  toothType,
  type Dentition,
  type SurfaceSlot,
  type ToothType
} from "./odontogramModel.ts";

// Las 5 zonas clicables viven en el espacio 40x40 de la corona (igual que la
// rebanada 1); la silueta anatomica solo las recorta. La interaccion y el
// payload no cambian.
const SLOT_POINTS: Record<SurfaceSlot, string> = {
  top: "1,1 39,1 29,11 11,11",
  right: "39,1 39,39 29,29 29,11",
  bottom: "1,39 11,29 29,29 39,39",
  left: "1,1 11,11 11,29 1,39",
  center: "11,11 29,11 29,29 11,29"
};

// Corona vista desde oclusal/incisal, por tipo de pieza (rebanada 6):
// molar cuadrado lobulado, premolar ovalo vestibulo-lingual, canino punta
// redondeada, incisivo banda mesio-distal delgada.
const CROWN_PATHS: Record<ToothType, string> = {
  MOLAR:
    "M20 3 C30 3 36 7 37 15 C37.7 18.3 37.7 21.7 37 25 C36 33 30 37 20 37 C10 37 4 33 3 25 C2.3 21.7 2.3 18.3 3 15 C4 7 10 3 20 3 Z",
  PREMOLAR:
    "M20 4 C28 4 32.5 10 32.5 20 C32.5 30 28 36 20 36 C12 36 7.5 30 7.5 20 C7.5 10 12 4 20 4 Z",
  CANINE:
    "M20 3 C28 7 33.5 13 33.5 20 C33.5 27 28 33 20 37 C12 33 6.5 27 6.5 20 C6.5 13 12 7 20 3 Z",
  INCISOR:
    "M20 10 C29 10 35 14 35 20 C35 26 29 30 20 30 C11 30 5 26 5 20 C5 14 11 10 20 10 Z"
};

// Fisuras/cresta de la cara oclusal, decorativas (sin eventos).
const GROOVE_PATHS: Record<ToothType, string> = {
  MOLAR: "M13.5 13.5 C17 17 17 23 13.5 26.5 M26.5 13.5 C23 17 23 23 26.5 26.5 M15.5 20 H24.5",
  PREMOLAR: "M14 20 H26",
  CANINE: "M20 15.5 V24.5",
  INCISOR: "M10 20 H30"
};

// Raices sugeridas (zona de 40x16, apice arriba; se espeja en inferiores).
const ROOT_PATHS: Record<"SINGLE" | "DOUBLE", string> = {
  SINGLE: "M13.5 16 C13.5 6 16.5 1.5 20 1.5 C23.5 1.5 26.5 6 26.5 16 Z",
  DOUBLE:
    "M8 16 C8 7 10 2 13 2 C16 2 17.5 8 17.5 16 Z M22.5 16 C22.5 8 24 2 27 2 C30 2 32 7 32 16 Z"
};

function ToothMarkerOverlay({ marker }: { marker: ReturnType<typeof toothMarker> }) {
  switch (marker) {
    case "cross":
      return (
        <g className="tooth-marker">
          <line x1={5} y1={5} x2={35} y2={35} />
          <line x1={35} y1={5} x2={5} y2={35} />
        </g>
      );
    case "slash":
      return (
        <g className="tooth-marker">
          <line x1={5} y1={35} x2={35} y2={5} />
        </g>
      );
    case "circle":
      return (
        <g className="tooth-marker">
          <circle cx={20} cy={20} r={16} />
        </g>
      );
    case "triangle":
      return (
        <g className="tooth-marker">
          <polygon points="20,6 33,32 7,32" />
        </g>
      );
    case "post":
      return (
        <g className="tooth-marker">
          <line x1={20} y1={6} x2={20} y2={34} />
          <line x1={12} y1={12} x2={28} y2={12} />
          <line x1={14} y1={20} x2={26} y2={20} />
        </g>
      );
    default:
      return null;
  }
}

function ToothGlyph({
  toothId,
  payload,
  disabled,
  selected,
  activeTool,
  difference,
  onSelect,
  onApplyTool
}: {
  toothId: string;
  payload: DentalPayload;
  disabled: boolean;
  selected: boolean;
  activeTool: OdontogramTool | null;
  difference?: ToothDifference;
  onSelect: (toothId: string) => void;
  onApplyTool: (toothId: string, face: ToothFace | null) => void;
}) {
  const tooth = payload.odontogram[toothId] ?? getDefaultDentalToothRecord();
  const slots = surfaceSlots(toothId);
  const marker = toothMarker(tooth.status);

  function handleSurface(face: ToothFace) {
    if (disabled || !activeTool) {
      onSelect(toothId);
      return;
    }
    onApplyTool(toothId, activeTool.scope === "SURFACE" ? face : null);
  }

  const classes = ["odontogram-tooth"];
  if (selected) {
    classes.push("selected");
  }
  if (hasFindings(payload.odontogram[toothId])) {
    classes.push("has-findings");
  }
  if (difference?.changed) {
    classes.push("has-change");
  }

  const upper = isUpperTooth(toothId);
  const type = toothType(toothId);
  const clipId = `crown-clip-${toothId}`;
  const description = `${describeTooth(toothId, payload.odontogram[toothId])}${
    difference?.changed
      ? `; diferente al estado de llegada en ${difference.changedFaces.length > 0
        ? `caras ${difference.changedFaces.join(", ")}`
        : "la pieza"}`
      : ""
  }`;

  return (
    <button
      type="button"
      className={classes.join(" ")}
      title={description}
      aria-label={description}
      aria-pressed={selected}
      onClick={() => {
        if (!disabled && activeTool?.scope === "TOOTH") {
          onApplyTool(toothId, null);
        } else {
          onSelect(toothId);
        }
      }}
    >
      <span className="tooth-number">{toothId}</span>
      <svg className={`tooth-glyph ${toothStatusClass(tooth.status)}`} viewBox="0 0 40 54">
        <defs>
          <clipPath id={clipId}>
            <path d={CROWN_PATHS[type]} />
          </clipPath>
        </defs>
        {/* Raiz hacia afuera de la boca: arriba en superiores, abajo en
            inferiores (espejada). */}
        <g
          className="tooth-root"
          transform={upper ? undefined : "translate(0,54) scale(1,-1)"}
        >
          <path d={ROOT_PATHS[type === "MOLAR" ? "DOUBLE" : "SINGLE"]} />
        </g>
        <g transform={upper ? "translate(0,14)" : undefined}>
          <g clipPath={`url(#${clipId})`}>
            {TOOTH_FACES.map((face) => (
              <polygon
                key={face}
                points={SLOT_POINTS[slots[face]]}
                className={`${surfaceStatusClass(tooth.surfaces[face])}${
                  difference?.changedFaces.includes(face) ? " surface-changed" : ""
                }`}
                onClick={(event) => {
                  event.stopPropagation();
                  handleSurface(face);
                }}
              >
                <title>{`${toothId} ${face}`}</title>
              </polygon>
            ))}
          </g>
          <path className="tooth-crown-outline" d={CROWN_PATHS[type]} />
          <path className="tooth-groove" d={GROOVE_PATHS[type]} />
          <ToothMarkerOverlay marker={marker} />
        </g>
      </svg>
    </button>
  );
}

export function OdontogramChart({
  payload,
  disabled,
  selectedTooth,
  activeTool,
  differences,
  onSelectTooth,
  onApplyTool
}: {
  payload: DentalPayload;
  disabled: boolean;
  selectedTooth: string | null;
  activeTool: OdontogramTool | null;
  differences?: Map<string, ToothDifference>;
  onSelectTooth: (toothId: string) => void;
  onApplyTool: (toothId: string, face: ToothFace | null) => void;
}) {
  const [dentition, setDentition] = useState<Dentition>(() =>
    inferDentition(payload.odontogram)
  );
  const rows = archRowsForDentition(dentition);

  return (
    <div className="odontogram-chart">
      <div className="odontogram-toolbar">
        <div className="dentition-toggle" role="group" aria-label="Denticion">
          {DENTITION_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={dentition === option.value ? "active" : ""}
              onClick={() => setDentition(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="odontogram-hint">
          {activeTool
            ? "Aplica la herramienta sobre una superficie o pieza. Escape cancela."
            : "Selecciona una pieza para abrir su detalle."}
        </p>
      </div>
      <div className="odontogram-rows">
        {rows.map((row) => {
          const midline = row.teeth.length / 2;
          return (
            <div className="odontogram-row" key={row.id}>
              <span className="odontogram-row-label">{row.label}</span>
              <div className="odontogram-row-teeth">
                {row.teeth.map((toothId, index) => (
                  <span className="odontogram-slot" key={toothId}>
                    {index === midline ? <span className="odontogram-midline" aria-hidden /> : null}
                    <span
                      className="odontogram-curve"
                      style={{
                        transform: `translateY(${archCurveOffset(index, row.teeth.length, row.arch)}px)`
                      }}
                    >
                      <ToothGlyph
                        toothId={toothId}
                        payload={payload}
                        disabled={disabled}
                        selected={selectedTooth === toothId}
                        activeTool={activeTool}
                        difference={differences?.get(toothId)}
                        onSelect={onSelectTooth}
                        onApplyTool={onApplyTool}
                      />
                    </span>
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="odontogram-legend">
        {SURFACE_STATUS_OPTIONS.map((option) => (
          <span className="legend-item" key={option.value}>
            <svg viewBox="0 0 40 40" className="legend-swatch">
              <rect x={2} y={2} width={36} height={36} className={surfaceStatusClass(option.value)} />
            </svg>
            {option.label}
          </span>
        ))}
        <span className="legend-item">
          <svg viewBox="0 0 40 40" className="legend-swatch">
            <g className="tooth-marker">
              <line x1={5} y1={5} x2={35} y2={35} />
              <line x1={35} y1={5} x2={5} y2={35} />
            </g>
          </svg>
          Ausente
        </span>
        <span className="legend-item">
          <svg viewBox="0 0 40 40" className="legend-swatch">
            <g className="tooth-marker">
              <line x1={5} y1={35} x2={35} y2={5} />
            </g>
          </svg>
          Extraccion indicada
        </span>
        <span className="legend-item">
          <svg viewBox="0 0 40 40" className="legend-swatch">
            <g className="tooth-marker">
              <circle cx={20} cy={20} r={15} />
            </g>
          </svg>
          Corona
        </span>
        <span className="legend-item">
          <svg viewBox="0 0 40 40" className="legend-swatch">
            <g className="tooth-marker">
              <polygon points="20,6 33,32 7,32" />
            </g>
          </svg>
          Endodoncia
        </span>
        <span className="legend-item">
          <svg viewBox="0 0 40 40" className="legend-swatch">
            <g className="tooth-marker">
              <line x1={20} y1={6} x2={20} y2={34} />
              <line x1={12} y1={12} x2={28} y2={12} />
              <line x1={14} y1={20} x2={26} y2={20} />
            </g>
          </svg>
          Implante
        </span>
      </div>
    </div>
  );
}
