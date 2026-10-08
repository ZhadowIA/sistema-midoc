"use client";

import { useState } from "react";
import type { ClinicalProfile, LicenseStatus, UserStatus } from "@prisma/client";

// Fechas de calendario (AAAA-MM-DD) en UTC para no recorrer un dia; instantes en hora local.
const calendarFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone: "UTC" });
const instantFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" });

function calendarDate(value: string) {
  return calendarFormatter.format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
}

const GRANT_LABELS: Record<string, string> = {
  COURTESY: "Cortesía de la licencia",
  TOP_UP: "Recarga",
  PLAN_MONTHLY: "Plan mensual",
  ADJUSTMENT: "Ajuste"
};

const USAGE_LABELS: Record<string, string> = {
  TRANSCRIPTION: "Transcripción en la nube"
};

interface LicenseDevice {
  id: string;
  deviceName: string | null;
  activatedAt: string;
  lastSeenAt: string;
}

interface LicenseInfo {
  status: LicenseStatus;
  purchasedAt: string;
  updatesUntil: string;
  maxDevices: number;
  devices: LicenseDevice[];
}

interface CreditsInfo {
  balance: number;
  expiringCredits: number;
  nextExpiry: string | null;
  movements: { type: "grant" | "usage"; kind: string; credits: number; at: string; expiresAt: string | null }[];
}

export function CuentaClient({
  account,
  license: initialLicense,
  credits
}: {
  account: {
    email: string;
    emailVerified: boolean;
    status: UserStatus;
    professionalName: string;
    licenseNumber: string | null;
    clinicalProfile: ClinicalProfile;
  };
  license: LicenseInfo | null;
  credits: CreditsInfo;
}) {
  const [clinicalProfile, setClinicalProfile] = useState(account.clinicalProfile);
  const [savedProfile, setSavedProfile] = useState(account.clinicalProfile);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [license, setLicense] = useState(initialLicense);
  const [releasing, setReleasing] = useState<string | null>(null);
  const [licenseError, setLicenseError] = useState("");

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

  async function releaseDevice(device: LicenseDevice) {
    const name = device.deviceName ?? "este equipo";
    const confirmed = window.confirm(
      `¿Liberar ${name}? Su lugar queda libre para activar otro equipo. ${name} conserva su licencia y sigue ` +
        "funcionando sin conexión, pero solo podrá volver a activarse si hay lugar."
    );
    if (!confirmed) {
      return;
    }
    setReleasing(device.id);
    setLicenseError("");
    try {
      const response = await fetch(`/api/admin/license/devices/${encodeURIComponent(device.id)}/release`, {
        method: "POST"
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "No se pudo liberar el equipo.");
      }
      setLicense((current) =>
        current && data.license
          ? {
              ...current,
              devices: (data.license.devices as LicenseDevice[]).map((d) => ({
                id: d.id,
                deviceName: d.deviceName,
                activatedAt: String(d.activatedAt),
                lastSeenAt: String(d.lastSeenAt)
              }))
            }
          : current
      );
    } catch (releaseError) {
      setLicenseError(releaseError instanceof Error ? releaseError.message : "No se pudo liberar el equipo.");
    } finally {
      setReleasing(null);
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
          <h2>Licencia de MiDoc</h2>
          <p>
            Compra única: la app es tuya y funciona sin conexión. Las actualizaciones vienen incluidas hasta la fecha
            indicada; después, la última versión que recibiste se queda contigo.
          </p>
        </div>
        {license ? (
          <>
            <dl className="account-facts">
              <div>
                <dt>Estado</dt>
                <dd>
                  <span className={license.status === "ACTIVE" ? "pill pill-success" : "pill pill-muted"}>
                    {license.status === "ACTIVE" ? "Activa" : "Revocada"}
                  </span>
                </dd>
              </div>
              <div>
                <dt>Compra</dt>
                <dd>{calendarDate(license.purchasedAt)}</dd>
              </div>
              <div>
                <dt>Actualizaciones incluidas hasta</dt>
                <dd>{calendarDate(license.updatesUntil)}</dd>
              </div>
              <div>
                <dt>Equipos activados</dt>
                <dd>
                  {license.devices.length} de {license.maxDevices}
                </dd>
              </div>
            </dl>
            {license.devices.length > 0 ? (
              <ul className="account-devices">
                {license.devices.map((device) => (
                  <li key={device.id}>
                    <span className="account-device-text">
                      <strong>{device.deviceName ?? "Equipo sin nombre"}</strong>
                      <small>
                        Activado el {instantFormatter.format(new Date(device.activatedAt))} · visto por última vez el{" "}
                        {instantFormatter.format(new Date(device.lastSeenAt))}
                      </small>
                    </span>
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={releasing !== null}
                      onClick={() => void releaseDevice(device)}
                    >
                      {releasing === device.id ? "Liberando…" : "Liberar"}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="meta">Todavía no activas ningún equipo: vincula la app de escritorio con este correo.</p>
            )}
            {licenseError ? (
              <p className="form-error" role="alert">
                {licenseError}
              </p>
            ) : null}
          </>
        ) : (
          <p className="meta">Tu cuenta todavía no tiene licencia de MiDoc.</p>
        )}
      </article>

      <article className="settings-section">
        <div className="panel-header">
          <h2>Créditos de IA</h2>
          <p>
            La asistencia de IA en la nube usa créditos. Las recargas no caducan; la transcripción en tu equipo y la
            captura manual no gastan créditos.
          </p>
        </div>
        <dl className="account-facts">
          <div>
            <dt>Saldo</dt>
            <dd>
              <strong>{credits.balance}</strong> créditos
            </dd>
          </div>
          {credits.expiringCredits > 0 && credits.nextExpiry ? (
            <div>
              <dt>Por caducar</dt>
              <dd>
                {credits.expiringCredits} del plan mensual, el {instantFormatter.format(new Date(credits.nextExpiry))}
              </dd>
            </div>
          ) : null}
        </dl>
        {credits.movements.length > 0 ? (
          <table className="account-movements">
            <caption>Movimientos recientes</caption>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Concepto</th>
                <th scope="col">Créditos</th>
              </tr>
            </thead>
            <tbody>
              {credits.movements.map((movement, index) => (
                <tr key={`${movement.at}-${index}`}>
                  <td>{instantFormatter.format(new Date(movement.at))}</td>
                  <td>
                    {movement.type === "grant"
                      ? (GRANT_LABELS[movement.kind] ?? "Abono")
                      : (USAGE_LABELS[movement.kind] ?? "Asistencia de IA")}
                  </td>
                  <td className={movement.credits < 0 ? "movement-debit" : "movement-credit"}>
                    {movement.credits > 0 ? `+${movement.credits}` : movement.credits}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="meta">Sin movimientos todavía.</p>
        )}
      </article>

      <article className="settings-section">
        <div className="panel-header">
          <h2>App de escritorio</h2>
          <p>
            Abre MiDoc en tu computadora, elige tu perfil y vincula el equipo con tu correo y contraseña. Se activa
            una sola vez; después funciona sin conexión. La contraseña no se guarda en el equipo.
          </p>
        </div>
      </article>
    </section>
  );
}
