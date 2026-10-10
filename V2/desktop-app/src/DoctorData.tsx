import { useCallback, useEffect, useState } from "react";

import {
  isDirty,
  PRESCRIBER_FIELDS,
  toDraft,
  toInput,
  validateDraft,
  type Prescriber,
  type PrescriberDraft,
  type PrescriberSave,
  type PrescriberView
} from "./doctorDataModel";
import { call } from "./ipc";

// Mis datos: lo que exige la receta. Regla 4.6: se edita aqui o en la web; el
// portal manda. Sin vincular o sin conexion se consultan, pero no se editan.
export function DoctorData() {
  const [view, setView] = useState<PrescriberView | null>(null);
  const [draft, setDraft] = useState<PrescriberDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const show = useCallback((prescriber: Prescriber, linked: boolean) => {
    setView({ linked, prescriber });
    setDraft(toDraft(prescriber));
  }, []);

  useEffect(() => {
    call<PrescriberView>("get_prescriber")
      .then((loaded) => {
        setView(loaded);
        setDraft(loaded.prescriber ? toDraft(loaded.prescriber) : null);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const saved = view?.prescriber ?? null;
  const editable = Boolean(view?.linked && saved && draft);
  const problems = draft ? validateDraft(draft) : [];
  const dirty = Boolean(draft && saved && isDirty(draft, saved));

  async function save() {
    if (!draft || !saved || problems.length > 0) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const outcome = await call<PrescriberSave>("save_prescriber", { input: toInput(draft, saved.updatedAt) });
      if (outcome.kind === "saved") {
        show(outcome.prescriber, true);
        setMessage("Datos guardados en tu cuenta. Las próximas recetas ya los llevan.");
      } else {
        // El portal manda: se muestra lo vigente para volver a capturar encima.
        show(outcome.current, true);
        setError(`${outcome.message} Ya se cargó la versión actual.`);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="content">
      <section className="panel">
        <div className="panel-header">
          <h2>Mis datos</h2>
          <p>
            Los pide el Reglamento de Insumos para la Salud y salen impresos en cada receta. Se guardan en tu
            cuenta: también puedes editarlos desde el portal.
          </p>
        </div>

        {view && !saved ? (
          <p className="form-error" role="alert">
            {view.linked
              ? "Sincroniza para traer tus datos desde tu cuenta."
              : "Vincula tu cuenta para traer y editar tus datos."}
          </p>
        ) : null}
        {view && saved && !view.linked ? (
          <p className="meta">Esta copia se usa para imprimir. Vincula tu cuenta para editarla.</p>
        ) : null}

        {draft ? (
          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            {PRESCRIBER_FIELDS.map(({ key, label, hint, full }) => (
              <label className={full ? "field field-full" : "field"} key={key}>
                <span>{label}</span>
                <input
                  value={draft[key]}
                  disabled={!editable || busy}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setDraft((current) => (current ? { ...current, [key]: value } : current));
                  }}
                />
                {hint ? <span className="field-hint">{hint}</span> : null}
              </label>
            ))}
            {dirty && problems.length > 0 ? (
              <p className="form-error field-full" role="alert">
                {problems.join(" ")}
              </p>
            ) : null}
            {message ? (
              <p className="form-success field-full" role="status">
                {message}
              </p>
            ) : null}
            {error ? (
              <p className="form-error field-full" role="alert">
                {error}
              </p>
            ) : null}
            {editable ? (
              <div className="button-row field-full">
                <button className="action-button" type="submit" disabled={busy || !dirty || problems.length > 0}>
                  {busy ? "Guardando…" : "Guardar datos"}
                </button>
              </div>
            ) : null}
          </form>
        ) : error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  );
}
