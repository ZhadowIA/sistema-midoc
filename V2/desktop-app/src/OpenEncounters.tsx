import { useCallback, useEffect, useState } from "react";

import { call } from "./ipc";
import { isStale, noteSummary, openedLabel, type OpenEncounterRow } from "./workQueues";

interface Props {
  onOpenEncounter: (encounterId: string) => void;
  onOpenPatient: (patientId: string) => void;
}

/**
 * Consultas iniciadas y aun sin firmar, para retomarlas. Una consulta abierta
 * de otro dia se resalta: probablemente quedo pendiente de cerrar.
 */
export function OpenEncounters({ onOpenEncounter, onOpenPatient }: Props) {
  const [rows, setRows] = useState<OpenEncounterRow[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    call<OpenEncounterRow[]>("list_open_encounters")
      .then((next) => {
        setRows(next);
        setError("");
      })
      .catch((e: unknown) => setError(String(e)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const now = new Date();

  return (
    <div className="directory">
      <div className="page-heading">
        <div>
          <h1>Consultas abiertas</h1>
          <p>Consultas que iniciaste y aun no firmas. Retomalas para terminar la nota y cerrarlas.</p>
        </div>
      </div>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {rows === null ? null : rows.length === 0 ? (
        <div className="empty-state">
          <strong>Sin consultas abiertas</strong>
          <p>Todas tus consultas estan firmadas.</p>
        </div>
      ) : (
        <div className="directory-list">
          {rows.map((row) => {
            const stale = isStale(row.opened_at, now);
            return (
              <div className="directory-item" key={row.encounter_id}>
                <button
                  type="button"
                  className="directory-item-main"
                  onClick={() => onOpenEncounter(row.encounter_id)}
                >
                  <span className="directory-info">
                    <strong>{row.patient_name || "Paciente sin nombre"}</strong>
                    <span className="meta">
                      {openedLabel(row.opened_at, now)} · {noteSummary(row)}
                    </span>
                  </span>
                  {stale ? <span className="lab-overdue-chip">Sin firmar</span> : null}
                </button>
                <div className="row-actions">
                  <button className="ghost-button" type="button" onClick={() => onOpenPatient(row.patient_id)}>
                    Expediente
                  </button>
                  <button className="action-button" type="button" onClick={() => onOpenEncounter(row.encounter_id)}>
                    Retomar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
