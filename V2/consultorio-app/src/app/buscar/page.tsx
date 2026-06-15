import type { Metadata } from "next";
import Link from "next/link";

import {
  searchPublicDoctors,
  type PublicDoctorSearchResult
} from "../../services/doctor/doctor-search-service";

export const metadata: Metadata = {
  title: "Buscar medico"
};

const specialtyLabels: Record<PublicDoctorSearchResult["specialty"], string> = {
  GENERAL_MEDICINE: "Medicina general",
  ODONTOLOGY: "Odontologia"
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function SearchResultCard({ doctor }: { doctor: PublicDoctorSearchResult }) {
  const location = [doctor.city, doctor.state].filter(Boolean).join(", ");
  const initials = doctor.professionalName
    .replace(/^Dr\.?\s*/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  return (
    <article className="search-result-card">
      {doctor.profilePhoto ? (
        <div
          className="search-result-avatar"
          style={{ backgroundImage: `url(${doctor.profilePhoto})` }}
          role="img"
          aria-label={`Retrato de ${doctor.professionalName}`}
        />
      ) : (
        <div className="search-result-avatar search-result-avatar-fallback" aria-hidden>
          {initials}
        </div>
      )}
      <div className="search-result-main">
        <p className="search-result-specialty">{specialtyLabels[doctor.specialty]}</p>
        <h2>{doctor.professionalName}</h2>
        {location && <p className="search-result-location">{location}</p>}
        {doctor.services.length > 0 && (
          <ul className="search-result-services" aria-label="Servicios activos">
            {doctor.services.map((service) => (
              <li key={service.id}>{service.name}</li>
            ))}
          </ul>
        )}
      </div>
      <Link className="action-button search-result-action" href={`/perfil/${doctor.publicSlug}`}>
        Ver perfil
      </Link>
    </article>
  );
}

export default async function SearchPage({
  searchParams
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const q = firstParam(params.q) ?? "";
  const city = firstParam(params.city) ?? "";
  const specialty = firstParam(params.specialty) ?? "";
  const hasSearch = Boolean(q.trim() || city.trim() || specialty.trim());
  const result = hasSearch
    ? await searchPublicDoctors({ q, city, specialty })
    : { results: [], total: 0 };

  return (
    <section className="search-page">
      <header className="search-page-header">
        <Link href="/" className="brand-mark">MiDoc</Link>
        <Link href="/medico/registro" className="ghost-button">
          Soy medico
        </Link>
      </header>

      <section className="search-panel" aria-labelledby="search-title">
        <div>
          <p className="section-kicker">Busca y agenda</p>
          <h1 id="search-title">Encuentra a tu medico</h1>
          <p>
            Busca por nombre, ciudad o especialidad. Despues abre el perfil publico para
            revisar servicios y agendar.
          </p>
        </div>

        <form className="doctor-search-form" action="/buscar" role="search">
          <label className="field">
            <span>Nombre, ciudad o especialidad</span>
            <input
              name="q"
              defaultValue={q}
              placeholder="Ej. medicina general en Chihuahua"
              autoComplete="off"
              aria-describedby="search-help"
            />
          </label>
          <p id="search-help" className="field-hint">
            Tambien puedes buscar odontologia, dentista, medicina familiar o el nombre de tu
            doctor.
          </p>
          <button className="action-button" type="submit">
            Buscar medico
          </button>
        </form>
      </section>

      <section className="search-results-section" aria-live="polite">
        {!hasSearch && (
          <div className="empty-state">
            <strong>Empieza con una busqueda</strong>
            <p>Prueba con el nombre del medico, tu ciudad o una especialidad.</p>
          </div>
        )}

        {hasSearch && result.results.length === 0 && (
          <div className="empty-state">
            <strong>No encontramos medicos publicados con esa busqueda</strong>
            <p>Revisa la escritura, cambia la ciudad o pide al consultorio su enlace directo.</p>
          </div>
        )}

        {result.results.length > 0 && (
          <>
            <p className="search-count">
              {result.total === 1 ? "1 medico encontrado" : `${result.total} medicos encontrados`}
            </p>
            <div className="search-results-list">
              {result.results.map((doctor) => (
                <SearchResultCard key={doctor.publicSlug} doctor={doctor} />
              ))}
            </div>
          </>
        )}
      </section>
    </section>
  );
}
