import { notFound } from "next/navigation";

import { getPublicDoctorProfile } from "../../../services/doctor/doctor-profile-service";
import { BookingClient } from "./agenda/booking-client";

const dayLabels = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];

function formatMoney(priceCents: number, currency: string) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency
  }).format(priceCents / 100);
}

function nextDateString() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

export default async function PublicDoctorProfilePage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const profile = await getPublicDoctorProfile(slug);

  if (!profile) {
    notFound();
  }

  const location = [profile.doctor.city, profile.doctor.state, profile.doctor.country]
    .filter(Boolean)
    .join(", ");

  return (
    <section className="public-shell">
      <div className="hero-card">
        <div className="hero-copy">
          <span className="eyebrow">{profile.doctor.specialty === "ODONTOLOGY" ? "Odontologia" : "Medicina general"}</span>
          <h1>{profile.doctor.professionalName}</h1>
          <p>{profile.doctor.description || "Atencion clinica con agenda clara, seguimiento y preparacion para expediente integrado."}</p>
          <div className="hero-meta">
            {profile.doctor.licenseNumber ? <span>Cedula: {profile.doctor.licenseNumber}</span> : null}
            {location ? <span>{location}</span> : null}
            {profile.doctor.phone ? <span>{profile.doctor.phone}</span> : null}
          </div>
        </div>

        <div className="hero-panel">
          <div>
            <strong>{profile.services.length}</strong>
            <span>servicios activos</span>
          </div>
          <div>
            <strong>{profile.availability.length}</strong>
            <span>bloques de horario</span>
          </div>
          <div>
            <strong>{profile.doctor.consultationDuration} min</strong>
            <span>duracion base</span>
          </div>
        </div>

      </div>

      <div className="profile-grid">
        <article className="panel">
          <div className="panel-header">
            <span className="section-kicker">Servicios</span>
            <h2>Oferta publicada</h2>
          </div>

          <div className="service-list">
            {profile.services.map((service) => (
              <div className="service-card" key={service.id}>
                <div className="service-card-top">
                  <h3>{service.name}</h3>
                  <span>{formatMoney(service.priceCents, service.currency)}</span>
                </div>
                <p>{service.description || "Servicio disponible para agenda publica."}</p>
                <small>{service.durationMinutes} minutos</small>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <span className="section-kicker">Horarios</span>
            <h2>Disponibilidad semanal</h2>
          </div>

          <div className="availability-list">
            {profile.availability.map((rule) => (
              <div className="availability-row" key={rule.id}>
                <strong>{rule.dayOfWeek !== null ? dayLabels[rule.dayOfWeek] : "Fecha especial"}</strong>
                <span>
                  {rule.startTime} - {rule.endTime}
                </span>
                <small>
                  Cada {rule.slotInterval} min
                  {rule.minAdvanceHours ? ` · Min ${rule.minAdvanceHours} h antes` : ""}
                  {rule.maxAdvanceDays ? ` · Hasta ${rule.maxAdvanceDays} dias` : ""}
                </small>
              </div>
            ))}
          </div>

          {profile.blocks.length > 0 ? (
            <div className="blocks-box">
              <h3>Bloqueos proximos</h3>
              <ul>
                {profile.blocks.map((block) => (
                  <li key={block.id}>
                    {new Intl.DateTimeFormat("es-MX", {
                      dateStyle: "medium",
                      timeStyle: "short"
                    }).format(new Date(block.startsAt))}
                    {block.reason ? ` · ${block.reason}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </article>
      </div>

      <article className="panel">
        <div className="panel-header">
          <span className="section-kicker">Reserva online</span>
          <h2>Agenda tu cita desde este mismo perfil</h2>
        </div>

        <BookingClient profile={profile} initialDate={nextDateString()} />
      </article>
    </section>
  );
}
