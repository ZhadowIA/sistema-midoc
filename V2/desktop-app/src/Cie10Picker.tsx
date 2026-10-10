import { useEffect, useId, useRef, useState } from "react";
import { call } from "./ipc";
import {
  MAX_CODED_DIAGNOSES,
  addDiagnosis,
  displayCode,
  nextActiveIndex,
  removeDiagnosis,
  setPrincipal,
  type Cie10Match,
  type CodedDiagnosis
} from "./cie10Model";

interface CatalogInfo {
  version: string;
  source: { name: string; license: string };
}

/**
 * Selector de diagnosticos CIE-10 (paso 28, rebanada 2). Busca por clave o por
 * palabras del nombre en el catalogo oficial empaquetado; los avisos de sexo,
 * edad y consulta externa vienen del catalogo y no bloquean.
 */
export function Cie10Picker({
  value,
  onChange,
  patientId,
  disabled
}: {
  value: CodedDiagnosis[];
  onChange: (next: CodedDiagnosis[]) => void;
  patientId: string;
  disabled: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Cie10Match[]>([]);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [catalog, setCatalog] = useState<CatalogInfo | null>(null);
  const listId = useId();
  const requestRef = useRef(0);

  useEffect(() => {
    call<CatalogInfo>("cie10_catalog_info")
      .then(setCatalog)
      .catch(() => setCatalog(null));
  }, []);

  // Busqueda con pausa corta; solo la respuesta mas reciente se pinta.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setActive(-1);
      return;
    }
    const request = ++requestRef.current;
    const handle = setTimeout(() => {
      call<Cie10Match[]>("cie10_search", { query: term, patientId })
        .then((found) => {
          if (request !== requestRef.current) return;
          setResults(found);
          setActive(found.length > 0 ? 0 : -1);
          setError("");
        })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    }, 150);
    return () => clearTimeout(handle);
  }, [query, patientId]);

  function choose(match: Cie10Match) {
    onChange(addDiagnosis(value, match));
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  const full = value.length >= MAX_CODED_DIAGNOSES;
  const showList = open && results.length > 0;

  return (
    <div className="cie10-picker">
      {value.length > 0 ? (
        <ul className="cie10-selected" aria-label="Diagnosticos codificados">
          {value.map((diagnosis) => (
            <li key={diagnosis.code} className="cie10-chip">
              <span className="cie10-code">{displayCode(diagnosis.code)}</span>
              <span className="cie10-chip-name">{diagnosis.name}</span>
              {diagnosis.principal ? (
                <span className="pill pill-primary">Principal</span>
              ) : !disabled ? (
                <button
                  type="button"
                  className="cie10-chip-action"
                  onClick={() => onChange(setPrincipal(value, diagnosis.code))}
                >
                  Hacer principal
                </button>
              ) : null}
              {!disabled ? (
                <button
                  type="button"
                  className="cie10-chip-action"
                  aria-label={`Quitar ${displayCode(diagnosis.code)}`}
                  onClick={() => onChange(removeDiagnosis(value, diagnosis.code))}
                >
                  Quitar
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {!disabled ? (
        <div className="cie10-search">
          <input
            type="search"
            role="combobox"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
            aria-label="Buscar diagnostico CIE-10"
            placeholder={full ? "Maximo de diagnosticos alcanzado" : "Buscar CIE-10 por clave o nombre (ej. J45.9, lumbago)"}
            value={query}
            disabled={full}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setOpen(true);
                setActive((current) => nextActiveIndex(current, results.length, event.key as "ArrowDown" | "ArrowUp"));
              } else if (event.key === "Enter" && showList && active >= 0) {
                event.preventDefault();
                choose(results[active]);
              } else if (event.key === "Escape") {
                setOpen(false);
              }
            }}
          />
          {showList ? (
            <ul className="cie10-results" id={listId} role="listbox">
              {results.map((match, index) => (
                <li
                  key={match.code}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  className={index === active ? "cie10-result cie10-result-active" : "cie10-result"}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choose(match);
                  }}
                  onMouseEnter={() => setActive(index)}
                >
                  <span className="cie10-code">{match.display_code}</span>
                  <span className="cie10-result-text">
                    <span>{match.name}</span>
                    {match.warnings.map((warning) => (
                      <small key={warning} className="cie10-warning">
                        {warning}
                      </small>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          ) : open && query.trim().length >= 2 && results.length === 0 && !error ? (
            <p className="cie10-empty meta">Sin coincidencias en el catalogo.</p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {catalog ? (
        <p className="cie10-attribution">
          {catalog.source.name} · {catalog.source.license}
        </p>
      ) : null}
    </div>
  );
}
