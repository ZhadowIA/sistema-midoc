import { useCallback, useEffect, useState } from "react";
import { call } from "./ipc";

/**
 * Datos del consultorio que encabezan el recibo y nivel de detalle del
 * concepto (paso 27, rebanada 1).
 *
 * El nivel decide cuanto sale del expediente hacia el papel que se lleva el
 * paciente, asi que se explica en la pantalla en vez de esconderse en un
 * selector mudo. Vive aqui mientras Recepcion es su unica pantalla; cuando
 * exista el destino Configuracion pasa a ser una seccion suya.
 */

export interface ClinicSettings {
  name: string | null;
  address: string | null;
  phone: string | null;
  license: string | null;
  receipt_detail: string;
}

const DETAIL_OPTIONS: Array<{ value: string; label: string; note: string }> = [
  {
    value: "DETAILED",
    label: "Detallado",
    note: "El recibo nombra el tratamiento. Es lo normal en odontología, donde el paciente espera ver qué se le cobró."
  },
  {
    value: "GENERIC",
    label: "Genérico",
    note: "El recibo dice “Consulta médica” o “Tratamiento dental”. El monto cuadra sin que el papel revele el procedimiento."
  },
  {
    value: "AMOUNT_ONLY",
    label: "Solo monto",
    note: "El recibo no lleva concepto. Útil cuando el paciente comparte domicilio o el motivo es sensible."
  }
];

export function AjustesRecibo() {
  const [settings, setSettings] = useState<ClinicSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setSettings(await call<ClinicSettings>("get_clinic_settings"));
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!settings) {
    return null;
  }

  const patch = (next: Partial<ClinicSettings>) => {
    setSettings({ ...settings, ...next });
    setMessage("");
  };

  async function save() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await call("save_clinic_settings", { settings });
      setMessage("Ajustes del recibo guardados.");
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  const selected = DETAIL_OPTIONS.find((option) => option.value === settings.receipt_detail);

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Recibos</h2>
        <p>Datos que encabezan el recibo y cuánto dice del tratamiento.</p>
      </div>

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

      <div className="receipt-settings-grid">
        <label className="field">
          <span>Nombre del consultorio</span>
          <input
            value={settings.name ?? ""}
            onChange={(e) => patch({ name: e.currentTarget.value })}
          />
        </label>
        <label className="field">
          <span>Cédula profesional</span>
          <input
            value={settings.license ?? ""}
            onChange={(e) => patch({ license: e.currentTarget.value })}
          />
        </label>
        <label className="field">
          <span>Dirección</span>
          <input
            value={settings.address ?? ""}
            onChange={(e) => patch({ address: e.currentTarget.value })}
          />
        </label>
        <label className="field">
          <span>Teléfono</span>
          <input
            value={settings.phone ?? ""}
            onChange={(e) => patch({ phone: e.currentTarget.value })}
          />
        </label>
      </div>

      <label className="field">
        <span>Qué dice el recibo del tratamiento</span>
        <select
          value={settings.receipt_detail}
          onChange={(e) => patch({ receipt_detail: e.currentTarget.value })}
        >
          {DETAIL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {selected ? <p className="receipt-detail-note">{selected.note}</p> : null}

      <div className="button-row">
        <button className="action-button" onClick={() => void save()} disabled={saving}>
          {saving ? "Guardando…" : "Guardar ajustes"}
        </button>
      </div>
    </section>
  );
}
