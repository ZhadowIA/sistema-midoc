import { useCallback, useEffect, useState } from "react";
import { call } from "./ipc";
import { Atencion } from "./Atencion";
import "./App.css";

interface UnlockResult {
  schema_version: number;
  db_path: string;
}

interface SyncStatus {
  linked: boolean;
  server_url: string | null;
  cursor: number;
}

interface AppointmentRow {
  id: string;
  status: string;
  scheduled_start: string;
  scheduled_end: string;
  service_name: string | null;
  reason: string | null;
  patient_name: string;
  patient_phone: string | null;
  has_precheckin: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmada",
  CANCELLED: "Cancelada",
  COMPLETED: "Atendida"
};

const STATUS_PILLS: Record<string, string> = {
  PENDING: "pill pill-primary",
  CONFIRMED: "pill pill-success",
  CANCELLED: "pill pill-danger",
  COMPLETED: "pill pill-muted"
};

const dateTimeFormatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short"
});

function UnlockScreen({ onUnlocked }: { onUnlocked: (result: UnlockResult) => void }) {
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function unlock() {
    setBusy(true);
    setError("");
    try {
      const result = await call<UnlockResult>("unlock_database", { passphrase });
      setPassphrase("");
      onUnlocked(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-shell">
      <article className="auth-card">
        <header>
          <span className="brand-mark">MiDoc</span>
          <h1>Abre tu expediente</h1>
          <p>
            Tu informacion clinica vive cifrada en esta computadora. Introduce tu frase de
            seguridad para abrirla.
          </p>
        </header>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void unlock();
          }}
        >
          <label className="field">
            <span>Frase de seguridad</span>
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.currentTarget.value)}
              autoFocus
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="button-row">
            <button
              className="action-button"
              type="submit"
              disabled={busy || passphrase.length === 0}
            >
              {busy ? "Abriendo…" : "Desbloquear"}
            </button>
          </div>
        </form>
      </article>
    </div>
  );
}

function LinkAccountForm({ onLinked }: { onLinked: () => void }) {
  const [serverUrl, setServerUrl] = useState("http://localhost:3000");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function link() {
    setBusy(true);
    setError("");
    try {
      await call("link_account", { serverUrl, email, password });
      setPassword("");
      onLinked();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Vincula tu cuenta MiDoc</h2>
        <p>
          Tus pacientes agendan en el portal y las citas bajan aqui, a tu expediente
          cifrado. La contrasena no se guarda en este equipo.
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
          <span>Direccion del portal</span>
          <input
            type="url"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.currentTarget.value)}
            required
          />
        </label>
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
          <span>Contrasena</span>
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
            {busy ? "Vinculando…" : "Vincular dispositivo"}
          </button>
        </div>
      </form>
    </section>
  );
}

function Workspace({ unlocked, onLock }: { unlocked: UnlockResult; onLock: () => void }) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeEncounter, setActiveEncounter] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [nextStatus, rows] = await Promise.all([
        call<SyncStatus>("sync_status"),
        call<AppointmentRow[]>("list_appointments")
      ]);
      setStatus(nextStatus);
      setAppointments(rows);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function syncNow() {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const summary = await call<{ applied_events: number; cursor: number }>("sync_now");
      setMessage(
        summary.applied_events === 0
          ? "Sin novedades en el portal."
          : `${summary.applied_events} evento(s) sincronizados.`
      );
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function lock() {
    await call("lock_database");
    onLock();
  }

  async function attend(appointmentId: string) {
    setError("");
    try {
      const encounter = await call<{ id: string }>("open_encounter", { appointmentId });
      setActiveEncounter(encounter.id);
    } catch (e) {
      setError(String(e));
    }
  }

  if (activeEncounter) {
    return (
      <Atencion
        encounterId={activeEncounter}
        onBack={() => {
          setActiveEncounter(null);
          void refresh();
        }}
      />
    );
  }

  return (
    <>
      <header className="app-topbar">
        <span className="brand-mark">MiDoc</span>
        <span className="topbar-context">
          Expediente cifrado · esquema v{unlocked.schema_version}
        </span>
        <div className="button-row">
          {status?.linked ? (
            <button className="action-button" onClick={() => void syncNow()} disabled={busy}>
              {busy ? "Sincronizando…" : "Sincronizar"}
            </button>
          ) : null}
          <button className="ghost-button" onClick={() => void lock()}>
            Bloquear
          </button>
        </div>
      </header>

      <div className="content">
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

        {!status ? (
          <p className="meta">Cargando…</p>
        ) : !status.linked ? (
          <LinkAccountForm onLinked={() => void refresh()} />
        ) : (
          <section className="panel">
            <div className="panel-header">
              <h2>Agenda</h2>
              <p>Citas sincronizadas desde tu portal publico.</p>
            </div>
            {appointments.length === 0 ? (
              <div className="empty-state">
                <strong>Sin citas todavia</strong>
                <p>
                  Cuando un paciente agende en tu portal, pulsa &quot;Sincronizar&quot; para
                  traer sus citas a tu expediente.
                </p>
              </div>
            ) : (
              <ul className="appointment-list">
                {appointments.map((appointment) => (
                  <li key={appointment.id} className="list-row">
                    <div className="list-row-main">
                      <strong>{appointment.patient_name}</strong>
                      <span className="meta">
                        {dateTimeFormatter.format(new Date(appointment.scheduled_start))} ·{" "}
                        {appointment.service_name ?? "Consulta"}
                        {appointment.reason ? ` · ${appointment.reason}` : ""}
                      </span>
                      {appointment.has_precheckin ? (
                        <span className="meta">Preconsulta recibida</span>
                      ) : null}
                    </div>
                    <div className="row-actions">
                      <span className={STATUS_PILLS[appointment.status] ?? "pill pill-muted"}>
                        {STATUS_LABELS[appointment.status] ?? appointment.status}
                      </span>
                      {appointment.status !== "CANCELLED" ? (
                        <button
                          className="ghost-button"
                          onClick={() => void attend(appointment.id)}
                        >
                          Atender
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <p className="footer-meta">{unlocked.db_path}</p>
      </div>
    </>
  );
}

function App() {
  const [unlocked, setUnlocked] = useState<UnlockResult | null>(null);

  if (!unlocked) {
    return <UnlockScreen onUnlocked={setUnlocked} />;
  }

  return <Workspace unlocked={unlocked} onLock={() => setUnlocked(null)} />;
}

export default App;
