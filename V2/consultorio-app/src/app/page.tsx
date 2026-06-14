import Link from "next/link";

export default function HomePage() {
  return (
    <section className="landing-page">
      <header className="landing-nav">
        <Link href="/" className="brand-mark">MiDoc</Link>
        <nav aria-label="Navegacion principal">
          <Link href="/paciente/login">Portal paciente</Link>
          <Link href="/medico/registro" className="ghost-button">
            Soy medico
          </Link>
        </nav>
      </header>

      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-copy">
          <p className="section-kicker">Busca y agenda</p>
          <h1 id="landing-title">Encuentra a tu medico y agenda tu consulta</h1>
          <p>
            Busca por nombre, ciudad o especialidad. Revisa el perfil publico del consultorio y
            reserva un horario disponible.
          </p>

          <form className="doctor-search-form landing-search-form" action="/buscar" role="search">
            <label className="field">
              <span>Nombre, ciudad o especialidad</span>
              <input
                name="q"
                placeholder="Ej. odontologia en Chihuahua"
                autoComplete="off"
                aria-describedby="landing-search-help"
              />
            </label>
            <p id="landing-search-help" className="field-hint">
              Puedes escribir el nombre de tu doctor, tu ciudad o una especialidad.
            </p>
            <button className="action-button" type="submit">
              Buscar medico
            </button>
          </form>
        </div>

        <aside className="landing-appointment-preview" aria-label="Vista previa de agenda publica">
          <div className="preview-topline">
            <span>Agenda publica</span>
            <strong>Hoy</strong>
          </div>
          <div className="preview-slot">
            <span>Consulta general</span>
            <strong>09:30</strong>
          </div>
          <div className="preview-slot">
            <span>Seguimiento</span>
            <strong>11:00</strong>
          </div>
          <div className="preview-slot">
            <span>Odontologia</span>
            <strong>16:30</strong>
          </div>
        </aside>
      </section>

      <section className="landing-info-grid" aria-label="Como funciona MiDoc">
        <article>
          <h2>Para pacientes</h2>
          <p>Encuentra el perfil de tu medico, revisa servicios y agenda desde el navegador.</p>
        </article>
        <article>
          <h2>Para medicos</h2>
          <p>
            Publica perfil, servicios y horarios para que tus pacientes puedan reservar sin
            llamadas de ida y vuelta.
          </p>
          <Link href="/medico/registro">Crear cuenta medica</Link>
        </article>
        <article>
          <h2>Privacidad local-first</h2>
          <p>La nube opera agenda y notificaciones. El expediente clinico vive cifrado en la app del medico.</p>
        </article>
      </section>
    </section>
  );
}
