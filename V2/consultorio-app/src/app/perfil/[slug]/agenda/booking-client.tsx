"use client";

import { useEffect, useState } from "react";
import { Calendar } from "./calendar";
import { IconCalendar } from "../icons";

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
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [loadingDays, setLoadingDays] = useState(true);
  const [slots, setSlots] = useState<AvailabilityResponse["slots"]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string>("");
  const [holdToken, setHoldToken] = useState<string>("");
  const [message, setMessage] = useState<string>("");
  const [searchError, setSearchError] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [bookingFor, setBookingFor] = useState<"self" | "other">("self");
  const [patient, setPatient] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    birthDate: "",
    reason: ""
  });
  const [guardian, setGuardian] = useState({
    fullName: "",
    relationship: "",
    phone: "",
    email: ""
  });

  // Mes visible del calendario (YYYY-MM): al cambiar de servicio o de mes se
  // consultan los dias con cupo real para deshabilitar el resto.
  const visibleMonth = dateFrom.slice(0, 7);
  const slug = profile.doctor.publicSlug;

  useEffect(() => {
    if (!serviceId || !visibleMonth) {
      return;
    }

    let cancelled = false;
    // Efecto de carga de datos: marcar "cargando" al cambiar mes/servicio dispara
    // el fetch, no un re-render en cascada.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingDays(true);

    fetch(
      `/api/public/doctors/${slug}/available-days?serviceId=${serviceId}&dateFrom=${visibleMonth}-01&days=31`
    )
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
  }, [serviceId, visibleMonth, slug]);

  async function loadSlots() {
    if (!serviceId || !dateFrom) {
      return;
    }

    setBusy(true);
    setSearchError("");

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
      setSearchError("");
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "No fue posible consultar horarios.");
      setSlots([]);
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
            email: patient.email || undefined,
            birthDate: patient.birthDate || undefined
          },
          reason: patient.reason || undefined,
          // Cuando se agenda para otra persona, el responsable (tutor) viaja como
          // contacto propio; no se mezcla con la identidad del paciente.
          contact:
            bookingFor === "other" && guardian.fullName
              ? {
                  fullName: guardian.fullName,
                  relationship: guardian.relationship || undefined,
                  phone: guardian.phone || undefined,
                  email: guardian.email || undefined
                }
              : undefined,
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
    <section className="booking-shell booking-modern">
      <div className="booking-search-panel">
        <h3 className="booking-step-title">Paso 1: Selecciona horario</h3>

        <div className="booking-toolbar">
          <label className="field">
            <span>Servicio</span>
            <select value={serviceId} onChange={(event) => {
              const value = event.currentTarget.value;
              setServiceId(value);
              setSearchError("");
            }}>
              {profile.services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name} · {currency(service.priceCents, service.currency)}
                </option>
              ))}
            </select>
          </label>

          <div className="field calendar-field">
            <span>Fecha</span>
            <Calendar
              selectedDate={dateFrom}
              availableDays={availableDays}
              loading={loadingDays}
              onDateSelect={(date) => {
                setDateFrom(date);
                setSearchError("");
              }}
            />
          </div>

          <button className="action-button" onClick={loadSlots} disabled={busy}>
            {busy ? "Buscando..." : "Buscar horarios"}
          </button>
        </div>

        {searchError ? (
          <div className="search-error" role="alert">
            <span aria-hidden>!</span>
            <span>{searchError}</span>
          </div>
        ) : null}

        {slots.length > 0 ? (
          <div className="slots-available">
            <p className="slots-info">Horarios disponibles ({slots.length})</p>
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
          </div>
        ) : !busy ? (
          <div className="no-slots">
            <p>
              <IconCalendar className="dp-inline-icon" /> Selecciona una fecha para ver horarios
              disponibles
            </p>
          </div>
        ) : null}
      </div>

      <div className="booking-form-panel">
        <h3 className="booking-step-title">Paso 2: Tus datos</h3>

        <form className="booking-form" onSubmit={submitBooking}>
          <div className="field field-full booking-for-toggle" role="radiogroup" aria-label="¿Para quién es la cita?">
            <button
              type="button"
              className={bookingFor === "self" ? "toggle-option toggle-active" : "toggle-option"}
              aria-pressed={bookingFor === "self"}
              onClick={() => setBookingFor("self")}
            >
              Para mí
            </button>
            <button
              type="button"
              className={bookingFor === "other" ? "toggle-option toggle-active" : "toggle-option"}
              aria-pressed={bookingFor === "other"}
              onClick={() => setBookingFor("other")}
            >
              Para otra persona / un menor
            </button>
          </div>

          <label className="field">
            <span>{bookingFor === "other" ? "Nombre del paciente*" : "Nombre*"}</span>
            <input
              required
              placeholder={bookingFor === "other" ? "Nombre del paciente" : "Tu nombre"}
              value={patient.firstName}
              onChange={(event) => setPatient((current) => ({ ...current, firstName: event.target.value }))}
            />
          </label>

          <label className="field">
            <span>{bookingFor === "other" ? "Apellidos del paciente*" : "Apellidos*"}</span>
            <input
              required
              placeholder={bookingFor === "other" ? "Apellidos del paciente" : "Tus apellidos"}
              value={patient.lastName}
              onChange={(event) => setPatient((current) => ({ ...current, lastName: event.target.value }))}
            />
          </label>

          <label className="field">
            <span>Fecha de nacimiento{bookingFor === "other" ? "*" : ""}</span>
            <input
              type="date"
              required={bookingFor === "other"}
              value={patient.birthDate}
              onChange={(event) => setPatient((current) => ({ ...current, birthDate: event.target.value }))}
            />
          </label>

          <label className="field">
            <span>{bookingFor === "other" ? "Teléfono del paciente" : "Teléfono*"}</span>
            <input
              required={bookingFor === "self"}
              type="tel"
              placeholder={bookingFor === "other" ? "Opcional" : "Tu teléfono"}
              value={patient.phone}
              onChange={(event) => setPatient((current) => ({ ...current, phone: event.target.value }))}
            />
          </label>

          <label className="field">
            <span>Correo electrónico</span>
            <input
              type="email"
              placeholder={bookingFor === "other" ? "Correo del paciente (opcional)" : "Tu correo (opcional)"}
              value={patient.email}
              onChange={(event) => setPatient((current) => ({ ...current, email: event.target.value }))}
            />
          </label>

          {bookingFor === "other" ? (
            <fieldset className="field field-full guardian-fieldset">
              <legend>Datos del responsable (tutor)</legend>

              <label className="field">
                <span>Nombre completo del responsable*</span>
                <input
                  required
                  placeholder="Nombre del tutor o responsable"
                  value={guardian.fullName}
                  onChange={(event) => setGuardian((current) => ({ ...current, fullName: event.target.value }))}
                />
              </label>

              <label className="field">
                <span>Parentesco*</span>
                <input
                  required
                  placeholder="Madre, padre, tutor…"
                  value={guardian.relationship}
                  onChange={(event) => setGuardian((current) => ({ ...current, relationship: event.target.value }))}
                />
              </label>

              <label className="field">
                <span>Teléfono del responsable*</span>
                <input
                  required
                  type="tel"
                  placeholder="Teléfono de contacto"
                  value={guardian.phone}
                  onChange={(event) => setGuardian((current) => ({ ...current, phone: event.target.value }))}
                />
              </label>

              <label className="field">
                <span>Correo del responsable</span>
                <input
                  type="email"
                  placeholder="Correo de contacto (opcional)"
                  value={guardian.email}
                  onChange={(event) => setGuardian((current) => ({ ...current, email: event.target.value }))}
                />
              </label>
            </fieldset>
          ) : null}

          <label className="field field-full">
            <span>Motivo de la cita</span>
            <textarea
              rows={3}
              placeholder="Cuéntanos brevemente qué te trae aquí"
              value={patient.reason}
              onChange={(event) => setPatient((current) => ({ ...current, reason: event.target.value }))}
            />
          </label>

          <div className="form-actions">
            <button
              className="action-button action-button-large"
              disabled={busy || !holdToken}
              type="submit"
            >
              {busy ? "Confirmando..." : "Confirmar cita"}
            </button>
          </div>

          {message && (
            <div className={message.includes("expiro") ? "form-error" : "form-success"}>
              {message}
            </div>
          )}
        </form>
      </div>
    </section>
  );
}
