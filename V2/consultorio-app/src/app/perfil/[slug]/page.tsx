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

  const location = [profile.doctor.city, profile.doctor.state]
    .filter(Boolean)
    .join(", ");

  const specialty = profile.doctor.specialty === "ODONTOLOGY" ? "Odontología" : "Medicina General";

  return (
    <section className="public-shell">
      {/* Doctor Header Card - Doctoralia Style */}
      <div className="doctor-header-card">
        <div className="doctor-header-content">
          <div className="doctor-header-info">
            <div className="specialty-badge">{specialty}</div>
            <h1 className="doctor-name">Dr(a). {profile.doctor.professionalName}</h1>

            {location && (
              <div className="doctor-location">
                <span className="location-icon">📍</span>
                <span>{location}</span>
              </div>
            )}

            {profile.doctor.description && (
              <p className="doctor-bio">{profile.doctor.description}</p>
            )}

            <div className="doctor-meta-items">
              {profile.doctor.licenseNumber && (
                <div className="meta-item">
                  <span className="meta-label">Cédula Profesional</span>
                  <span className="meta-value">{profile.doctor.licenseNumber}</span>
                </div>
              )}
              {profile.doctor.phone && (
                <div className="meta-item">
                  <span className="meta-label">Teléfono</span>
                  <span className="meta-value">{profile.doctor.phone}</span>
                </div>
              )}
            </div>
          </div>

          <div className="doctor-stats">
            <div className="stat-item">
              <div className="stat-number">{profile.services.length}</div>
              <div className="stat-label">Servicios</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">{profile.availability.length}</div>
              <div className="stat-label">Horarios</div>
            </div>
            <div className="stat-item">
              <div className="stat-number">{profile.doctor.consultationDuration}</div>
              <div className="stat-label">Min por cita</div>
            </div>
          </div>
        </div>
      </div>

      {/* Services Section */}
      {profile.services.length > 0 && (
        <section className="services-section">
          <div className="section-header">
            <h2>Servicios disponibles</h2>
            <p className="section-subtitle">Consulta el precio y duración de cada servicio</p>
          </div>

          <div className="services-grid">
            {profile.services.map((service) => (
              <div className="service-card" key={service.id}>
                <div className="service-header">
                  <h3 className="service-name">{service.name}</h3>
                  <div className="service-price">{formatMoney(service.priceCents, service.currency)}</div>
                </div>
                {service.description && <p className="service-description">{service.description}</p>}
                <div className="service-footer">
                  <span className="service-duration">⏱️ {service.durationMinutes} minutos</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Availability Section */}
      {profile.availability.length > 0 && (
        <section className="availability-section">
          <div className="section-header">
            <h2>Horarios disponibles</h2>
            <p className="section-subtitle">Atiende durante estos horarios</p>
          </div>

          <div className="availability-grid">
            {profile.availability.map((rule) => (
              <div className="availability-card" key={rule.id}>
                <div className="availability-day">
                  {rule.dayOfWeek !== null ? dayLabels[rule.dayOfWeek] : "Fecha especial"}
                </div>
                <div className="availability-time">
                  <span className="time-icon">🕐</span>
                  <span>{rule.startTime} - {rule.endTime}</span>
                </div>
                <div className="availability-details">
                  <small>Cada {rule.slotInterval} min</small>
                  {rule.minAdvanceHours && <small>Mín {rule.minAdvanceHours}h antes</small>}
                  {rule.maxAdvanceDays && <small>Hasta {rule.maxAdvanceDays} días</small>}
                </div>
              </div>
            ))}
          </div>

          {profile.blocks.length > 0 && (
            <div className="blocks-notice">
              <h3>Bloqueos agendados</h3>
              <ul className="blocks-list">
                {profile.blocks.map((block) => (
                  <li key={block.id}>
                    <span className="block-date">
                      {new Intl.DateTimeFormat("es-MX", {
                        dateStyle: "short",
                        timeStyle: "short",
                        timeZone: profile.doctor.timeZone
                      }).format(new Date(block.startsAt))}
                    </span>
                    {block.reason && <span className="block-reason">{block.reason}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* Booking Section */}
      <section className="booking-section">
        <div className="section-header">
          <h2>Agenda tu cita</h2>
          <p className="section-subtitle">Selecciona servicio y horario disponible</p>
        </div>

        <BookingClient profile={profile} initialDate={nextDateString()} />
      </section>
    </section>
  );
}
