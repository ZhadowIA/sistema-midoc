"use client";

import { useState } from "react";
import type { ClinicalProfile, SubscriptionStatus, UserStatus } from "@prisma/client";

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  TRIAL: "Periodo de prueba",
  ACTIVE: "Activa",
  PAST_DUE: "Pago pendiente",
  CANCELLED: "Cancelada",
  PAUSED: "En pausa"
};

const dateFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "long" });

export function CuentaClient({
  account,
  subscription
}: {
  account: {
    email: string;
    emailVerified: boolean;
    status: UserStatus;
    professionalName: string;
    licenseNumber: string | null;
    clinicalProfile: ClinicalProfile;
  };
  subscription: {
    status: SubscriptionStatus | null;
    planName: string | null;
    entitled: boolean;
    renewsAt: string | null;
  };
}) {
  const [clinicalProfile, setClinicalProfile] = useState(account.clinicalProfile);
  const [savedProfile, setSavedProfile] = useState(account.clinicalProfile);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function saveClinicalProfile() {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specialty: clinicalProfile })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "No se pudo guardar el perfil clinico.");
      }
      setSavedProfile(clinicalProfile);
      setMessage("Perfil clinico guardado. La app lo toma en su proxima sincronizacion.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-stack">
      <header className="settings-header">
        <div className="settings-header-main">
          <h1>Tu cuenta</h1>
          <p>Tu expediente vive cifrado en la app de escritorio; aqui solo esta tu cuenta.</p>
        </div>
        <div className="settings-header-side">
          <span className={account.status === "ACTIVE" ? "pill pill-success" : "pill pill-muted"}>
            {account.status === "ACTIVE" ? "Cuenta activa" : "Cuenta en revision"}
          </span>
        </div>
      </header>

      <article className="settings-section">
        <div className="panel-header">
          <h2>Datos de la cuenta</h2>
          <p>Con este correo vinculas la app de escritorio.</p>
        </div>
        <dl className="account-facts">
          <div>
            <dt>Nombre profesional</dt>
            <dd>{account.professionalName || "Sin capturar"}</dd>
          </div>
          <div>
            <dt>Correo</dt>
            <dd>
              {account.email}{" "}
              {account.emailVerified ? null : <span className="pill pill-muted">Sin verificar</span>}
            </dd>
          </div>
          <div>
            <dt>Cedula profesional</dt>
            <dd>{account.licenseNumber || "Sin capturar"}</dd>
          </div>
        </dl>
      </article>

      <article className="settings-section">
        <div className="panel-header">
          <h2>Perfil clinico</h2>
          <p>Define las plantillas y herramientas que abre la app: nota general u odontograma.</p>
        </div>
        <form
          className="settings-form"
          onSubmit={(event) => {
            event.preventDefault();
            void saveClinicalProfile();
          }}
        >
          <div className="field">
            <label htmlFor="account-clinical-profile">Perfil</label>
            <select
              id="account-clinical-profile"
              value={clinicalProfile}
              onChange={(event) => setClinicalProfile(event.currentTarget.value as ClinicalProfile)}
            >
              <option value="GENERAL_MEDICINE">Medicina general / familiar</option>
              <option value="ODONTOLOGY">Odontologia</option>
            </select>
          </div>
          {error ? (
            <p className="form-error field-full" role="alert">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="form-success field-full" role="status">
              {message}
            </p>
          ) : null}
          <div className="button-row field-full">
            <button
              className="action-button"
              type="submit"
              disabled={busy || clinicalProfile === savedProfile}
            >
              {busy ? "Guardando…" : "Guardar perfil clinico"}
            </button>
          </div>
        </form>
      </article>

      <article className="settings-section">
        <div className="panel-header">
          <h2>Suscripcion</h2>
          <p>Incluye la asistencia de IA de la app. Sin suscripcion puedes seguir documentando a mano.</p>
        </div>
        <dl className="account-facts">
          <div>
            <dt>Plan</dt>
            <dd>{subscription.planName ?? "Sin plan"}</dd>
          </div>
          <div>
            <dt>Estado</dt>
            <dd>
              <span className={subscription.entitled ? "pill pill-success" : "pill pill-muted"}>
                {subscription.status ? STATUS_LABELS[subscription.status] : "Sin suscripcion"}
              </span>
            </dd>
          </div>
          {subscription.renewsAt ? (
            <div>
              <dt>Renueva</dt>
              <dd>{dateFormatter.format(new Date(subscription.renewsAt))}</dd>
            </div>
          ) : null}
        </dl>
      </article>

      <article className="settings-section">
        <div className="panel-header">
          <h2>App de escritorio</h2>
          <p>
            Abre MiDoc en tu computadora, elige tu perfil y vincula el equipo con tu correo y
            contrasena. La contrasena no se guarda en el equipo.
          </p>
        </div>
      </article>
    </section>
  );
}
