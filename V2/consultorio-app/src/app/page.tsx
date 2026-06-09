export default function HomePage() {
  return (
    <section className="home-shell">
      <div className="app-hero">
        <span className="eyebrow">MiDoc V2</span>
        <h1 className="app-title">Consultorio digital listo para agenda, perfil y expediente.</h1>
        <p className="app-lead">
          La base tecnica ya soporta autenticacion, legal, suscripcion inicial, perfil publico,
          servicios y disponibilidad para medicina general u odontologia.
        </p>
        <div className="app-chip-row">
          <span className="app-chip">Paso 1 cerrado: identidad y legal</span>
          <span className="app-chip">Paso 2 abierto: perfil y horarios</span>
          <span className="app-chip">Canal de notificacion: SMS</span>
        </div>
      </div>

      <div className="app-grid">
        <article className="app-card">
          <strong>Auth</strong>
          <span>Registro, login, logout, recuperacion y sesiones trazables.</span>
        </article>
        <article className="app-card">
          <strong>Perfil medico</strong>
          <span>Slug publico, especialidad, descripcion, servicios y duracion base.</span>
        </article>
        <article className="app-card">
          <strong>Disponibilidad</strong>
          <span>Horarios semanales, excepciones y bloqueos futuros.</span>
        </article>
      </div>

      <article className="cta-card">
        <h2>Ruta publica lista para pruebas</h2>
        <p>
          Cuando un medico publique su perfil, podras verlo en una URL como esta:
        </p>
        <code>/perfil/dr-admin-consultorio</code>
      </article>
    </section>
  );
}
