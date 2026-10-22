import { useEffect, useState } from "react";
import { call } from "./ipc";
import type { IngredientOption, LocalBrand, UnknownMedication } from "./brandsModel";
import { brandSummary } from "./brandsModel";

/**
 * Marcas que la app no conoce (paso 33, etapa 3). Si una linea de la receta
 * escribe una dosis pero no nombra ningun medicamento conocido, se le pregunta
 * al medico una vez que contiene; la respuesta se guarda solo en esta
 * computadora. No usa IA y la receta no sale del equipo.
 */
export function UnknownMedications({ prescription, disabled }: { prescription: string; disabled: boolean }) {
  const [unknown, setUnknown] = useState<UnknownMedication[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<IngredientOption[]>([]);
  const [chosen, setChosen] = useState<IngredientOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);

  // Detecta al dejar de escribir; si falla, simplemente no pregunta.
  useEffect(() => {
    if (disabled || !prescription.trim()) {
      setUnknown([]);
      return;
    }
    const timer = setTimeout(() => {
      call<UnknownMedication[]>("detect_unknown_medications", { prescription })
        .then(setUnknown)
        .catch(() => setUnknown([]));
    }, 700);
    return () => clearTimeout(timer);
  }, [prescription, disabled, refresh]);

  useEffect(() => {
    if (editing === null || query.trim().length < 2) {
      setOptions([]);
      return;
    }
    const timer = setTimeout(() => {
      call<IngredientOption[]>("search_ingredients", { query })
        .then(setOptions)
        .catch(() => setOptions([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [query, editing]);

  function open(item: UnknownMedication) {
    setEditing(item.candidate);
    setName(item.candidate);
    setQuery("");
    setChosen([]);
    setError("");
    setMessage("");
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      const saved = await call<LocalBrand>("save_local_brand", {
        display: name,
        ingredientIds: chosen.map((option) => option.id)
      });
      setMessage(`Guardado en esta computadora: ${brandSummary(saved)}.`);
      setEditing(null);
      setRefresh((n) => n + 1);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (unknown.length === 0 && !message) return null;

  return (
    <section className="panel-plain">
      <h3>Medicamentos que no reconozco</h3>
      <p className="meta">
        Dime una vez qué principios activos contiene cada uno y lo reconoceré en tus recetas. Se guarda solo en esta
        computadora.
      </p>
      <div className="stack">
        {unknown.map((item) => (
          <div key={item.candidate} className="stack">
            <div className="button-row">
              <span>
                <strong>{item.candidate}</strong> <span className="meta">— {item.line}</span>
              </span>
              {editing !== item.candidate ? (
                <button className="ghost-button" onClick={() => open(item)} disabled={busy || disabled}>
                  ¿Qué contiene?
                </button>
              ) : null}
            </div>
            {editing === item.candidate ? (
              <div className="stack">
                <label className="field">
                  <span>Marca</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
                </label>
                <label className="field">
                  <span>Buscar principio activo</span>
                  <input
                    value={query}
                    placeholder="p. ej. loratadina"
                    onChange={(e) => setQuery(e.target.value)}
                    disabled={busy}
                  />
                </label>
                {options.length > 0 ? (
                  <div className="button-row">
                    {options
                      .filter((option) => !chosen.some((c) => c.id === option.id))
                      .map((option) => (
                        <button
                          key={option.id}
                          className="ghost-button"
                          onClick={() => {
                            setChosen((list) => [...list, option]);
                            setQuery("");
                          }}
                          disabled={busy}
                        >
                          + {option.display}
                        </button>
                      ))}
                  </div>
                ) : null}
                {chosen.length > 0 ? (
                  <div className="button-row">
                    {chosen.map((option) => (
                      <button
                        key={option.id}
                        className="tab"
                        title="Quitar"
                        onClick={() => setChosen((list) => list.filter((c) => c.id !== option.id))}
                        disabled={busy}
                      >
                        {option.display} ×
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="button-row">
                  <button
                    className="action-button"
                    onClick={() => void save()}
                    disabled={busy || chosen.length === 0 || !name.trim()}
                  >
                    {busy ? "Guardando…" : "Guardar"}
                  </button>
                  <button className="ghost-button" onClick={() => setEditing(null)} disabled={busy}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ))}
        {message ? (
          <p className="form-success" role="status">
            {message}
          </p>
        ) : null}
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
