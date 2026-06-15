export default function SearchLoading() {
  return (
    <section className="search-page">
      <header className="search-page-header">
        <span className="brand-mark">MiDoc</span>
      </header>
      <section className="search-panel">
        <div className="skeleton-row" />
        <div className="skeleton-row" />
      </section>
      <section className="search-results-section" aria-label="Cargando resultados">
        <div className="skeleton-row" />
        <div className="skeleton-row" />
        <div className="skeleton-row" />
      </section>
    </section>
  );
}
