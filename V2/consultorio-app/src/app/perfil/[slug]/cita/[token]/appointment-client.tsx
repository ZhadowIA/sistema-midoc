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
  slug: string;
  serviceId: string | null;
  details: AppointmentDetails;
};

type SlotOption = {
  slotStart: string;
  slotEnd: string;
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente de confirmar",
  CONFIRMED: "Confirmada",
  CANCELLED: "Cancelada",
  COMPLETED: "Atendida"
};

const dateTimeFormatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short"
});

const timeFormatter = new Intl.DateTimeFormat("es-MX", {
  timeStyle: "short"
});

export function AppointmentClient({ token, slug, serviceId, details }: AppointmentClientProps) {
  const precheckinResponses =
    details.precheckin?.responses && typeof details.precheckin.responses === "object"
      ? (details.precheckin.responses as Record<string, unknown>)
      : {};
  const [status, setStatus] = useState(details.appointment.status);
  const [scheduledStart, setScheduledStart] = useState(
    new Date(details.appointment.scheduledStart)
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [responses, setResponses] = useState({
    motivo: String(precheckinResponses.motivo ?? ""),
    antecedentes: String(precheckinResponses.antecedentes ?? ""),
    sintomas: String(precheckinResponses.sintomas ?? "")
  });

  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [slots, setSlots] = useState<SlotOption[]>([]);
  const [slotsLoaded, setSlotsLoaded] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState("");

  const isFinal = status === "CANCELLED" || status === "COMPLETED";

  async function callAction(path: string, init?: RequestInit) {
    const response = await fetch(path, init);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "La operacion no se pudo completar.");
    }

    return data;
  }

  async function confirmAppointment() {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const data = await callAction(`/api/public/appointments/${token}/confirm`, {
        method: "POST"
      });
      setStatus(data.appointment.status);
      setMessage("Cita confirmada. Te esperamos.");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "No fue posible confirmar la cita.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelAppointment() {
    const confirmed = window.confirm("¿Seguro que quieres cancelar esta cita?");
    if (!confirmed) {
      return;
    }

    setBusy(true);
    setMessage("");
    setError("");
    try {
      const data = await callAction(`/api/public/appointments/${token}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      setStatus(data.appointment.status);
      setMessage("Tu cita fue cancelada.");
      setRescheduleOpen(false);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "No fue posible cancelar la cita.");
    } finally {
      setBusy(false);
    }
  }

  async function loadSlots(date: string) {
    setRescheduleDate(date);
    setSelectedSlot("");
    setSlots([]);
    setSlotsLoaded(false);

    if (!date || !serviceId) {
      return;
    }

    setBusy(true);
    setError("");
    try {
      const data = await callAction(
        `/api/public/doctors/${slug}/availability?serviceId=${serviceId}&dateFrom=${date}&days=1`
      );
      setSlots(data.slots);
      setSlotsLoaded(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "No fue posible cargar horarios.");
    } finally {
      setBusy(false);
    }
  }

  async function reschedule() {
    if (!selectedSlot) {
      return;
    }

    setBusy(true);
    setMessage("");
    setError("");
    try {
      const data = await callAction(`/api/public/appointments/${token}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newSlotStart: selectedSlot })
      });
      setStatus(data.appointment.status);
      setScheduledStart(new Date(data.appointment.scheduledStart));
      setRescheduleOpen(false);
      setSlots([]);
      setSlotsLoaded(false);
      setRescheduleDate("");
      setMessage("Tu cita cambio de horario. Confirma tu asistencia en el nuevo horario.");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "No fue posible reagendar la cita.");
    } finally {
      setBusy(false);
    }
  }

  async function submitPrecheckin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");

    try {
      await callAction(`/api/public/appointments/${token}/precheckin`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responses })
      });
      setMessage("Preconsulta guardada. Tu medico la vera antes de la cita.");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "No fue posible guardar la preconsulta.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="booking-shell">
      <article className="panel">
        <div className="panel-header">
          <span className="section-kicker">Tu cita</span>
          <h2>
            {details.patient.firstName} {details.patient.lastName}
          </h2>
        </div>

        <div className="appointment-summary">
          <p>
            <strong>Estado:</strong> {STATUS_LABELS[status] ?? status}
          </p>
          <p>
            <strong>Servicio:</strong> {details.service?.name ?? "Consulta"}
          </p>
          <p>
            <strong>Horario:</strong> {dateTimeFormatter.format(scheduledStart)}
          </p>
          <p>
            <strong>Motivo:</strong> {details.appointment.reason || "Sin motivo capturado."}
          </p>
        </div>

        {message ? (
          <p className="form-success" role="status">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        {!isFinal ? (
          <div className="button-row" style={{ marginTop: 14 }}>
            <button
              className="action-button"
              disabled={busy || status === "CONFIRMED"}
              onClick={() => void confirmAppointment()}
            >
              {status === "CONFIRMED" ? "Cita confirmada" : busy ? "Confirmando…" : "Confirmar cita"}
            </button>
            <button
              className="ghost-button"
              disabled={busy || !serviceId}
              onClick={() => setRescheduleOpen((open) => !open)}
            >
              {rescheduleOpen ? "Cerrar cambio de horario" : "Cambiar horario"}
            </button>
            <button className="danger-button" disabled={busy} onClick={() => void cancelAppointment()}>
              Cancelar cita
            </button>
          </div>
        ) : null}

        {rescheduleOpen && !isFinal ? (
          <div className="inline-form">
            <div className="field">
              <label htmlFor="reschedule-date">Elige una fecha nueva</label>
              <input
                id="reschedule-date"
                type="date"
                min={new Date().toISOString().slice(0, 10)}
                value={rescheduleDate}
                onChange={(event) => void loadSlots(event.currentTarget.value)}
              />
            </div>

            {slotsLoaded && slots.length === 0 ? (
              <p className="field-hint">No hay horarios disponibles ese dia. Prueba otra fecha.</p>
            ) : null}

            {slots.length > 0 ? (
              <div className="slot-grid" role="listbox" aria-label="Horarios disponibles">
                {slots.map((slot) => (
                  <button
                    key={slot.slotStart}
                    type="button"
                    role="option"
                    aria-selected={selectedSlot === slot.slotStart}
                    className={selectedSlot === slot.slotStart ? "slot-button active" : "slot-button"}
                    onClick={() => setSelectedSlot(slot.slotStart)}
                  >
                    {timeFormatter.format(new Date(slot.slotStart))}
                  </button>
                ))}
              </div>
            ) : null}

            {selectedSlot ? (
              <div className="button-row">
                <button className="action-button" disabled={busy} onClick={() => void reschedule()}>
                  {busy ? "Reagendando…" : "Confirmar nuevo horario"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </article>

      {!isFinal ? (
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
                onChange={(event) =>
                  setResponses((current) => ({ ...current, antecedentes: event.target.value }))
                }
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
              {busy ? "Guardando…" : "Guardar preconsulta"}
            </button>
          </form>
        </article>
      ) : null}
    </section>
  );
}
