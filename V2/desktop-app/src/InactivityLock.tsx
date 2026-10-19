import { useState } from "react";

import { call } from "./ipc";

interface Props {
  profileId: string;
  profileName: string;
  minutes: number;
  /** La frase fue correcta y la base esta abierta de nuevo. */
  onUnlocked: () => void;
  /** Volver a la eleccion de perfil, descartando lo que hubiera en pantalla. */
  onExit: () => void;
}

/**
 * Capa que cubre la app tras el bloqueo por inactividad. La base cifrada ya se
 * cerro; la interfaz conserva su estado detras (lo escrito y no guardado), asi
 * que al poner la frase el medico sigue donde estaba. Es opaca: no deja ver el
 * expediente.
 */
export function InactivityLock({ profileId, profileName, minutes, onUnlocked, onExit }: Props) {
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function unlock() {
    setBusy(true);
    setError("");
    try {
      await call("unlock_database", { profileId, passphrase });
      setPassphrase("");
      onUnlocked();
    } catch {
      setError("La frase de seguridad no es correcta.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell inactivity-lock" role="dialog" aria-modal="true" aria-labelledby="inactivity-lock-title">
      <article className="auth-card auth-card-narrow">
        <header>
          <span className="brand-mark">MiDoc</span>
          <h1 id="inactivity-lock-title">Expediente bloqueado</h1>
          <p>
            Pasaron {minutes} minutos sin actividad y MiDoc cerro la base cifrada de {profileName}. Escribe tu frase
            de seguridad para seguir donde te quedaste.
          </p>
        </header>
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            void unlock();
          }}
        >
          <label className="field">
            <span>Frase de seguridad</span>
            <input
              type="password"
              autoFocus
              autoComplete="current-password"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
            />
          </label>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="button-row">
            <button className="action-button" type="submit" disabled={busy || passphrase.length === 0}>
              {busy ? "Abriendo…" : "Desbloquear"}
            </button>
            <button className="ghost-button" type="button" onClick={onExit} disabled={busy}>
              Cambiar de perfil
            </button>
          </div>
        </form>
      </article>
    </div>
  );
}
