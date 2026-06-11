"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Appointment = {
  id: string;
  status: string;
  scheduledStart: string;
  reason: string | null;
  serviceName: string | null;
  doctorName: string | null;
  isUpcoming: boolean;
};

type Summary = {
  id: string;
  title: string | null;
  createdAt: string;
  expiresAt: string;
  status: string;
};

type PortalData = {
  patient: { firstName: string; lastName: string; email: string };
  appointments: Appointment[];
  summaries: Summary[];
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente de confirmar",
  CONFIRMED: "Confirmada",
  CANCELLED: "Cancelada",
  COMPLETED: "Atendida",
  RESCHEDULED: "Reagendada",
  NO_SHOW: "No asistio"
};

const dateTimeFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" });
const dateFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" });

export function PatientPortalClient() {
  const router = useRouter();
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const response = await fetch("/api/patient/portal");
      if (response.status === 401) {
        router.replace("/paciente/login");
        return;
      }
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error || "No se pudo cargar el portal.");
        return;
      }
      setData(body);
    }
    void load();
  }, [router]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/paciente/login");
    router.refresh();
  }

  if (error) {
    return (
      <section className="booking-shell">
        <article className="panel">
          <p className="form-error" role="alert">
            {error}
          </p>
        </article>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="booking-shell">
        <article className="panel">
          <p className="field-hint">Cargando tu portal…</p>
        </article>
      </section>
    );
  }

  const upcoming = data.appointments.filter((appointment) => appointment.isUpcoming);
  const past = data.appointments.filter((appointment) => !appointment.isUpcoming);

  return (
    <section className="booking-shell">
      <article className="panel">
        <div className="panel-header">
          <span className="section-kicker">Portal del paciente</span>
          <h2>Hola, {data.patient.firstName}</h2>
        </div>
        <div className="button-row">
          <button className="ghost-button" onClick={() => void logout()}>
            Cerrar sesion
          </button>
        </div>
      </article>

      <article className="panel">
        <div className="panel-header">
          <span className="section-kicker">Proximas citas</span>
          <h2>{upcoming.length > 0 ? "Tienes citas agendadas" : "Sin citas proximas"}</h2>
        </div>
        {upcoming.map((appointment) => (
          <div key={appointment.id} className="appointment-summary">
            <p>
              <strong>{dateTimeFormatter.format(new Date(appointment.scheduledStart))}</strong>
            </p>
            <p>{appointment.serviceName ?? "Consulta"}{appointment.doctorName ? ` · ${appointment.doctorName}` : ""}</p>
            <p>{STATUS_LABELS[appointment.status] ?? appointment.status}</p>
          </div>
        ))}
      </article>

      {past.length > 0 ? (
        <article className="panel">
          <div className="panel-header">
            <span className="section-kicker">Historial de citas</span>
            <h2>Citas anteriores</h2>
          </div>
          {past.map((appointment) => (
            <div key={appointment.id} className="appointment-summary">
              <p>
                <strong>{dateTimeFormatter.format(new Date(appointment.scheduledStart))}</strong> ·{" "}
                {STATUS_LABELS[appointment.status] ?? appointment.status}
              </p>
              <p>{appointment.serviceName ?? "Consulta"}{appointment.doctorName ? ` · ${appointment.doctorName}` : ""}</p>
            </div>
          ))}
        </article>
      ) : null}

      <article className="panel">
        <div className="panel-header">
          <span className="section-kicker">Resumenes autorizados</span>
          <h2>{data.summaries.length > 0 ? "Documentos disponibles" : "Sin resumenes por ahora"}</h2>
        </div>
        {data.summaries.length > 0 ? (
          <p className="field-hint">
            Tu medico te compartio estos resumenes. Abrelos con el enlace seguro que te enviamos:
            por privacidad, solo ese enlace contiene la llave para descifrarlos.
          </p>
        ) : null}
        {data.summaries.map((summary) => (
          <div key={summary.id} className="appointment-summary">
            <p>
              <strong>{summary.title ?? "Resumen clinico"}</strong>
            </p>
            <p>
              Emitido el {dateFormatter.format(new Date(summary.createdAt))} · vence el{" "}
              {dateFormatter.format(new Date(summary.expiresAt))}
            </p>
          </div>
        ))}
      </article>
    </section>
  );
}
