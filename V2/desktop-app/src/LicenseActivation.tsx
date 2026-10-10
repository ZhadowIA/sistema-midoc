// Activacion de MiDoc en este equipo (paso 29). Se activa una vez vinculando la
// cuenta; despues la licencia se verifica sin red y la app funciona aunque no
// se vuelva a vincular. Vincular sigue sirviendo para sincronizar, creditos de
// IA y actualizaciones.

import { useState } from "react";
import { call } from "./ipc";
import { activationReason, type LicenseStatus } from "./licenseState";

interface LinkOutcome {
  license_error: string | null;
}

export function LinkAccountForm({
  portalUrl,
  licensed,
  onLinked
}: {
  portalUrl: string;
  /** Ya hay licencia: vincular es para sincronizar y usar creditos, no para activar. */
  licensed: boolean;
  onLinked: (licenseError: string | null) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function link() {
    setBusy(true);
    setError("");
    try {
      const outcome = await call<LinkOutcome>("link_account", { serverUrl: portalUrl, email, password });
      setPassword("");
      onLinked(outcome?.license_error ?? null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="link-account-form">
      <div className="panel-header">
        <h2>{licensed ? "Vincula tu cuenta MiDoc" : "Activa MiDoc en este equipo"}</h2>
        <p>
          {licensed
            ? "Vincular sincroniza tu cuenta y habilita los créditos de IA y las actualizaciones. Tu licencia ya está en este equipo."
            : "Se activa una sola vez con tu cuenta MiDoc. Después funciona sin conexión, aunque no vuelvas a vincular."}{" "}
          Tu expediente se queda cifrado en este equipo y la contraseña no se guarda.
        </p>
      </div>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void link();
        }}
      >
        <label className="field">
          <span>Correo de tu cuenta</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            autoComplete="email"
            required
          />
        </label>
        <label className="field">
          <span>Contraseña</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="button-row">
          <button className="action-button" type="submit" disabled={busy}>
            {busy ? "Vinculando…" : licensed ? "Vincular cuenta" : "Activar este equipo"}
          </button>
        </div>
      </form>
    </section>
  );
}

/** Vinculada pero sin licencia valida: explica por que y deja reintentar. */
export function PendingActivation({
  license,
  lastError,
  busy,
  onActivate
}: {
  license: LicenseStatus | null;
  lastError: string;
  busy: boolean;
  onActivate: () => void;
}) {
  return (
    <section className="link-account-form">
      <div className="panel-header">
        <h2>Falta activar este equipo</h2>
        <p>{activationReason(license, lastError)}</p>
      </div>
      <div className="button-row">
        <button className="action-button" type="button" disabled={busy} onClick={onActivate}>
          {busy ? "Activando…" : "Activar este equipo"}
        </button>
      </div>
      <p className="meta">Si vinculaste otra cuenta, desvincula y vuelve a vincular.</p>
    </section>
  );
}
