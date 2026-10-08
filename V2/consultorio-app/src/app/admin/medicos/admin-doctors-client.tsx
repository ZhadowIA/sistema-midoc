"use client";

import { UserStatus } from "@prisma/client";
import { useMemo, useState } from "react";

type DoctorAccount = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  status: UserStatus;
  emailVerifiedAt: Date | string | null;
  createdAt: Date | string;
  lastLoginAt: Date | string | null;
  doctorProfile: {
    professionalName: string;
    publicSlug: string;
    specialty: string;
    licenseNumber: string | null;
    isPublic: boolean;
  } | null;
  // Licencia de compra unica y saldo de creditos de IA (paso 29).
  license: {
    status: string;
    updatesUntil: string;
    maxDevices: number;
    activeDevices: number;
  } | null;
  aiCredits: number;
};

const statusLabels: Record<UserStatus, string> = {
  ACTIVE: "Activa",
  PENDING_APPROVAL: "Pendiente",
  INVITED: "Invitada",
  SUSPENDED: "Suspendida",
  ARCHIVED: "Archivada"
};

function formatDate(value: Date | string | null) {
  if (!value) {
    return "Sin registro";
  }

  return new Intl.DateTimeFormat("es-MX", {
    year: "numeric",
    month: "short",
    day: "2-digit"
  }).format(new Date(value));
}

export function AdminDoctorsClient({
  initialAccounts,
  pendingCount
}: {
  initialAccounts: DoctorAccount[];
  pendingCount: number;
}) {
  const [accounts, setAccounts] = useState(initialAccounts);
  const [statusFilter, setStatusFilter] = useState<UserStatus | "ALL">("ALL");
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [creditDrafts, setCreditDrafts] = useState<Record<string, string>>({});

  const filteredAccounts = useMemo(() => {
    if (statusFilter === "ALL") {
      return accounts;
    }

    return accounts.filter((account) => account.status === statusFilter);
  }, [accounts, statusFilter]);

  async function updateStatus(doctorId: string, status: UserStatus) {
    setBusyId(doctorId);
    setError("");
    try {
      const response = await fetch(`/api/platform-admin/doctors/${doctorId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "No se pudo actualizar el medico.");
      }

      setAccounts((current) =>
        current.map((account) =>
          account.id === doctorId ? { ...account, status: data.doctor.status } : account
        )
      );
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "No se pudo actualizar el medico.");
    } finally {
      setBusyId("");
    }
  }

  async function grantLicense(doctorId: string) {
    setBusyId(doctorId);
    setError("");
    try {
      const response = await fetch(`/api/platform-admin/doctors/${doctorId}/license`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "PILOT" })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "No se pudo otorgar la licencia.");
      }
      setAccounts((current) =>
        current.map((account) =>
          account.id === doctorId
            ? {
                ...account,
                license: {
                  status: "ACTIVE",
                  updatesUntil: String(data.updatesUntil).slice(0, 10),
                  maxDevices: data.maxDevices,
                  activeDevices: 0
                },
                // La licencia incluye creditos de cortesia.
                aiCredits: data.aiCredits
              }
            : account
        )
      );
    } catch (grantError) {
      setError(grantError instanceof Error ? grantError.message : "No se pudo otorgar la licencia.");
    } finally {
      setBusyId("");
    }
  }

  async function addCredits(doctorId: string) {
    const parsed = Number(creditDrafts[doctorId] ?? "");
    if (!Number.isInteger(parsed) || parsed < 1) {
      setError("Los créditos a abonar deben ser un entero mayor que cero.");
      return;
    }
    setBusyId(doctorId);
    setError("");
    try {
      const response = await fetch(`/api/platform-admin/doctors/${doctorId}/credits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "TOP_UP", credits: parsed })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "No se pudieron abonar los créditos.");
      }
      setAccounts((current) =>
        current.map((account) => (account.id === doctorId ? { ...account, aiCredits: data.balance } : account))
      );
      setCreditDrafts((drafts) => ({ ...drafts, [doctorId]: "" }));
    } catch (creditError) {
      setError(creditError instanceof Error ? creditError.message : "No se pudieron abonar los créditos.");
    } finally {
      setBusyId("");
    }
  }


  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">Administrador</p>
          <h1>Medicos y aprobaciones</h1>
          <p>Revisa solicitudes de alta y controla que perfiles pueden publicarse.</p>
        </div>
        <div className="admin-metric">
          <span>{pendingCount}</span>
          <p>Pendientes</p>
        </div>
      </header>

      <section className="admin-toolbar" aria-label="Filtros de medicos">
        {(["ALL", UserStatus.PENDING_APPROVAL, UserStatus.ACTIVE, UserStatus.SUSPENDED, UserStatus.ARCHIVED] as const).map(
          (status) => (
            <button
              className={statusFilter === status ? "filter-chip filter-chip-active" : "filter-chip"}
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
            >
              {status === "ALL" ? "Todos" : statusLabels[status]}
            </button>
          )
        )}
      </section>

      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      <section className="admin-table" aria-label="Cuentas medicas">
        <div className="admin-table-row admin-table-head">
          <span>Medico</span>
          <span>Estado</span>
          <span>Perfil</span>
          <span>Alta</span>
          <span>Acciones</span>
        </div>

        {filteredAccounts.map((account) => (
          <article className="admin-table-row" key={account.id}>
            <div>
              <strong>{account.doctorProfile?.professionalName || `${account.firstName} ${account.lastName}`}</strong>
              <p>{account.email}</p>
              <p>{account.phone || "Sin telefono"} · Ced. {account.doctorProfile?.licenseNumber || "sin cedula"}</p>
            </div>
            <span className={`status-pill status-${account.status.toLowerCase()}`}>
              {statusLabels[account.status]}
            </span>
            <div>
              <p>{account.doctorProfile?.specialty || "Sin especialidad"}</p>
              <p>{account.doctorProfile?.isPublic ? "Publicado" : "No publicado"}</p>
            </div>
            <div>
              <p>{formatDate(account.createdAt)}</p>
              <p>{account.emailVerifiedAt ? "Correo verificado" : "Correo pendiente"}</p>
            </div>
            <div className="admin-actions">
              <button
                className="action-button action-button-small"
                type="button"
                disabled={busyId === account.id || account.status === UserStatus.ACTIVE}
                onClick={() => void updateStatus(account.id, UserStatus.ACTIVE)}
              >
                Aprobar
              </button>
              <button
                className="secondary-button secondary-button-small"
                type="button"
                disabled={busyId === account.id || account.status === UserStatus.SUSPENDED}
                onClick={() => void updateStatus(account.id, UserStatus.SUSPENDED)}
              >
                Suspender
              </button>

              <div className="admin-ai-controls">
                {account.license ? (
                  <span className="status-pill status-active">
                    Licencia · {account.license.activeDevices}/{account.license.maxDevices} equipos · act. hasta{" "}
                    {formatDate(`${account.license.updatesUntil}T12:00:00Z`)}
                  </span>
                ) : (
                  <button
                    className="secondary-button secondary-button-small"
                    type="button"
                    disabled={busyId === account.id}
                    onClick={() => void grantLicense(account.id)}
                  >
                    Otorgar licencia (piloto)
                  </button>
                )}
                <span className="status-pill">{account.aiCredits} créditos IA</span>
                <label className="admin-ai-credits">
                  <span>Abonar créditos</span>
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={creditDrafts[account.id] ?? ""}
                    disabled={busyId === account.id}
                    onChange={(event) =>
                      setCreditDrafts((drafts) => ({ ...drafts, [account.id]: event.target.value }))
                    }
                  />
                </label>
                <button
                  className="secondary-button secondary-button-small"
                  type="button"
                  disabled={busyId === account.id || !creditDrafts[account.id]}
                  onClick={() => void addCredits(account.id)}
                >
                  Abonar
                </button>
              </div>
            </div>
          </article>
        ))}

        {filteredAccounts.length === 0 ? (
          <p className="empty-state">No hay medicos en este filtro.</p>
        ) : null}
      </section>
    </main>
  );
}
