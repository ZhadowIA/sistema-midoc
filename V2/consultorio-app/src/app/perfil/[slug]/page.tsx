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

// Mock data para ratings/reviews - En producción vendrían de la BD
function getMockRatings() {
  return {
    averageRating: 4.8,
    totalReviews: 127,
    reviews: [
      {
        id: "1",
        patientName: "María García",
        rating: 5,
        date: "2024-06-05",
        text: "Excelente doctor, muy profesional y atento. Recomendado."
      },
      {
        id: "2",
        patientName: "Carlos Rodríguez",
        rating: 5,
        date: "2024-06-03",
        text: "Muy amable y competente. La cita fue rápida y eficiente."
      },
      {
        id: "3",
        patientName: "Ana López",
        rating: 4,
        date: "2024-05-28",
        text: "Buen diagnóstico, aunque tardó un poco en la cita."
      }
    ]
  };
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="star-rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} className={star <= Math.round(rating) ? "star filled" : "star"}>
          ★
        </span>
      ))}
    </div>
  );
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
  const ratings = getMockRatings();

  return (
    <section className="public-shell">
      {/* Doctor Header Card - Premium Doctoralia Style */}
      <div className="doctor-header-card">
        <div className="doctor-header-content">
          <div className="doctor-header-info">
            <div className="specialty-badge">{specialty}</div>
            <h1 className="doctor-name">Dr(a). {profile.doctor.professionalName}</h1>

            {/* Rating Section */}
            <div className="rating-section">
              <StarRating rating={ratings.averageRating} />
              <span className="rating-value">{ratings.averageRating}</span>
              <span className="rating-count">({ratings.totalReviews} opiniones)</span>
            </div>

            {location && (
              <div className="doctor-location">
                <span className="location-icon">📍</span>
                <span>{location}</span>
              </div>
            )}

            {profile.doctor.phone && (
              <div className="doctor-phone">
                <span className="phone-icon">📱</span>
                <span>{profile.doctor.phone}</span>
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
            </div>

            {/* Contact Buttons */}
            <div className="contact-buttons">
              {profile.doctor.phone && (
                <>
                  <a href={`tel:${profile.doctor.phone}`} className="action-button contact-btn">
                    📞 Llamar
                  </a>
                  <a
                    href={`https://wa.me/${profile.doctor.phone.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="action-button contact-btn whatsapp-btn"
                  >
                    💬 WhatsApp
                  </a>
                </>
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

      {/* About Section */}
      <section className="about-section">
        <div className="section-header">
          <h2>Acerca de mí</h2>
        </div>
        <div className="about-card">
          <p>
            {profile.doctor.description ||
              "Profesional con experiencia en atención clínica, dedicado a proporcionar un servicio de calidad con seguimiento integral de los pacientes."}
          </p>
        </div>
      </section>

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

      {/* Location/Map Section */}
      {location && (
        <section className="location-section">
          <div className="section-header">
            <h2>Ubicación</h2>
          </div>
          <div className="location-card">
            <div className="location-info">
              <p className="location-text">{location}</p>
            </div>
            <iframe
              className="location-map"
              src={`https://www.google.com/maps/embed/v1/place?key=AIzaSyDzPvzIi81ZYB2-2KPuYRXLhzG6dHWzc9E&q=${encodeURIComponent(location)}`}
              allowFullScreen={true}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            ></iframe>
          </div>
        </section>
      )}

      {/* Gallery Section */}
      <section className="gallery-section">
        <div className="section-header">
          <h2>Galería</h2>
          <p className="section-subtitle">Consultorio y equipo médico</p>
        </div>
        <div className="gallery-grid">
          {/* Mock gallery items - En producción vendrían de la BD */}
          <div className="gallery-item">
            <div className="gallery-placeholder">📸</div>
            <p>Consultorio principal</p>
          </div>
          <div className="gallery-item">
            <div className="gallery-placeholder">🏥</div>
            <p>Sala de espera</p>
          </div>
          <div className="gallery-item">
            <div className="gallery-placeholder">⚕️</div>
            <p>Equipo médico</p>
          </div>
        </div>
      </section>

      {/* Booking Section */}
      <section className="booking-section">
        <div className="section-header">
          <h2>Agenda tu cita</h2>
          <p className="section-subtitle">Selecciona servicio y horario disponible</p>
        </div>

        <BookingClient profile={profile} initialDate={nextDateString()} />
      </section>

      {/* Reviews Section */}
      {ratings.reviews.length > 0 && (
        <section className="reviews-section">
          <div className="section-header">
            <h2>Opiniones de pacientes</h2>
            <p className="section-subtitle">{ratings.totalReviews} pacientes han valorado su servicio</p>
          </div>

          <div className="reviews-grid">
            {ratings.reviews.map((review) => (
              <div className="review-card" key={review.id}>
                <div className="review-header">
                  <div>
                    <h4 className="review-author">{review.patientName}</h4>
                    <p className="review-date">
                      {new Intl.DateTimeFormat("es-MX", {
                        dateStyle: "long"
                      }).format(new Date(review.date))}
                    </p>
                  </div>
                  <StarRating rating={review.rating} />
                </div>
                <p className="review-text">{review.text}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
