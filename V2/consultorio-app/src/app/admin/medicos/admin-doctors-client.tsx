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
