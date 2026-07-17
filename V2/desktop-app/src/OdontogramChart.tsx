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
import {
  CROWN_PATHS,
  crownRegionPaths,
  FACIAL_CANAL_PATH,
  FACIAL_CROWN_PATHS,
  FACIAL_IMPLANT_BODY,
  FACIAL_IMPLANT_THREADS,
  GROOVE_PATHS,
  ROOT_PATHS
} from "./toothGeometry.ts";

// Doble vista por diente, como en el odontograma en papel (idea 3):
// - Vista FACIAL (corona desde vestibular + raiz, hacia afuera de la boca):
//   ahi viven los estados de pieza completa — corona, implante (tornillo),
//   endodoncia (conducto relleno), tintes por estado, X de ausente.
// - Disco OCLUSAL (hacia la linea media entre arcadas): las 5 regiones
//   anatomicas clicables por superficie de las ideas 1+2.
// La interaccion y el payload no cambian: clic en superficie = cara, clic en
// la vista facial o el numero = pieza completa.

// Tamano base del glifo en px; cada pieza lo escala con sus proporciones.
// viewBox 40x78: facial (raiz 16 + corona 22) + separacion + oclusal 40.
const GLYPH_BASE_WIDTH = 32;
const GLYPH_BASE_HEIGHT = 62;
const OCCLUSAL_OFFSET = 38;
const GLYPH_TOTAL = 78;

function ToothMarkerOverlay({ marker }: { marker: ReturnType<typeof toothMarker> }) {
  // Solo ausente y extraccion cruzan el glifo completo (ambas vistas); los
  // demas estados ya se representan en la vista facial.
  switch (marker) {
    case "cross":
      return (
        <g className="tooth-marker">
          <line x1={6} y1={6} x2={34} y2={GLYPH_TOTAL - 6} />
          <line x1={34} y1={6} x2={6} y2={GLYPH_TOTAL - 6} />
        </g>
      );
    case "slash":
      return (
        <g className="tooth-marker">
          <line x1={6} y1={GLYPH_TOTAL - 6} x2={34} y2={6} />
        </g>
      );
    default:
      return null;
  }
}

/** Vista facial: raiz + corona vestibular con los adornos del estado. */
function FacialView({
  type,
  status
}: {
  type: ReturnType<typeof toothType>;
  status: string;
}) {
  const implant = status === "IMPLANT";
  return (
    <>
      {implant ? (
        <g className="facial-implant">
          <path d={FACIAL_IMPLANT_BODY} />
          <path className="facial-implant-threads" d={FACIAL_IMPLANT_THREADS} />
        </g>
      ) : (
        <path className="tooth-root" d={ROOT_PATHS[type === "MOLAR" ? "DOUBLE" : "SINGLE"]} />
      )}
      {status === "ROOT_CANAL" ? <path className="facial-canal" d={FACIAL_CANAL_PATH} /> : null}
      <path className="facial-crown" d={FACIAL_CROWN_PATHS[type]} />
    </>
  );
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
        viewBox={`0 0 40 ${GLYPH_TOTAL}`}
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
        {/* Vista facial hacia afuera de la boca: arriba en superiores,
            espejada abajo en inferiores. Clic aqui = pieza completa (el
            evento burbujea al boton del glifo). */}
        <g
          className="facial-view"
          transform={upper ? undefined : `translate(0,${GLYPH_TOTAL}) scale(1,-1)`}
        >
          <title>{`${toothId} pieza completa`}</title>
          <FacialView type={type} status={tooth.status} />
        </g>
        {/* Disco oclusal hacia la linea media, con las regiones por cara. */}
        <g transform={upper ? `translate(0,${OCCLUSAL_OFFSET})` : undefined}>
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
        </g>
        <ToothMarkerOverlay marker={marker} />
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
          <svg viewBox="8 12 24 24" className="legend-swatch">
            <path className="facial-crown legend-crown-status" d={FACIAL_CROWN_PATHS.PREMOLAR} />
          </svg>
          Corona
        </span>
        <span className="legend-item">
          <svg viewBox="10 0 20 20" className="legend-swatch">
            <path className="tooth-root" d={ROOT_PATHS.SINGLE} />
            <path className="facial-canal" d={FACIAL_CANAL_PATH} />
          </svg>
          Endodoncia
        </span>
        <span className="legend-item">
          <svg viewBox="10 0 20 16" className="legend-swatch">
            <g className="facial-implant">
              <path d={FACIAL_IMPLANT_BODY} />
              <path className="facial-implant-threads" d={FACIAL_IMPLANT_THREADS} />
            </g>
          </svg>
          Implante
        </span>
      </div>
    </div>
  );
}
