import { useState } from "react";
import {
  getDefaultDentalToothRecord,
  SURFACE_STATUS_OPTIONS,
  TOOTH_FACES,
  type DentalPayload,
  type ToothFace
} from "./clinicalProfiles.ts";
import {
  archRowsForDentition,
  cycleSurfaceStatus,
  DENTITION_OPTIONS,
  describeTooth,
  hasFindings,
  inferDentition,
  surfaceSlots,
  surfaceStatusClass,
  toothMarker,
  toothStatusClass,
  type Dentition,
  type SurfaceSlot
} from "./odontogramModel.ts";

const SLOT_POINTS: Record<SurfaceSlot, string> = {
  top: "1,1 39,1 29,11 11,11",
  right: "39,1 39,39 29,29 29,11",
  bottom: "1,39 11,29 29,29 39,39",
  left: "1,1 11,11 11,29 1,39",
  center: "11,11 29,11 29,29 11,29"
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
  onSelect,
  onChange
}: {
  toothId: string;
  payload: DentalPayload;
  disabled: boolean;
  selected: boolean;
  onSelect: (toothId: string) => void;
  onChange: (next: DentalPayload) => void;
}) {
  const tooth = payload.odontogram[toothId] ?? getDefaultDentalToothRecord();
  const slots = surfaceSlots(toothId);
  const marker = toothMarker(tooth.status);

  function cycleSurface(face: ToothFace) {
    if (disabled) {
      onSelect(toothId);
      return;
    }
    onSelect(toothId);
    onChange({
      ...payload,
      odontogram: {
        ...payload.odontogram,
        [toothId]: {
          ...tooth,
          surfaces: {
            ...tooth.surfaces,
            [face]: cycleSurfaceStatus(tooth.surfaces[face])
          }
        }
      }
    });
  }

  const classes = ["odontogram-tooth"];
  if (selected) {
    classes.push("selected");
  }
  if (hasFindings(payload.odontogram[toothId])) {
    classes.push("has-findings");
  }

  return (
    <button
      type="button"
      className={classes.join(" ")}
      title={describeTooth(toothId, payload.odontogram[toothId])}
      aria-label={describeTooth(toothId, payload.odontogram[toothId])}
      aria-pressed={selected}
      onClick={() => onSelect(toothId)}
    >
      <span className="tooth-number">{toothId}</span>
      <svg className={`tooth-glyph ${toothStatusClass(tooth.status)}`} viewBox="0 0 40 40">
        {TOOTH_FACES.map((face) => (
          <polygon
            key={face}
            points={SLOT_POINTS[slots[face]]}
            className={surfaceStatusClass(tooth.surfaces[face])}
            onClick={(event) => {
              event.stopPropagation();
              cycleSurface(face);
            }}
          >
            <title>{`${toothId} ${face}`}</title>
          </polygon>
        ))}
        <ToothMarkerOverlay marker={marker} />
      </svg>
    </button>
  );
}

export function OdontogramChart({
  payload,
  disabled,
  selectedTooth,
  onSelectTooth,
  onChange
}: {
  payload: DentalPayload;
  disabled: boolean;
  selectedTooth: string | null;
  onSelectTooth: (toothId: string) => void;
  onChange: (next: DentalPayload) => void;
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
          Clic en una superficie marca el hallazgo; clic en el numero abre el detalle.
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
                    <ToothGlyph
                      toothId={toothId}
                      payload={payload}
                      disabled={disabled}
                      selected={selectedTooth === toothId}
                      onSelect={onSelectTooth}
                      onChange={onChange}
                    />
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
