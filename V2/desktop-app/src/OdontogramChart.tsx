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
  toothProportions,
  toothStatusClass,
  toothType,
  type Dentition
} from "./odontogramModel.ts";
import { CROWN_PATHS, crownRegionPaths, GROOVE_PATHS, ROOT_PATHS } from "./toothGeometry.ts";

// Las 5 zonas clicables son regiones anatomicas por tipo de pieza (la zona
// central es la tabla oclusal/borde incisal real de cada tipo, generada en
// toothGeometry.ts con teselado garantizado); la silueta de la corona sigue
// recortando con clipPath. La interaccion y el payload no cambian.

// Tamano base del glifo en px; cada pieza lo escala con sus proporciones.
const GLYPH_BASE_WIDTH = 32;
const GLYPH_BASE_HEIGHT = 43;

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
  const regions = crownRegionPaths(type);
  const proportions = toothProportions(toothId);
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
      <svg
        className={`tooth-glyph ${toothStatusClass(tooth.status)}`}
        viewBox="0 0 40 54"
        style={{
          width: Math.round(GLYPH_BASE_WIDTH * proportions.width),
          height: Math.round(GLYPH_BASE_HEIGHT * proportions.height)
        }}
      >
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
              <path
                key={face}
                d={regions[slots[face]]}
                className={`tooth-surface ${surfaceStatusClass(tooth.surfaces[face])}${
                  difference?.changedFaces.includes(face) ? " surface-changed" : ""
                }`}
                onClick={(event) => {
                  event.stopPropagation();
                  handleSurface(face);
                }}
              >
                <title>{`${toothId} ${face}`}</title>
              </path>
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
