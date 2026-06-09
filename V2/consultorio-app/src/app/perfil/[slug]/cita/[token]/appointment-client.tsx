"use client";

import { useState } from "react";

type AppointmentDetails = {
  appointment: {
    status: string;
    scheduledStart: string | Date;
    scheduledEnd: string | Date;
    reason: string | null;
  };
  patient: {
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
  };
  service: {
    name: string;
  } | null;
  precheckin: {
    status: string;
    responses: unknown;
  } | null;
};

type AppointmentClientProps = {
  token: string;
  details: AppointmentDetails;
};

export function AppointmentClient({ token, details }: AppointmentClientProps) {
  const precheckinResponses =
    details.precheckin?.responses && typeof details.precheckin.responses === "object"
      ? (details.precheckin.responses as Record<string, unknown>)
      : {};
  const [status, setStatus] = useState(details.appointment.status);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [responses, setResponses] = useState({
    motivo: String(precheckinResponses.motivo ?? ""),
    antecedentes: String(precheckinResponses.antecedentes ?? ""),
    sintomas: String(precheckinResponses.sintomas ?? "")
  });

  async function confirmAppointment() {
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(`/api/public/appointments/${token}/confirm`, {
        method: "POST"
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No fue posible confirmar la cita.");
      }

      setStatus(data.appointment.status);
      setMessage("Cita confirmada.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible confirmar la cita.");
    } finally {
      setBusy(false);
    }
  }

  async function submitPrecheckin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(`/api/public/appointments/${token}/precheckin`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          responses
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No fue posible guardar la preconsulta.");
      }

      setMessage(`Preconsulta guardada con estado ${data.precheckin.status}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible guardar la preconsulta.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="booking-shell">
      <article className="panel">
        <div className="panel-header">
          <span className="section-kicker">Detalle de cita</span>
          <h2>
            {details.patient.firstName} {details.patient.lastName}
          </h2>
        </div>

        <div className="appointment-summary">
          <p><strong>Estado:</strong> {status}</p>
          <p><strong>Servicio:</strong> {details.service?.name ?? "Consulta"}</p>
          <p>
            <strong>Horario:</strong>{" "}
            {new Intl.DateTimeFormat("es-MX", {
              dateStyle: "medium",
              timeStyle: "short"
            }).format(new Date(details.appointment.scheduledStart))}
          </p>
          <p><strong>Motivo:</strong> {details.appointment.reason || "Sin motivo capturado."}</p>
        </div>

        <button className="action-button" disabled={busy || status === "CONFIRMED"} onClick={confirmAppointment}>
          {status === "CONFIRMED" ? "Cita confirmada" : busy ? "Confirmando..." : "Confirmar cita"}
        </button>
      </article>

      <article className="panel">
        <div className="panel-header">
          <span className="section-kicker">Preconsulta</span>
          <h2>Comparte contexto clinico basico</h2>
        </div>

        <form className="booking-form" onSubmit={submitPrecheckin}>
          <label className="field field-full">
            <span>Motivo principal</span>
            <textarea
              rows={3}
              value={responses.motivo}
              onChange={(event) => setResponses((current) => ({ ...current, motivo: event.target.value }))}
            />
          </label>
          <label className="field field-full">
            <span>Antecedentes relevantes</span>
            <textarea
              rows={3}
              value={responses.antecedentes}
              onChange={(event) => setResponses((current) => ({ ...current, antecedentes: event.target.value }))}
            />
          </label>
          <label className="field field-full">
            <span>Sintomas actuales</span>
            <textarea
              rows={3}
              value={responses.sintomas}
              onChange={(event) => setResponses((current) => ({ ...current, sintomas: event.target.value }))}
            />
          </label>

          <button className="action-button" disabled={busy} type="submit">
            {busy ? "Guardando..." : "Guardar preconsulta"}
          </button>
        </form>

        {message ? <p className="status-copy">{message}</p> : null}
      </article>
    </section>
  );
}
