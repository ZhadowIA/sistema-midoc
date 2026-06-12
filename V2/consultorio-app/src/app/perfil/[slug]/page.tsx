import { notFound } from "next/navigation";

import { getPublicDoctorProfile } from "../../../services/doctor/doctor-profile-service";
import { BookingClient } from "./agenda/booking-client";
import { ReviewsSection } from "./reviews-section";
import {
  IconCalendar,
  IconCertificate,
  IconChat,
  IconClock,
  IconPhone,
  IconPin,
  IconStar,
  IconStethoscope
} from "./icons";

const dayLabels = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

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

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="dp-stars" role="img" aria-label={`${rating} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <IconStar key={star} className={star <= Math.round(rating) ? "dp-star is-on" : "dp-star"} />
      ))}
    </div>
  );
}

function initials(name: string) {
  return name
    .replace(/^Dr\.?\s*/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
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

  const location = [profile.doctor.addressLine1, profile.doctor.city, profile.doctor.state]
    .filter(Boolean)
    .join(", ");

  const specialty = profile.doctor.specialty === "ODONTOLOGY" ? "Odontología" : "Medicina General";
  const phoneDigits = profile.doctor.phone?.replace(/\D/g, "") ?? "";

  return (
    <section className="public-shell profile-v2">
      {/* ---------- Encabezado ---------- */}
      <header className="dp-hero">
        <div
          className="dp-cover"
          style={
            profile.doctor.coverPhoto
              ? { backgroundImage: `url(${profile.doctor.coverPhoto})` }
              : undefined
          }
        >
          <span className="dp-cover-scrim" aria-hidden />
        </div>

        <div className="dp-hero-body">
          <div className="dp-avatar-wrap">
            {profile.doctor.profilePhoto ? (
              <div
                className="dp-avatar"
                style={{ backgroundImage: `url(${profile.doctor.profilePhoto})` }}
                role="img"
                aria-label={`Retrato de ${profile.doctor.professionalName}`}
              />
            ) : (
              <div className="dp-avatar dp-avatar-fallback" aria-hidden>
                {initials(profile.doctor.professionalName)}
              </div>
            )}
          </div>

          <div className="dp-identity">
            <p className="dp-eyebrow">
              <IconStethoscope className="dp-eyebrow-icon" />
              {specialty}
            </p>
            <h1 className="dp-name">Dr(a). {profile.doctor.professionalName}</h1>

            {profile.ratings.totalReviews > 0 && (
              <div className="dp-rating">
                <StarRating rating={profile.ratings.averageRating} />
                <span className="dp-rating-value">{profile.ratings.averageRating}</span>
                <span className="dp-rating-count">
                  · {profile.ratings.totalReviews} opiniones
                </span>
              </div>
            )}

            <div className="dp-facts">
              {location && (
                <span className="dp-fact">
                  <IconPin className="dp-fact-icon" />
                  {location}
                </span>
              )}
              {profile.doctor.phone && (
                <span className="dp-fact">
                  <IconPhone className="dp-fact-icon" />
                  {profile.doctor.phone}
                </span>
              )}
              {profile.doctor.licenseNumber && (
                <span className="dp-fact">
                  <IconCertificate className="dp-fact-icon" />
                  Cédula {profile.doctor.licenseNumber}
                </span>
              )}
            </div>

            {profile.doctor.phone && (
              <div className="dp-actions">
                <a href={`tel:${profile.doctor.phone}`} className="dp-btn dp-btn-primary">
                  <IconPhone className="dp-btn-icon" />
                  Llamar
                </a>
                <a
                  href={`https://wa.me/${phoneDigits}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="dp-btn dp-btn-whatsapp"
                >
                  <IconChat className="dp-btn-icon" />
                  WhatsApp
                </a>
                <a href="#agenda" className="dp-btn dp-btn-ghost">
                  <IconCalendar className="dp-btn-icon" />
                  Agendar cita
                </a>
              </div>
            )}
          </div>

          <dl className="dp-stats">
            <div className="dp-stat">
              <dt>Servicios</dt>
              <dd>{profile.services.length}</dd>
            </div>
            <div className="dp-stat">
              <dt>Días de atención</dt>
              <dd>{profile.availability.length}</dd>
            </div>
            <div className="dp-stat">
              <dt>Minutos por cita</dt>
              <dd>{profile.doctor.consultationDuration}</dd>
            </div>
          </dl>
        </div>
      </header>

      {/* ---------- Acerca de ---------- */}
      <section className="dp-section">
        <div className="dp-section-head">
          <p className="dp-kicker">Perfil profesional</p>
          <h2 className="dp-h2">Acerca de mí</h2>
        </div>
        <p className="dp-prose">
          {profile.doctor.description ||
            "Profesional con experiencia en atención clínica, dedicado a proporcionar un servicio de calidad con seguimiento integral de los pacientes."}
        </p>
      </section>

      {/* ---------- Servicios ---------- */}
      {profile.services.length > 0 && (
        <section className="dp-section">
          <div className="dp-section-head">
            <p className="dp-kicker">Atención</p>
            <h2 className="dp-h2">Servicios disponibles</h2>
            <p className="dp-section-sub">Consulta el precio y la duración de cada servicio.</p>
          </div>

          <div className="dp-services">
            {profile.services.map((service) => (
              <article className="dp-service" key={service.id}>
                <header className="dp-service-top">
                  <h3 className="dp-service-name">{service.name}</h3>
                  <span className="dp-service-price">
                    {formatMoney(service.priceCents, service.currency)}
                  </span>
                </header>
                {service.description && (
                  <p className="dp-service-desc">{service.description}</p>
                )}
                <footer className="dp-service-foot">
                  <IconClock className="dp-inline-icon" />
                  {service.durationMinutes} minutos
                </footer>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* ---------- Horarios ---------- */}
      {profile.availability.length > 0 && (
        <section className="dp-section">
          <div className="dp-section-head">
            <p className="dp-kicker">Disponibilidad</p>
            <h2 className="dp-h2">Horarios de atención</h2>
          </div>

          <ul className="dp-schedule">
            {profile.availability.map((rule) => (
              <li className="dp-schedule-row" key={rule.id}>
                <span className="dp-schedule-day">
                  {rule.dayOfWeek !== null ? dayLabels[rule.dayOfWeek] : "Fecha especial"}
                </span>
                <span className="dp-schedule-time">
                  <IconClock className="dp-inline-icon" />
                  {rule.startTime} – {rule.endTime}
                </span>
                <span className="dp-schedule-meta">cada {rule.slotInterval} min</span>
              </li>
            ))}
          </ul>

          {profile.blocks.length > 0 && (
            <div className="dp-notice">
              <h3 className="dp-notice-title">Bloqueos agendados</h3>
              <ul className="dp-notice-list">
                {profile.blocks.map((block) => (
                  <li key={block.id}>
                    <span className="dp-notice-date">
                      {new Intl.DateTimeFormat("es-MX", {
                        dateStyle: "short",
                        timeStyle: "short",
                        timeZone: profile.doctor.timeZone
                      }).format(new Date(block.startsAt))}
                    </span>
                    {block.reason && <span className="dp-notice-reason">{block.reason}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* ---------- Ubicación ---------- */}
      {location && (
        <section className="dp-section">
          <div className="dp-section-head">
            <p className="dp-kicker">Cómo llegar</p>
            <h2 className="dp-h2">Ubicación</h2>
          </div>
          <div className="dp-map-card">
            <p className="dp-map-address">
              <IconPin className="dp-inline-icon" />
              {location}
            </p>
            <iframe
              className="dp-map"
              title={`Mapa de ${location}`}
              src={`https://www.google.com/maps/embed/v1/place?key=AIzaSyDzPvzIi81ZYB2-2KPuYRXLhzG6dHWzc9E&q=${encodeURIComponent(location)}`}
              allowFullScreen={true}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </section>
      )}

      {/* ---------- Galería ---------- */}
      {profile.gallery.length > 0 && (
        <section className="dp-section">
          <div className="dp-section-head">
            <p className="dp-kicker">Instalaciones</p>
            <h2 className="dp-h2">Galería</h2>
            <p className="dp-section-sub">Consultorio y equipo médico.</p>
          </div>
          <div className="dp-gallery">
            {profile.gallery.map((image) => (
              <figure className="dp-gallery-item" key={image.id}>
                <div
                  className="dp-gallery-frame dp-gallery-photo"
                  style={{ backgroundImage: `url(${image.url})` }}
                  role="img"
                  aria-label={image.caption ?? "Imagen del consultorio"}
                />
                {image.caption && <figcaption>{image.caption}</figcaption>}
              </figure>
            ))}
          </div>
        </section>
      )}

      {/* ---------- Agenda ---------- */}
      <section className="dp-section" id="agenda">
        <div className="dp-section-head">
          <p className="dp-kicker">Reserva en línea</p>
          <h2 className="dp-h2">Agenda tu cita</h2>
          <p className="dp-section-sub">Selecciona servicio y horario disponible.</p>
        </div>

        <BookingClient profile={profile} initialDate={nextDateString()} />
      </section>

      {/* ---------- Opiniones ---------- */}
      {profile.reviews.length > 0 && (
        <ReviewsSection reviews={profile.reviews} ratings={profile.ratings} />
      )}
    </section>
  );
}
