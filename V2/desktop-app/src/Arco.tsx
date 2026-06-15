import { useCallback, useEffect, useState } from "react";
import { call } from "./ipc";

/**
 * Derechos ARCO (paso 12): el medico atiende Acceso, Rectificacion, Cancelacion
 * y Oposicion desde su app local, porque el expediente clinico es suyo y reside
 * en este equipo cifrado. La cancelacion borra el expediente clinico del paciente
 * y seudonimiza su identidad, preservando los registros contables.
 */

interface ArcoRequest {
  id: string;
  patient_id: string;
  request_type: string;
  status: string;
  notes: string | null;
  requested_at: string;
  fulfilled_at: string | null;
  result_summary: string | null;
}

const REQUEST_TYPES = [
  { value: "ACCESS", label: "Acceso / portabilidad" },
  { value: "RECTIFICATION", label: "Rectificacion" },
  { value: "CANCELLATION", label: "Cancelacion (borrado)" },
  { value: "OPPOSITION", label: "Oposicion" }
];

const dateTimeFormatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short"
});

function typeLabel(value: string): string {
  return REQUEST_TYPES.find((t) => t.value === value)?.label ?? value;
}

export function Arco() {
  const [requests, setRequests] = useState<ArcoRequest[]>([]);
  const [patientId, setPatientId] = useState("");
  const [requestType, setRequestType] = useState("ACCESS");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    call<ArcoRequest[]>("arco_list_requests")
      .then(setRequests)
      .catch((e: unknown) => setError(String(e)));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function record() {
    setBusy(true);
    setMessage("");
    setError("");
    call<ArcoRequest>("arco_record_request", {
      patientId: patientId.trim(),
      requestType,
      notes: notes.trim() || null
    })
      .then(() => {
        setMessage("Solicitud registrada.");
        setNotes("");
        refresh();
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setBusy(false));
  }

  function exportData(id: string) {
    setError("");
    setMessage("");
    call<unknown>("arco_export_patient_data", { patientId: id })
      .then((data) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `expediente-${id}.json`;
        a.click();
        URL.revokeObjectURL(url);
        setMessage("Expediente exportado.");
      })
      .catch((e: unknown) => setError(String(e)));
  }

  function fulfillCancellation(request: ArcoRequest) {
    if (
      !window.confirm(
        "Esto elimina el expediente clinico del paciente y seudonimiza su identidad. " +
          "Los registros contables se conservan. ¿Continuar?"
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    call<unknown>("arco_fulfill_cancellation", { requestId: request.id })
      .then(() => {
        setMessage("Cancelacion atendida: expediente eliminado y identidad seudonimizada.");
        refresh();
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setBusy(false));
  }

  function markFulfilled(request: ArcoRequest) {
    setBusy(true);
    setError("");
    setMessage("");
    call<ArcoRequest>("arco_mark_fulfilled", {
      requestId: request.id,
      resultSummary: "Atendida por el medico."
    })
      .then(() => {
        setMessage("Solicitud marcada como atendida.");
        refresh();
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setBusy(false));
  }

  return (
    <div className="content">
      <section className="panel">
        <div className="panel-header">
          <h2>Privacidad — Derechos ARCO</h2>
          <p>
            Atiende solicitudes de Acceso, Rectificacion, Cancelacion y Oposicion. El expediente
            clinico vive solo en este equipo; la cancelacion lo elimina y seudonimiza la identidad
            del paciente, conservando los registros contables.
          </p>
        </div>
        <div className="button-row">
          <label className="field">
            <span>ID del paciente</span>
            <input
              value={patientId}
              onChange={(e) => setPatientId(e.currentTarget.value)}
              disabled={busy}
              placeholder="pat-…"
            />
          </label>
          <label className="field">
            <span>Tipo</span>
            <select
              value={requestType}
              onChange={(e) => setRequestType(e.currentTarget.value)}
              disabled={busy}
            >
              {REQUEST_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field grow-field">
            <span>Notas</span>
            <input value={notes} onChange={(e) => setNotes(e.currentTarget.value)} disabled={busy} />
          </label>
          <button
            className="action-button"
            onClick={record}
            disabled={busy || !patientId.trim()}
          >
            Registrar solicitud
          </button>
        </div>
        {message && (
          <p className="form-success" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </section>

      {requests.length === 0 ? (
        <section className="panel">
          <div className="empty-state">
            <strong>Sin solicitudes</strong>
            <p>Registra una solicitud ARCO para empezar a darle seguimiento.</p>
          </div>
        </section>
      ) : (
        <section className="panel">
          <div className="panel-header">
            <h3>Solicitudes</h3>
          </div>
          <ul className="appointment-list">
            {requests.map((request) => (
              <li key={request.id} className="list-row">
                <div className="list-row-main">
                  <strong>
                    {typeLabel(request.request_type)} · paciente {request.patient_id}
                  </strong>
                  <span className="meta">
                    {dateTimeFormatter.format(new Date(request.requested_at))} ·{" "}
                    <span
                      className={request.status === "FULFILLED" ? "pill pill-success" : "pill"}
                    >
                      {request.status === "FULFILLED" ? "Atendida" : "Pendiente"}
                    </span>
                    {request.notes ? ` · ${request.notes}` : ""}
                  </span>
                </div>
                <div className="list-row-actions">
                  {request.request_type === "ACCESS" ? (
                    <button className="tab" onClick={() => exportData(request.patient_id)}>
                      Exportar expediente
                    </button>
                  ) : null}
                  {request.status !== "FULFILLED" &&
                  request.request_type === "CANCELLATION" ? (
                    <button
                      className="tab"
                      onClick={() => fulfillCancellation(request)}
                      disabled={busy}
                    >
                      Atender cancelacion
                    </button>
                  ) : null}
                  {request.status !== "FULFILLED" &&
                  request.request_type !== "CANCELLATION" ? (
                    <button className="tab" onClick={() => markFulfilled(request)} disabled={busy}>
                      Marcar atendida
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
