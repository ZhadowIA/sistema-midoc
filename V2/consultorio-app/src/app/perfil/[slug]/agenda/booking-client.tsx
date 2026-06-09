"use client";

import { useState } from "react";

type PublicProfile = {
  doctor: {
    publicSlug: string;
    professionalName: string;
  };
  services: Array<{
    id: string;
    name: string;
    description: string | null;
    priceCents: number;
    currency: string;
    durationMinutes: number;
  }>;
};

type AvailabilityResponse = {
  slots: Array<{
    slotStart: string;
    slotEnd: string;
    serviceId: string;
  }>;
};

type BookingClientProps = {
  profile: PublicProfile;
  initialDate: string;
};

function currency(priceCents: number, code: string) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: code
  }).format(priceCents / 100);
}

export function BookingClient({ profile, initialDate }: BookingClientProps) {
  const [serviceId, setServiceId] = useState(profile.services[0]?.id ?? "");
  const [dateFrom, setDateFrom] = useState(initialDate);
  const [slots, setSlots] = useState<AvailabilityResponse["slots"]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string>("");
  const [holdToken, setHoldToken] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [patient, setPatient] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    reason: ""
  });

  async function loadSlots() {
    if (!serviceId || !dateFrom) {
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(
        `/api/public/doctors/${profile.doctor.publicSlug}/availability?serviceId=${serviceId}&dateFrom=${dateFrom}&days=1`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No fue posible consultar horarios.");
      }

      setSlots(data.slots);
      setSelectedSlot("");
      setHoldToken("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible consultar horarios.");
    } finally {
      setBusy(false);
    }
  }

  async function reserveSlot(slotStart: string) {
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(`/api/public/doctors/${profile.doctor.publicSlug}/holds`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          serviceId,
          slotStart
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo apartar el horario.");
      }

      setSelectedSlot(slotStart);
      setHoldToken(data.hold.token);
      setMessage("Horario apartado por 10 minutos. Completa tus datos para confirmar.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo apartar el horario.");
    } finally {
      setBusy(false);
    }
  }

  async function submitBooking(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!holdToken) {
      setMessage("Primero aparta un horario.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/public/appointments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          holdToken,
          patient: {
            firstName: patient.firstName,
            lastName: patient.lastName,
            phone: patient.phone || undefined,
            email: patient.email || undefined
          },
          reason: patient.reason || undefined,
          legal: {
            acceptedTerms: true,
            acceptedPrivacy: true
          }
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No fue posible crear la cita.");
      }

      window.location.href = `/perfil/${profile.doctor.publicSlug}/cita/${data.appointment.confirmationToken}`;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible crear la cita.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="booking-shell booking-shell-inline">
      <article className="panel">
        <div className="panel-header">
          <span className="section-kicker">Agenda publica</span>
          <h2>Selecciona servicio y horario</h2>
        </div>

        <div className="booking-toolbar">
          <label className="field">
            <span>Servicio</span>
            <select value={serviceId} onChange={(event) => setServiceId(event.target.value)}>
              {profile.services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name} · {currency(service.priceCents, service.currency)}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Fecha</span>
            <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </label>

          <button className="action-button" onClick={loadSlots} disabled={busy}>
            {busy ? "Consultando..." : "Buscar horarios"}
          </button>
        </div>

        <div className="slot-grid">
          {slots.map((slot) => (
            <button
              className={selectedSlot === slot.slotStart ? "slot-button active" : "slot-button"}
              key={slot.slotStart}
              onClick={() => reserveSlot(slot.slotStart)}
              type="button"
            >
              {new Intl.DateTimeFormat("es-MX", {
                hour: "2-digit",
                minute: "2-digit"
              }).format(new Date(slot.slotStart))}
            </button>
          ))}
        </div>

        {!busy && slots.length === 0 ? (
          <p className="status-copy">Selecciona servicio y fecha para consultar horarios disponibles.</p>
        ) : null}
      </article>

      <article className="panel">
        <div className="panel-header">
          <span className="section-kicker">Paciente</span>
          <h2>Confirma tu cita</h2>
        </div>

        <form className="booking-form" onSubmit={submitBooking}>
          <label className="field">
            <span>Nombre</span>
            <input
              required
              value={patient.firstName}
              onChange={(event) => setPatient((current) => ({ ...current, firstName: event.target.value }))}
            />
          </label>
          <label className="field">
            <span>Apellidos</span>
            <input
              required
              value={patient.lastName}
              onChange={(event) => setPatient((current) => ({ ...current, lastName: event.target.value }))}
            />
          </label>
          <label className="field">
            <span>Telefono</span>
            <input
              required
              value={patient.phone}
              onChange={(event) => setPatient((current) => ({ ...current, phone: event.target.value }))}
            />
          </label>
          <label className="field">
            <span>Correo</span>
            <input
              type="email"
              value={patient.email}
              onChange={(event) => setPatient((current) => ({ ...current, email: event.target.value }))}
            />
          </label>
          <label className="field field-full">
            <span>Motivo de consulta</span>
            <textarea
              rows={4}
              value={patient.reason}
              onChange={(event) => setPatient((current) => ({ ...current, reason: event.target.value }))}
            />
          </label>

          <button className="action-button" disabled={busy || !holdToken} type="submit">
            {busy ? "Guardando..." : "Crear cita"}
          </button>
        </form>

        {message ? <p className="status-copy">{message}</p> : null}
      </article>
    </section>
  );
}
