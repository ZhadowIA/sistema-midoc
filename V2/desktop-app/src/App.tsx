import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
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
      const result = await invoke<UnlockResult>("unlock_database", { passphrase });
      setPassphrase("");
      onUnlocked(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container">
      <h1>MiDoc</h1>
      <p>Introduce tu frase de seguridad para abrir el expediente cifrado.</p>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          void unlock();
        }}
      >
        <input
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.currentTarget.value)}
          placeholder="Frase de seguridad"
          autoFocus
        />
        <button type="submit" disabled={busy || passphrase.length === 0}>
          {busy ? "Abriendo…" : "Desbloquear"}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </main>
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
      await invoke("link_account", { serverUrl, email, password });
      setPassword("");
      onLinked();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Vincular con tu cuenta MiDoc</h2>
      <p className="meta">
        Conecta esta computadora con tu agenda en linea. Tus pacientes agendan en el
        portal y las citas bajan aqui, a tu expediente cifrado.
      </p>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void link();
        }}
      >
        <input
          type="url"
          value={serverUrl}
          onChange={(e) => setServerUrl(e.currentTarget.value)}
          placeholder="https://portal.midoc.mx"
          required
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.currentTarget.value)}
          placeholder="Correo de tu cuenta"
          required
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          placeholder="Contrasena"
          required
        />
        <button type="submit" disabled={busy}>
          {busy ? "Vinculando…" : "Vincular dispositivo"}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function Workspace({ unlocked, onLock }: { unlocked: UnlockResult; onLock: () => void }) {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [nextStatus, rows] = await Promise.all([
        invoke<SyncStatus>("sync_status"),
        invoke<AppointmentRow[]>("list_appointments")
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
      const summary = await invoke<{ applied_events: number; cursor: number }>("sync_now");
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
    await invoke("lock_database");
    onLock();
  }

  if (!status) {
    return (
      <main className="container">
        <h1>MiDoc</h1>
        <p className="meta">Cargando…</p>
      </main>
    );
  }

  return (
    <main className="container wide">
      <header className="workspace-header">
        <h1>MiDoc</h1>
        <div className="row">
          {status.linked ? (
            <button onClick={() => void syncNow()} disabled={busy}>
              {busy ? "Sincronizando…" : "Sincronizar ahora"}
            </button>
          ) : null}
          <button className="secondary" onClick={() => void lock()}>
            Bloquear
          </button>
        </div>
      </header>

      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}

      {!status.linked ? (
        <LinkAccountForm onLinked={() => void refresh()} />
      ) : (
        <section className="card">
          <h2>Agenda</h2>
          {appointments.length === 0 ? (
            <p className="meta">
              Sin citas todavia. Cuando un paciente agende en tu portal, pulsa
              &quot;Sincronizar ahora&quot; para traerlas a tu expediente.
            </p>
          ) : (
            <ul className="appointment-list">
              {appointments.map((appointment) => (
                <li key={appointment.id} className="appointment-row">
                  <div>
                    <strong>{appointment.patient_name}</strong>
                    <span className="meta">
                      {" "}
                      · {appointment.service_name ?? "Consulta"}
                      {appointment.has_precheckin ? " · preconsulta recibida" : ""}
                    </span>
                    <br />
                    <span className="meta">
                      {dateTimeFormatter.format(new Date(appointment.scheduled_start))}
                      {appointment.reason ? ` · ${appointment.reason}` : ""}
                    </span>
                  </div>
                  <span className={`status status-${appointment.status.toLowerCase()}`}>
                    {STATUS_LABELS[appointment.status] ?? appointment.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <p className="meta footer-meta">
        Expediente cifrado · esquema v{unlocked.schema_version} · {unlocked.db_path}
      </p>
    </main>
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
