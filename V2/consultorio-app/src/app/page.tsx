import Link from "next/link";
import { connection } from "next/server";

import { isFrozenScopeEnabled } from "../lib/scope";

// Inicio tras el reenfoque: el portal ya no es del paciente, es la puerta de la
// cuenta del medico. La version de busqueda y agenda vuelve con el alcance congelado.
function DoctorHomePage() {
  return (
    <section className="landing-page">
      <header className="landing-nav">
        <Link href="/" className="brand-mark">MiDoc</Link>
        <nav aria-label="Navegacion principal">
          <Link href="/medico/login">Iniciar sesion</Link>
          <Link href="/medico/registro" className="ghost-button">
            Crear cuenta
          </Link>
        </nav>
      </header>

      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-copy">
          <p className="section-kicker">Expediente clinico con IA</p>
          <h1 id="landing-title">Documenta la consulta mientras atiendes</h1>
          <p>
            MiDoc es una app de escritorio para el medico: expediente cifrado en tu computadora,
            nota SOAP, receta y odontograma, con transcripcion y asistencia de IA que tu revisas
            antes de guardar.
          </p>
          <div className="button-row">
            <Link href="/medico/registro" className="action-button">
              Crear cuenta medica
            </Link>
            <Link href="/medico/login" className="ghost-button">
              Ya tengo cuenta
            </Link>
          </div>
        </div>

        <aside className="landing-appointment-preview" aria-label="Lo que hace la app">
          <div className="preview-topline">
            <span>En la consulta</span>
            <strong>Local</strong>
          </div>
          <div className="preview-slot">
            <span>Transcripcion y escriba</span>
            <strong>IA</strong>
          </div>
          <div className="preview-slot">
            <span>Nota SOAP y receta</span>
            <strong>Firma</strong>
          </div>
          <div className="preview-slot">
            <span>Odontograma por dictado</span>
            <strong>Dental</strong>
          </div>
        </aside>
      </section>

      <section className="landing-info-grid" aria-label="Como funciona MiDoc">
        <article>
          <h2>Expediente longitudinal</h2>
          <p>Antecedentes, consultas, recetas y documentos de cada paciente en una sola linea del tiempo.</p>
        </article>
        <article>
          <h2>IA que propone, tu decides</h2>
          <p>
            La transcripcion y el escriba acomodan la conversacion en tu plantilla; nada se guarda
            sin tu revision.
          </p>
        </article>
        <article>
          <h2>Privacidad local-first</h2>
          <p>El expediente vive cifrado en tu computadora. La nube solo guarda tu cuenta y tu suscripcion.</p>
        </article>
      </section>
    </section>
  );
}

export default async function HomePage() {
  // La bandera llega con el entorno al arrancar (imagen standalone), no al
  // compilar: esta pagina no se prerenderiza.
  await connection();

  if (!isFrozenScopeEnabled()) {
    return <DoctorHomePage />;
  }

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
