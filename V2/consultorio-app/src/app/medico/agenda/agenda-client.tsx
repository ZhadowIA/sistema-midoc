"use client";

import { useEffect, useState } from "react";

type AppointmentItem = {
  id: string;
  status: string;
  scheduledStart: string;
  reason: string | null;
  patient: {
    firstName: string;
    lastName: string;
  };
  service: {
    name: string;
  } | null;
};

export function DoctorAgendaClient() {
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadAppointments() {
      try {
        const response = await fetch("/api/admin/appointments");
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "No fue posible cargar la agenda.");
        }

        setAppointments(data.appointments);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "No fue posible cargar la agenda.");
      }
    }

    void loadAppointments();
  }, []);

  return (
    <section className="public-shell">
      <article className="panel">
        <div className="panel-header">
          <span className="section-kicker">Agenda medica</span>
          <h2>Citas para atencion clinica</h2>
        </div>

        {error ? <p className="status-copy">{error}</p> : null}

        <div className="service-list">
          {appointments.map((appointment) => (
            <a className="service-card" href={`/medico/atencion/${appointment.id}`} key={appointment.id}>
              <div className="service-card-top">
                <h3>
                  {appointment.patient.firstName} {appointment.patient.lastName}
                </h3>
                <span>{appointment.status}</span>
              </div>
              <p>{appointment.service?.name ?? "Consulta"}</p>
              <small>
                {new Intl.DateTimeFormat("es-MX", {
                  dateStyle: "medium",
                  timeStyle: "short"
                }).format(new Date(appointment.scheduledStart))}
              </small>
            </a>
          ))}
        </div>
      </article>
    </section>
  );
}
