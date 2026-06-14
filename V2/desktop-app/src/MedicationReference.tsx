import { useEffect, useState } from "react";
import { call } from "./ipc";

/**
 * Gestion de la base de referencia de medicamentos (paso 14, rebanada 2). El
 * medico importa datos reales y publicos: un CSV de medicamentos/clases
 * (derivable de RxNorm/RxClass) y el CSV de interacciones de DDInter. La base es
 * REFERENCIA publica (no PHI) y vive en el equipo; nada sale a la nube.
 */

interface ReferenceStatus {
  version: string;
  medications: number;
  interactions: number;
  labels: number;
}

interface ImportSummary {
  medications: number;
  interactions: number;
  labels: number;
  version: string;
}

export function MedicationReference() {
  const [status, setStatus] = useState<ReferenceStatus | null>(null);
  const [medicationsCsv, setMedicationsCsv] = useState("");
  const [ddinterCsv, setDdinterCsv] = useState("");
  const [version, setVersion] = useState("");
  const [openfdaJson, setOpenfdaJson] = useState("");
  const [medicationsUrl, setMedicationsUrl] = useState("");
  const [ddinterUrl, setDdinterUrl] = useState("");
  const [openfdaUrl, setOpenfdaUrl] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  async function refresh() {
    try {
      setStatus(await call<ReferenceStatus>("medication_reference_status"));
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function updateFromSources() {
    const updateVersion = version.trim() || `oficial-${today}`;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const summary = await call<ImportSummary>("update_medication_reference", {
        medicationsUrl,
        ddinterUrl,
        openfdaUrl,
        version: updateVersion
      });
      setMessage(
        `Base actualizada desde fuentes: ${summary.medications} medicamentos, ${summary.interactions} interacciones y ${summary.labels} etiquetas (version ${summary.version}).`
      );
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function importData() {
    if (version.trim().length === 0) {
      setError("Indica una version para la base importada (ej. ddinter-2026-06).");
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const summary = await call<ImportSummary>("import_medication_reference", {
        medicationsCsv,
        ddinterCsv,
        openfdaJson,
        version
      });
      setMessage(
        `Importados ${summary.medications} medicamentos, ${summary.interactions} interacciones y ${summary.labels} etiquetas (version ${summary.version}).`
      );
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Base de medicamentos</h2>
        <p>
          Datos de referencia publicos para la verificacion de seguridad (sin IA). Importa un CSV de
          medicamentos/clases y el CSV de interacciones de DDInter. La base vive cifrada en este
          equipo.
        </p>
      </div>

      {status && (
        <p className="meta">
          Base actual: <strong>{status.version}</strong> · {status.medications} medicamentos ·{" "}
          {status.interactions} interacciones · {status.labels} etiquetas (openFDA).
        </p>
      )}
      {message && (
        <p className="form-success" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="stack">
        <label className="field">
          <span>CSV de medicamentos (name,ingredient,display_name,drug_class)</span>
          <textarea
            rows={4}
            placeholder={"name,ingredient,display_name,drug_class\nmetoprolol,metoprolol,Metoprolol,Betabloqueador"}
            value={medicationsCsv}
            disabled={busy}
            onChange={(e) => setMedicationsCsv(e.target.value)}
          />
        </label>
        <label className="field">
          <span>CSV de interacciones DDInter (DDInterID_A,Drug_A,DDInterID_B,Drug_B,Level)</span>
          <textarea
            rows={4}
            placeholder={"DDInterID_A,Drug_A,DDInterID_B,Drug_B,Level\nDDInter1,Warfarina,DDInter2,Aspirina,Major"}
            value={ddinterCsv}
            disabled={busy}
            onChange={(e) => setDdinterCsv(e.target.value)}
          />
        </label>
        <label className="field">
          <span>JSON de etiquetas openFDA (opcional, respaldo de interacciones)</span>
          <textarea
            rows={3}
            placeholder={'{"results":[{"openfda":{"generic_name":["Paracetamol"]},"drug_interactions":["…"]}]}'}
            value={openfdaJson}
            disabled={busy}
            onChange={(e) => setOpenfdaJson(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Version de esta base</span>
          <input
            type="text"
            placeholder="ddinter-2026-06"
            value={version}
            disabled={busy}
            onChange={(e) => setVersion(e.target.value)}
          />
        </label>
        <div className="button-row">
          <button className="action-button" onClick={() => void importData()} disabled={busy}>
            {busy ? "Importando…" : "Importar base"}
          </button>
        </div>
        <p className="meta">
          Una lista vacia deja esa tabla sin cambios. Importar reemplaza la base anterior.
        </p>
      </div>

      <div className="panel-header" style={{ marginTop: 24 }}>
        <h3>Actualizar desde fuentes oficiales</h3>
        <p>
          Descarga los datos publicos (CSV de medicamentos/clases y CSV de DDInter) y reemplaza la
          base local. Solo se descargan datos de referencia: no se envia ningun dato del paciente.
          La descarga se valida antes de reemplazar (rechaza datos vacios o incompletos).
        </p>
      </div>
      <div className="stack">
        <label className="field">
          <span>URL del CSV de medicamentos</span>
          <input
            type="url"
            placeholder="https://…/medicamentos.csv"
            value={medicationsUrl}
            disabled={busy}
            onChange={(e) => setMedicationsUrl(e.target.value)}
          />
        </label>
        <label className="field">
          <span>URL del CSV de interacciones (DDInter)</span>
          <input
            type="url"
            placeholder="https://…/ddinter.csv"
            value={ddinterUrl}
            disabled={busy}
            onChange={(e) => setDdinterUrl(e.target.value)}
          />
        </label>
        <label className="field">
          <span>URL del JSON de etiquetas (openFDA, opcional)</span>
          <input
            type="url"
            placeholder="https://…/openfda.json"
            value={openfdaUrl}
            disabled={busy}
            onChange={(e) => setOpenfdaUrl(e.target.value)}
          />
        </label>
        <div className="button-row">
          <button
            className="action-button"
            onClick={() => void updateFromSources()}
            disabled={
              busy ||
              (medicationsUrl.trim().length === 0 &&
                ddinterUrl.trim().length === 0 &&
                openfdaUrl.trim().length === 0)
            }
          >
            {busy ? "Actualizando…" : "Actualizar base"}
          </button>
        </div>
        <p className="meta">Se usa la version indicada arriba, o `oficial-{today}` si la dejas vacia.</p>
      </div>
    </section>
  );
}
