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
}

interface ImportSummary {
  medications: number;
  interactions: number;
  version: string;
}

export function MedicationReference() {
  const [status, setStatus] = useState<ReferenceStatus | null>(null);
  const [medicationsCsv, setMedicationsCsv] = useState("");
  const [ddinterCsv, setDdinterCsv] = useState("");
  const [version, setVersion] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
        version
      });
      setMessage(
        `Importados ${summary.medications} medicamentos y ${summary.interactions} interacciones (version ${summary.version}).`
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
          {status.interactions} interacciones.
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
    </section>
  );
}
