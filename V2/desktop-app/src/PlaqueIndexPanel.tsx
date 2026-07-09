import { useEffect, useState } from "react";
import { call } from "./ipc";
import {
  coerceDentalPayload,
  type DentalPayload,
  type ToothFace
} from "./clinicalProfiles.ts";
import {
  archRowsForDentition,
  DENTITION_OPTIONS,
  inferDentition,
  type Dentition
} from "./odontogramModel.ts";
import {
  computePlaqueIndex,
  hasPlaque,
  isToothPresent,
  plaqueClassification,
  togglePlaqueSurface
} from "./plaqueIndex.ts";

// Indice de placa de O'Leary (paso 26 rebanada 2): se marcan caras con placa
// y el porcentaje sale solo; las piezas ausentes no cuentan. La evolucion
// compara contra las notas previas del paciente (misma funcion pura).

interface SpecialtyHistoryEntry {
  encounter_id: string;
  opened_at: string;
  signed_at: string | null;
  status: string;
  specialty_json: string;
}

interface EvolutionPoint {
  encounterId: string;
  date: string;
  percent: number;
}

// Celdas del cuadrante en orden visual: vestibular arriba, mesial/distal a
// los lados, lingual abajo (M y D no se espejan aqui: es una tabla de
// captura rapida, no un dibujo anatomico).
const QUAD_CELLS: Array<{ face: ToothFace; label: string }> = [
  { face: "V", label: "V" },
  { face: "M", label: "M" },
  { face: "D", label: "D" },
  { face: "L", label: "L" }
];

function percentOfEntry(entry: SpecialtyHistoryEntry): number | null {
  try {
    const payload = coerceDentalPayload(JSON.parse(entry.specialty_json));
    if (Object.keys(payload.plaque).length === 0) {
      return null;
    }
    const teeth = archRowsForDentition(inferDentition(payload.odontogram)).flatMap((row) => [
      ...row.teeth
    ]);
    return computePlaqueIndex(payload, teeth).percent;
  } catch {
    return null;
  }
}

export function PlaqueIndexPanel({
  patientId,
  encounterId,
  payload,
  disabled,
  onChange
}: {
  patientId: string;
  encounterId: string;
  payload: DentalPayload;
  disabled: boolean;
  onChange: (next: DentalPayload) => void;
}) {
  const [dentition, setDentition] = useState<Dentition>(() =>
    inferDentition(payload.odontogram)
  );
  const [evolution, setEvolution] = useState<EvolutionPoint[]>([]);

  useEffect(() => {
    call<SpecialtyHistoryEntry[]>("dental_specialty_history", { patientId })
      .then((entries) => {
        setEvolution(
          entries
            .filter((entry) => entry.encounter_id !== encounterId)
            .flatMap((entry) => {
              const percent = percentOfEntry(entry);
              return percent === null
                ? []
                : [{
                    encounterId: entry.encounter_id,
                    date: entry.opened_at.slice(0, 10),
                    percent
                  }];
            })
        );
      })
      .catch(() => setEvolution([]));
  }, [patientId, encounterId]);

  const rows = archRowsForDentition(dentition);
  const allTeeth = rows.flatMap((row) => [...row.teeth]);
  const index = computePlaqueIndex(payload, allTeeth);
  const classification = index.percent === null ? null : plaqueClassification(index.percent);

  return (
    <div className="plaque-panel">
      <div className="panel-header">
        <h4>Indice de placa (O'Leary)</h4>
        <p>
          Marca las caras con placa (V, M, D, L); el porcentaje se calcula solo y las piezas
          ausentes no cuentan.
        </p>
      </div>
      <div className="odontogram-toolbar">
        <div className="dentition-toggle" role="group" aria-label="Denticion del indice de placa">
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
        <div className="plaque-score">
          {index.percent === null ? (
            <span className="plaque-score-empty">Sin piezas presentes</span>
          ) : (
            <>
              <strong>{index.percent}%</strong>
              <span className={`plaque-chip plaque-${classification!.tone}`}>
                {classification!.label}
              </span>
              <span className="plaque-detail">
                {index.markedSurfaces} de {index.presentSurfaces} caras
              </span>
            </>
          )}
        </div>
      </div>
      <div className="plaque-rows">
        {rows.map((row) => (
          <div className="plaque-row" key={row.id}>
            <span className="odontogram-row-label">{row.label}</span>
            <div className="plaque-row-teeth">
              {row.teeth.map((toothId) => {
                const present = isToothPresent(payload, toothId);
                return (
                  <div
                    className={`plaque-tooth${present ? "" : " plaque-tooth-missing"}`}
                    key={toothId}
                    title={present ? `Pieza ${toothId}` : `Pieza ${toothId} ausente`}
                  >
                    <span className="tooth-number">{toothId}</span>
                    <div className="plaque-quad">
                      {QUAD_CELLS.map(({ face, label }) => (
                        <button
                          key={face}
                          type="button"
                          className={`plaque-cell${
                            hasPlaque(payload, toothId, face) ? " marked" : ""
                          }`}
                          disabled={disabled || !present}
                          aria-label={`Pieza ${toothId} cara ${label}`}
                          onClick={() => onChange(togglePlaqueSurface(payload, toothId, face))}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {evolution.length > 0 ? (
        <div className="plaque-evolution">
          <span className="plaque-evolution-title">Evolucion de higiene:</span>
          {evolution.map((point) => (
            <span className="plaque-evolution-point" key={point.encounterId}>
              {point.date}: <strong>{point.percent}%</strong>
            </span>
          ))}
          {index.percent !== null ? (
            <span className="plaque-evolution-point plaque-evolution-current">
              hoy: <strong>{index.percent}%</strong>
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
