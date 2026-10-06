import { useEffect, useRef, useState } from "react";
import { call } from "./ipc";
import { KIND_LABELS, groupHits, highlight, type SearchResults } from "./searchModel";

const dateFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" });

/**
 * Busqueda en todos los expedientes (paso 28, rebanada 3): notas, diagnosticos
 * CIE-10, recetas y documentos. Todo corre local sobre la base cifrada.
 */
export function RecordSearch({
  query,
  onQueryChange,
  onOpenEncounter,
  onOpenPatient
}: {
  /** Vive en el Workspace para sobrevivir a abrir y cerrar una consulta. */
  query: string;
  onQueryChange: (query: string) => void;
  onOpenEncounter: (encounterId: string) => void;
  onOpenPatient: (patientId: string) => void;
}) {
  const [results, setResults] = useState<SearchResults | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestRef = useRef(0);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults(null);
      setBusy(false);
      return;
    }
    const request = ++requestRef.current;
    setBusy(true);
    const handle = setTimeout(() => {
      call<SearchResults>("search_records", { query: term, patientId: null })
        .then((found) => {
          if (request !== requestRef.current) return;
          setResults(found);
          setError("");
        })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
        .finally(() => {
          if (request === requestRef.current) setBusy(false);
        });
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  const groups = results ? groupHits(results.hits) : [];
  const terms = results ? [query, ...results.expanded_terms] : [query];

  return (
    <section className="panel record-search">
      <div className="page-heading">
        <div>
          <h1>Busqueda</h1>
          <p>Notas, diagnosticos CIE-10, recetas y documentos de todos tus pacientes.</p>
        </div>
      </div>

      <input
        className="record-search-input"
        type="search"
        autoFocus
        aria-label="Buscar en los expedientes"
        placeholder="Diagnostico, clave CIE-10, medicamento o texto de la nota (ej. J45, paracetamol, sibilancias)"
        value={query}
        onChange={(event) => onQueryChange(event.currentTarget.value)}
      />

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {results ? (
        <p className="meta record-search-summary" role="status">
          {busy
            ? "Buscando…"
            : results.hits.length === 0
              ? "Sin resultados."
              : `${results.hits.length}${results.truncated ? "+" : ""} coincidencias en ${groups.length} ${
                  groups.length === 1 ? "paciente" : "pacientes"
                }.`}
          {results.expanded_terms.length > 0
            ? ` Tambien se buscaron nombres con el mismo ingrediente: ${results.expanded_terms.join(", ")}.`
            : ""}
          {results.truncated ? " Se muestran las primeras 100; afina la busqueda." : ""}
        </p>
      ) : (
        <p className="meta record-search-summary">Escribe al menos dos caracteres.</p>
      )}

      {groups.map((patient) => (
        <article className="record-search-patient" key={patient.patientId}>
          <header className="record-search-patient-header">
            <strong>{patient.patientName}</strong>
            <button className="ghost-button" type="button" onClick={() => onOpenPatient(patient.patientId)}>
              Expediente
            </button>
          </header>
          {patient.encounters.map((encounter) => (
            <div className="record-search-encounter" key={encounter.encounterId ?? "sin-consulta"}>
              <div className="record-search-encounter-header">
                <span className="sidebar-heading">
                  {encounter.encounterId
                    ? `Consulta del ${encounter.openedAt ? dateFormatter.format(new Date(encounter.openedAt)) : "—"}${
                        encounter.status === "SIGNED" ? " · firmada" : ""
                      }`
                    : "Sin consulta"}
                </span>
                {encounter.encounterId ? (
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => onOpenEncounter(encounter.encounterId as string)}
                  >
                    Abrir consulta
                  </button>
                ) : null}
              </div>
              <ul className="record-search-hits">
                {encounter.hits.map((hit, index) => (
                  <li key={`${hit.kind}-${hit.field}-${hit.document_id ?? index}`} className="record-search-hit">
                    <span className={`record-search-kind record-search-kind-${hit.kind.toLowerCase()}`}>
                      {KIND_LABELS[hit.kind]}
                    </span>
                    <span className="record-search-field">{hit.field}</span>
                    <span className="record-search-snippet">
                      {highlight(hit.snippet, terms).map((segment, i) =>
                        segment.match ? <mark key={i}>{segment.text}</mark> : <span key={i}>{segment.text}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </article>
      ))}
    </section>
  );
}
