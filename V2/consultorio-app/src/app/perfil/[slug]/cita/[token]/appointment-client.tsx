"use client";

import { useEffect, useState } from "react";

import { Calendar } from "../../agenda/calendar";
import { addDaysLocalDateString } from "../../../../../lib/local-date";
import { MedicalHistoryForm } from "./medical-history-form";
import { AiPreconsultaChat } from "./ai-preconsulta-chat";

type AppointmentDetails = {
  appointment: {
    status: string;
    scheduledStart: string | Date;
    scheduledEnd: string | Date;
    reason: string | null;
    /** Zona horaria del consultorio: la cita se muestra en ella, no en la del paciente. */
    timeZone: string;
  };
  patient: {
    firstName: string;
    lastName: string;
    /** Apellidos por separado capturados al agendar (para prellenar antecedentes). */
    apellidoPaterno: string | null;
    apellidoMaterno: string | null;
    email: string | null;
    phone: string | null;
    birthDate: string | Date | null;
  };
  service: {
    name: string;
  } | null;
  precheckin: {
    status: string;
    responses: unknown;
  } | null;
  precheckinState?: {
    medicalHistorySubmitted: boolean;
    aiPreconsultaSubmitted: boolean;
  };
};

type AppointmentClientProps = {
  token: string;
  slug: string;
  serviceId: string | null;
  details: AppointmentDetails;
  /**
   * Llave publica del dispositivo del medico. Si es null, no hay dispositivo
   * vinculado: la preconsulta NO se muestra (no se puede entregar segura).
   */
  documentPublicKey: string | null;
  /** Llega desde el enlace de cancelacion del recordatorio (`?accion=cancelar`). */
  cancelIntent?: boolean;
};

type SlotOption = {
  slotStart: string;
  slotEnd: string;
};

// Las horas se formatean en la zona del consultorio: los instantes viajan en
// UTC pero representan la hora de pared del medico, no la del paciente.
function makeDateTimeFormatter(timeZone: string) {
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone
  });
}

function makeTimeFormatter(timeZone: string) {
  return new Intl.DateTimeFormat("es-MX", {
    timeStyle: "short",
    timeZone
  });
}

function tomorrowString() {
  return addDaysLocalDateString(1);
}

export function AppointmentClient({
  token,
  slug,
  serviceId,
  details,
  documentPublicKey,
  cancelIntent
}: AppointmentClientProps) {
  const precheckinResponses =
    details.precheckin?.responses && typeof details.precheckin.responses === "object"
      ? (details.precheckin.responses as Record<string, unknown>)
      : {};
  const timeZone = details.appointment.timeZone;
  const dateTimeFormatter = makeDateTimeFormatter(timeZone);
  const timeFormatter = makeTimeFormatter(timeZone);

  // Datos ya capturados al agendar que prellenan la ficha de identificacion de
  // los antecedentes (claves del grupo `identification`), para no pedirlos otra
  // vez. Solo se incluye lo que realmente exista.
  const birthDateValue = details.patient.birthDate
    ? new Date(details.patient.birthDate).toISOString().slice(0, 10)
    : "";
  const identificationPrefill: Record<string, string> = {};
  if (details.patient.firstName) identificationPrefill.nombre = details.patient.firstName;
  if (details.patient.apellidoPaterno) identificationPrefill.apellidoPaterno = details.patient.apellidoPaterno;
  if (details.patient.apellidoMaterno) identificationPrefill.apellidoMaterno = details.patient.apellidoMaterno;
  if (details.patient.phone) identificationPrefill.telefono = details.patient.phone;
  if (birthDateValue) identificationPrefill.fechaNacimiento = birthDateValue;
  const [status, setStatus] = useState(details.appointment.status);
  const [scheduledStart, setScheduledStart] = useState(
    new Date(details.appointment.scheduledStart)
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Preconsulta diferida: no se muestra el formulario de inicio. Primero un aviso
  // con "Contestar", luego la bifurcacion (primera visita -> antecedentes;
  // ya contesto -> preconsulta guiada). Si ya hay respuestas previas, se entra
  // directo al formulario.
  const hasPreviousResponses = Boolean(
    precheckinResponses.motivo ||
      precheckinResponses.antecedentes ||
      precheckinResponses.sintomas ||
      details.precheckinState?.medicalHistorySubmitted ||
      details.precheckinState?.aiPreconsultaSubmitted
  );
  const [precheckinStarted, setPrecheckinStarted] = useState(hasPreviousResponses);
  const [firstVisit, setFirstVisit] = useState<boolean | null>(
    details.precheckinState?.aiPreconsultaSubmitted ? false : null
  );
  const [medicalHistorySaved, setMedicalHistorySaved] = useState(
    Boolean(details.precheckinState?.medicalHistorySubmitted)
  );
  const [aiPreconsultaSaved, setAiPreconsultaSaved] = useState(
    Boolean(details.precheckinState?.aiPreconsultaSubmitted)
  );
  // El enlace de cancelacion del recordatorio abre la cita con este aviso al frente.
  const [showCancelPrompt, setShowCancelPrompt] = useState(Boolean(cancelIntent));

  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [slots, setSlots] = useState<SlotOption[]>([]);
  const [slotsLoaded, setSlotsLoaded] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState("");
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [loadingDays, setLoadingDays] = useState(false);

  const isFinal = status === "CANCELLED" || status === "COMPLETED";

  // Dias con cupo real del medico para el mes visible del calendario de
  // reagendado (mismo criterio que el agendado inicial).
  const visibleMonth = rescheduleDate.slice(0, 7);

  useEffect(() => {
    if (!rescheduleOpen || !serviceId || !visibleMonth) {
      return;
    }

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingDays(true);

    fetch(`/api/public/doctors/${slug}/available-days?serviceId=${serviceId}&dateFrom=${visibleMonth}-01&days=31`)
      .then(async (response) => ({ ok: response.ok, data: await response.json() }))
      .then(({ ok, data }) => {
        if (cancelled) {
          return;
        }
        setAvailableDays(ok && Array.isArray(data.days) ? data.days : []);
      })
      .catch(() => {
        if (!cancelled) {
          setAvailableDays([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingDays(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [rescheduleOpen, serviceId, visibleMonth, slug]);

  function toggleReschedule() {
    setRescheduleOpen((open) => {
      const next = !open;
      if (next && !rescheduleDate) {
        // Abrir con un dia por defecto carga el calendario y sus horarios, igual
        // que el agendado inicial.
        void loadSlots(tomorrowString());
      }
      return next;
    });
  }

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

  async function cancelAppointment(options?: { skipConfirm?: boolean }) {
    // El aviso de cancelacion del recordatorio ya confirma la intencion; evita el
    // doble dialogo. El boton "Cancelar cita" general si pide confirmacion.
    if (!options?.skipConfirm && !window.confirm("¿Seguro que quieres cancelar esta cita?")) {
      return;
    }

    setBusy(true);
    setMessage("");
    setError("");
    setShowCancelPrompt(false);
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

  function handleMedicalHistorySaved() {
    setMedicalHistorySaved(true);
    setFirstVisit(false);
  }

  return (
    <section className="appointment-view">
      <article className="appointment-banner">
        <div className="appointment-banner-row">
          <div className="appointment-identity">
            <span className="section-kicker">Tu cita</span>
            <h2>
              {details.patient.firstName} {details.patient.lastName}
            </h2>
          </div>

          <div className="appointment-meta">
            <div className="meta-chip">
              <small>Servicio</small>
              {details.service?.name ?? "Consulta"}
            </div>
            <div className="meta-chip">
              <small>Horario</small>
              {dateTimeFormatter.format(scheduledStart)}
            </div>
            <div className="meta-chip">
              <small>Motivo</small>
              {details.appointment.reason || "Sin motivo capturado."}
            </div>
          </div>

          {!isFinal ? (
            <div className="appointment-actions">
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
                onClick={toggleReschedule}
              >
                {rescheduleOpen ? "Cerrar cambio de horario" : "Cambiar horario"}
              </button>
              <button className="danger-button" disabled={busy} onClick={() => void cancelAppointment()}>
                Cancelar cita
              </button>
            </div>
          ) : null}
        </div>

        {showCancelPrompt && !isFinal ? (
          <div className="cancel-prompt" role="alert">
            <p>¿Quieres cancelar esta cita del {dateTimeFormatter.format(scheduledStart)}?</p>
            <div className="button-row">
              <button
                className="danger-button"
                disabled={busy}
                onClick={() => void cancelAppointment({ skipConfirm: true })}
              >
                {busy ? "Cancelando…" : "Sí, cancelar"}
              </button>
              <button className="ghost-button" disabled={busy} onClick={() => setShowCancelPrompt(false)}>
                No, conservar
              </button>
            </div>
          </div>
        ) : null}

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

        {rescheduleOpen && !isFinal ? (
          <div className="inline-form">
            <div className="field calendar-field">
              <span>Elige una fecha nueva</span>
              <Calendar
                selectedDate={rescheduleDate || tomorrowString()}
                availableDays={availableDays}
                loading={loadingDays}
                onDateSelect={(date) => void loadSlots(date)}
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

      {!isFinal && documentPublicKey ? (
        <article className="appointment-antecedentes">
          <div className="panel-header">
            <span className="section-kicker">Antecedentes</span>
            <h2>Comparte contexto clinico basico</h2>
          </div>

          {!precheckinStarted ? (
            <div className="precheckin-intro">
              <p>
                Para agilizar la consulta con su médico, ayúdenos contestando este formulario
                pre-consulta. Es opcional y solo lo verá su médico.
              </p>
              <button className="action-button" type="button" onClick={() => setPrecheckinStarted(true)}>
                Contestar
              </button>
            </div>
          ) : firstVisit === null ? (
            <div className="precheckin-branch">
              <p className="precheckin-question">
                ¿Es su primera visita con este médico o ya contestó antes el formulario de
                antecedentes?
              </p>
              <div className="button-row">
                <button className="action-button" type="button" onClick={() => setFirstVisit(true)}>
                  Es mi primera visita
                </button>
                <button className="ghost-button" type="button" onClick={() => setFirstVisit(false)}>
                  Ya contesté antes
                </button>
              </div>
              <button
                className="link-button"
                type="button"
                onClick={() => setPrecheckinStarted(false)}
              >
                Cancelar
              </button>
            </div>
          ) : firstVisit ? (
            <>
              <p className="precheckin-path-note">
                Primera visita: cuéntenos sus antecedentes.{" "}
                {!medicalHistorySaved ? (
                  <button className="link-button" type="button" onClick={() => setFirstVisit(null)}>
                    Cambiar
                  </button>
                ) : null}
              </p>
              {medicalHistorySaved ? (
                <p className="form-success" role="status">
                  Antecedentes enviados de forma cifrada. Tu médico los recibirá al sincronizar.
                </p>
              ) : (
                <MedicalHistoryForm
                  token={token}
                  publicKey={documentPublicKey}
                  prefillIdentification={identificationPrefill}
                  onSaved={handleMedicalHistorySaved}
                />
              )}
            </>
          ) : (
            <>
              {medicalHistorySaved ? (
                <p className="form-success" role="status">
                  Antecedentes enviados de forma cifrada. Ahora puede contestar su preconsulta.
                </p>
              ) : null}
              <p className="precheckin-path-note">
                Ya nos visitó antes: preconsulta guiada.{" "}
                {!aiPreconsultaSaved ? (
                  <button className="link-button" type="button" onClick={() => setFirstVisit(null)}>
                    Cambiar
                  </button>
                ) : null}
              </p>
              {aiPreconsultaSaved ? (
                <p className="form-success" role="status">
                  Preconsulta enviada de forma cifrada. Tu médico la recibirá al sincronizar.
                </p>
              ) : (
                <AiPreconsultaChat
                  token={token}
                  publicKey={documentPublicKey}
                  initialMotivo={details.appointment.reason ?? ""}
                  onSaved={() => setAiPreconsultaSaved(true)}
                />
              )}
            </>
          )}
        </article>
      ) : null}
    </section>
  );
}
