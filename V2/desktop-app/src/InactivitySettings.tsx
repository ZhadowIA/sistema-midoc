import { useState } from "react";

import { INACTIVITY_LOCK_CHOICES, inactivityLabel } from "./inactivity";
import { call } from "./ipc";

interface Props {
  minutes: number | null;
  onChange: (minutes: number) => void;
}

/** Tiempo sin actividad antes de cerrar la base cifrada; se guarda por perfil. */
export function InactivitySettings({ minutes, onChange }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function choose(next: number) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await call("set_inactivity_lock_minutes", { minutes: next });
      onChange(next);
      setMessage(next === 0 ? "Bloqueo por inactividad desactivado." : `Se bloqueara tras ${inactivityLabel(next)} sin actividad.`);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Seguridad</h2>
        <p>
          Si dejas la computadora sin usar, MiDoc cierra tu expediente cifrado y pide tu frase de seguridad para
          volver. Lo que tengas en pantalla se conserva. Mientras grabas una consulta no se bloquea.
        </p>
      </div>
      <label className="field">
        <span>Bloquear tras</span>
        <select
          value={minutes ?? ""}
          disabled={busy || minutes === null}
          onChange={(event) => void choose(Number(event.target.value))}
        >
          {INACTIVITY_LOCK_CHOICES.map((choice) => (
            <option key={choice} value={choice}>
              {choice === 0 ? "No bloquear (desactivado)" : inactivityLabel(choice)}
            </option>
          ))}
        </select>
      </label>
      {minutes === 0 ? (
        <p className="meta">Sin bloqueo, cualquiera con acceso a esta computadora puede ver tus expedientes.</p>
      ) : null}
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
    </section>
  );
}
