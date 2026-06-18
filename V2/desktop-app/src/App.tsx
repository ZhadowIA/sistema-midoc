import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { call } from "./ipc";
import { Atencion } from "./Atencion";
import { Recepcion } from "./Recepcion";
import { Benchmark } from "./Benchmark";
import { TranscriptionSetup } from "./TranscriptionSetup";
import { MedicationReference } from "./MedicationReference";
import { Arco } from "./Arco";
import { Directorio } from "./Directorio";
import { Expediente } from "./Expediente";
import { WeekAgenda } from "./WeekAgenda";
import type { EncounterAgendaAppointment } from "./encounterAgenda";
import {
  PatientResolution,
  type PatientMatch,
  type ResolutionPatient
} from "./PatientResolution";
import { coerceClinicalProfile, type ClinicalProfile } from "./clinicalProfiles";
import "./App.css";

interface UnlockResult {
  schema_version: number;
  db_path: string;
  backup_path: string;
  profile: DoctorProfile;
}

interface DoctorProfile {
  id: string;
  display_name: string;
  created_at: string;
  last_used_at: string | null;
  photo_url?: string | null;
}

interface SyncStatus {
  linked: boolean;
  server_url: string | null;
  cursor: number;
  clinical_profile: ClinicalProfile | null;
  slot_minutes: number | null;
  work_start_minutes: number | null;
  work_end_minutes: number | null;
}

type AppointmentRow = EncounterAgendaAppointment;

// Desenlace de "Atender" desde la agenda: o se identifico el expediente del
// paciente (se abre), o hay candidatos a duplicado que el medico debe revisar.
type ResolveOutcome =
  | { kind: "patient"; patient_id: string }
  | {
      kind: "needs_resolution";
      appointment_patient: ResolutionPatient;
      candidates: PatientMatch[];
    };

type AttendOutcome =
  | { kind: "encounter"; encounter_id: string }
  | {
      kind: "needs_resolution";
      appointment_patient: ResolutionPatient;
      candidates: PatientMatch[];
    };

function profileInitials(displayName: string) {
  const parts = displayName
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase()).join("") || "M";
}

function profileHue(seed: string) {
  let hash = 0;
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) % 360;
  }
  return 190 + (hash % 55);
}

function profileAvatarStyle(profile: DoctorProfile): CSSProperties {
  return { "--profile-hue": profileHue(profile.id) } as CSSProperties;
}

function UnlockScreen({ onUnlocked }: { onUnlocked: (result: UnlockResult) => void }) {
  const [profiles, setProfiles] = useState<DoctorProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<DoctorProfile | null>(null);
  const [newProfileName, setNewProfileName] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [creatingProfile, setCreatingProfile] = useState(false);

  const loadProfiles = useCallback(async () => {
    try {
      const nextProfiles = await call<DoctorProfile[]>("list_doctor_profiles");
      setProfiles(nextProfiles);
      setSelectedProfile((current) => {
        if (!current) {
          return null;
        }
        return nextProfiles.find((profile) => profile.id === current.id) ?? null;
      });
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  async function createProfile() {
    const displayName = newProfileName.trim();
    if (!displayName) return;
    setCreatingProfile(true);
    setError("");
    try {
      const profile = await call<DoctorProfile>("create_doctor_profile", { displayName });
      setNewProfileName("");
      await loadProfiles();
      setSelectedProfile(profile);
      setPassphrase("");
    } catch (e) {
      setError(String(e));
    } finally {
      setCreatingProfile(false);
    }
  }

  async function unlock() {
    if (!selectedProfile) return;
    setBusy(true);
    setError("");
    try {
      const result = await call<UnlockResult>("unlock_database", {
        profileId: selectedProfile.id,
        passphrase
      });
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
      <article className={selectedProfile ? "auth-card auth-card-narrow" : "auth-card auth-card-wide"}>
        <header>
          <span className="brand-mark">MiDoc</span>
          <h1>{selectedProfile ? "Frase de seguridad" : "Abre tu expediente"}</h1>
          <p>
            {selectedProfile
              ? "Confirma la frase de este perfil para abrir su base cifrada local."
              : "Cada medico tiene su propia base cifrada en esta computadora. Elige el perfil para continuar."}
          </p>
        </header>
        {selectedProfile ? (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void unlock();
            }}
          >
            <div className="selected-profile-card">
              <div className="profile-photo" style={profileAvatarStyle(selectedProfile)} aria-hidden="true">
                {selectedProfile.photo_url ? (
                  <img src={selectedProfile.photo_url} alt="" />
                ) : (
                  <span>{profileInitials(selectedProfile.display_name)}</span>
                )}
              </div>
              <div>
                <span className="selected-profile-label">Medico seleccionado</span>
                <strong>{selectedProfile.display_name}</strong>
              </div>
            </div>
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
                className="ghost-button"
                type="button"
                onClick={() => {
                  setSelectedProfile(null);
                  setPassphrase("");
                  setError("");
                }}
              >
                Volver
              </button>
              <button className="action-button" type="submit" disabled={busy || passphrase.length === 0}>
                {busy ? "Abriendo..." : "Desbloquear"}
              </button>
            </div>
          </form>
        ) : (
          <div className="stack">
            <div className="profile-card-grid" aria-label="Medicos disponibles">
              {profiles.map((profile) => (
                <button
                  key={profile.id}
                  className="profile-card"
                  type="button"
                  onClick={() => {
                    setSelectedProfile(profile);
                    setPassphrase("");
                    setError("");
                  }}
                >
                  <span className="profile-photo" style={profileAvatarStyle(profile)} aria-hidden="true">
                    {profile.photo_url ? (
                      <img src={profile.photo_url} alt="" />
                    ) : (
                      <span>{profileInitials(profile.display_name)}</span>
                    )}
                  </span>
                  <span className="profile-card-name">{profile.display_name}</span>
                  {profile.last_used_at ? <span className="profile-card-meta">Usado recientemente</span> : null}
                </button>
              ))}
              <form
                className="profile-add-card"
                onSubmit={(e) => {
                  e.preventDefault();
                  void createProfile();
                }}
              >
                <span className="profile-add-icon" aria-hidden="true">
                  +
                </span>
                <label className="field compact-field">
                  <span>Nuevo medico</span>
                  <input
                    type="text"
                    value={newProfileName}
                    onChange={(e) => setNewProfileName(e.currentTarget.value)}
                    placeholder="Nombre"
                  />
                </label>
                <button
                  className="ghost-button"
                  type="submit"
                  disabled={creatingProfile || newProfileName.trim().length === 0}
                >
                  {creatingProfile ? "Creando..." : "Crear"}
                </button>
              </form>
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </div>
        )}
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
  // Badge del boton "Sincronizar": hay cambios pendientes por bajar/subir.
  const [pendingSync, setPendingSync] = useState(false);
  const autoSyncedRef = useRef(false);
  const [activeEncounter, setActiveEncounter] = useState<string | null>(null);
  const [activePatient, setActivePatient] = useState<string | null>(null);
  const [resolution, setResolution] = useState<{
    appointmentId: string;
    intent: "record" | "encounter";
    patient: ResolutionPatient;
    candidates: PatientMatch[];
  } | null>(null);
  const [clinicalProfile, setClinicalProfile] = useState<ClinicalProfile>("GENERAL_MEDICINE");
  const [slotMinutes, setSlotMinutes] = useState(30);
  const [workStartMinutes, setWorkStartMinutes] = useState<number | null>(null);
  const [workEndMinutes, setWorkEndMinutes] = useState<number | null>(null);
  const [view, setView] = useState<
    "agenda" | "patients" | "reception" | "benchmark" | "transcription" | "medications" | "arco"
  >("agenda");

  const refresh = useCallback(async () => {
    try {
      const [nextStatus, rows] = await Promise.all([
        call<SyncStatus>("sync_status"),
        call<AppointmentRow[]>("list_appointments")
      ]);
      setStatus(nextStatus);
      setClinicalProfile(coerceClinicalProfile(nextStatus.clinical_profile));
      setSlotMinutes(nextStatus.slot_minutes && nextStatus.slot_minutes > 0 ? nextStatus.slot_minutes : 30);
      setWorkStartMinutes(nextStatus.work_start_minutes);
      setWorkEndMinutes(nextStatus.work_end_minutes);
      setAppointments(rows);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Peek de cambios pendientes para el badge (no aplica nada).
  const refreshPending = useCallback(async () => {
    try {
      const pending = await call<{ pending_download: boolean; pending_upload: boolean }>("sync_pending");
      setPendingSync(pending.pending_download || pending.pending_upload);
    } catch {
      // Sin red o sin vincular: no alarmar con el badge.
      setPendingSync(false);
    }
  }, []);

  // Sincronizacion automatica al abrir/desbloquear (una vez) cuando esta
  // vinculada, y consulta periodica de pendientes para el badge.
  useEffect(() => {
    if (!status?.linked) {
      return;
    }
    if (!autoSyncedRef.current) {
      autoSyncedRef.current = true;
      void syncNow();
    }
    void refreshPending();
    const interval = setInterval(() => void refreshPending(), 60_000);
    return () => clearInterval(interval);
    // syncNow es estable dentro del componente; solo re-evaluamos al cambiar el vinculo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.linked, refreshPending]);

  async function syncNow() {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const summary = await call<{
        applied_events: number;
        cursor: number;
        ai_usage_reported: number;
      }>("sync_now");
      const parts: string[] = [];
      if (summary.applied_events > 0) {
        parts.push(`${summary.applied_events} evento(s) sincronizados`);
      }
      if (summary.ai_usage_reported > 0) {
        parts.push(`${summary.ai_usage_reported} reporte(s) de IA enviados`);
      }
      setMessage(parts.length > 0 ? `${parts.join(" · ")}.` : "Sin novedades en el portal.");
      await refresh();
      await refreshPending();
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

  // Desvincula este equipo del portal (borra token/URL/cursor de sync, sin tocar
  // el expediente cifrado) y muestra de nuevo el formulario para re-vincular.
  // Util si el portal se reinstalo o el dispositivo fue revocado: el token local
  // queda huerfano y el sync responde "No autorizado.".
  async function unlink() {
    if (!window.confirm(
      "Esto desvincula este equipo del portal para que puedas volver a vincularlo. " +
        "Tu expediente y tus datos locales NO se borran. ¿Continuar?"
    )) {
      return;
    }
    setError("");
    setMessage("");
    try {
      await call("unlink_device");
      await refresh();
      await refreshPending();
    } catch (e) {
      setError(String(e));
    }
  }

  // Click desde la agenda: primero muestra una decision explicita. Si no hay
  // similitudes, tambien se pide confirmar antes de crear un expediente.
  async function openPatientFromAppointment(
    appointmentId: string,
    opts?: { linkPatientId?: string; forceNew?: boolean }
  ) {
    setError("");
    setBusy(true);
    try {
      const outcome = await call<ResolveOutcome>("resolve_appointment_patient", {
        appointmentId,
        linkPatientId: opts?.linkPatientId ?? null,
        forceNew: opts?.forceNew ?? false
      });
      if (outcome.kind === "patient") {
        setResolution(null);
        setActiveEncounter(null);
        setActivePatient(outcome.patient_id);
      } else {
        setResolution({
          appointmentId,
          intent: "record",
          patient: outcome.appointment_patient,
          candidates: outcome.candidates
        });
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function startConsultationFromAppointment(
    appointmentId: string,
    opts?: { linkPatientId?: string; forceNew?: boolean }
  ) {
    setError("");
    setBusy(true);
    try {
      const outcome = await call<AttendOutcome>("attend_appointment", {
        appointmentId,
        linkPatientId: opts?.linkPatientId ?? null,
        forceNew: opts?.forceNew ?? false
      });
      if (outcome.kind === "encounter") {
        setResolution(null);
        setActivePatient(null);
        setActiveEncounter(outcome.encounter_id);
      } else {
        setResolution({
          appointmentId,
          intent: "encounter",
          patient: outcome.appointment_patient,
          candidates: outcome.candidates
        });
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const resolutionDialog = resolution ? (
    <div className="modal-backdrop">
      <div
        className="modal-shell"
        role="dialog"
        aria-modal="true"
        aria-labelledby="patient-resolution-title"
      >
        <PatientResolution
          patient={resolution.patient}
          candidates={resolution.candidates}
          busy={busy}
          onOpenRecord={(patientId) =>
            void openPatientFromAppointment(resolution.appointmentId, {
              linkPatientId: patientId
            })
          }
          onStartConsultation={(patientId) =>
            void startConsultationFromAppointment(resolution.appointmentId, {
              linkPatientId: patientId
            })
          }
          onCreateNew={() =>
            resolution.intent === "encounter"
              ? void startConsultationFromAppointment(resolution.appointmentId, {
                  forceNew: true
                })
              : void openPatientFromAppointment(resolution.appointmentId, { forceNew: true })
          }
          onClose={() => setResolution(null)}
          closeLabel={activeEncounter ? "Seguir en la consulta actual" : undefined}
        />
      </div>
    </div>
  ) : null;

  if (activeEncounter) {
    return (
      <>
        <Atencion
          key={activeEncounter}
          encounterId={activeEncounter}
          clinicalProfile={clinicalProfile}
          appointments={appointments}
          appointmentSelectionBusy={busy}
          onBack={() => {
            setActiveEncounter(null);
            void refresh();
          }}
          onSelectAppointment={(appointmentId) =>
            void startConsultationFromAppointment(appointmentId)
          }
        />
        {resolutionDialog}
      </>
    );
  }

  if (activePatient) {
    return (
      <Expediente
        patientId={activePatient}
        onBack={() => setActivePatient(null)}
        onOpenEncounter={(encounterId) => setActiveEncounter(encounterId)}
      />
    );
  }

  return (
    <>
      <header className="app-topbar">
        <span className="brand-mark">MiDoc</span>
        <span className="topbar-context">
          {unlocked.profile.display_name} · expediente cifrado · esquema v{unlocked.schema_version}
        </span>
        <div className="button-row">
          {status?.linked ? (
            <>
              <button className="action-button sync-button" onClick={() => void syncNow()} disabled={busy}>
                {busy ? "Sincronizando…" : "Sincronizar"}
                {pendingSync && !busy ? (
                  <span className="sync-badge" role="status" aria-label="Cambios pendientes por sincronizar" />
                ) : null}
              </button>
              <button className="ghost-button" onClick={() => void unlink()} disabled={busy}>
                Desvincular
              </button>
            </>
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
          <>
            <nav className="tab-row">
              <button
                className={view === "agenda" ? "tab tab-active" : "tab"}
                onClick={() => setView("agenda")}
              >
                Agenda
              </button>
              <button
                className={view === "patients" ? "tab tab-active" : "tab"}
                onClick={() => setView("patients")}
              >
                Pacientes
              </button>
              <button
                className={view === "reception" ? "tab tab-active" : "tab"}
                onClick={() => setView("reception")}
              >
                Recepcion y caja
              </button>
              <button
                className={view === "benchmark" ? "tab tab-active" : "tab"}
                onClick={() => setView("benchmark")}
              >
                Benchmark IA
              </button>
              <button
                className={view === "transcription" ? "tab tab-active" : "tab"}
                onClick={() => setView("transcription")}
              >
                Transcripcion
              </button>
              <button
                className={view === "medications" ? "tab tab-active" : "tab"}
                onClick={() => setView("medications")}
              >
                Medicamentos
              </button>
              <button
                className={view === "arco" ? "tab tab-active" : "tab"}
                onClick={() => setView("arco")}
              >
                Privacidad (ARCO)
              </button>
            </nav>
            {view === "patients" ? (
              <Directorio
                onOpenEncounter={(encounterId) => setActiveEncounter(encounterId)}
                onOpenPatient={(patientId) => setActivePatient(patientId)}
              />
            ) : view === "reception" ? (
              <Recepcion onOpenEncounter={(encounterId) => setActiveEncounter(encounterId)} />
            ) : view === "benchmark" ? (
              <Benchmark />
            ) : view === "transcription" ? (
              <TranscriptionSetup />
            ) : view === "medications" ? (
              <MedicationReference />
            ) : view === "arco" ? (
              <Arco />
            ) : (
          <section className="panel agenda-panel">
            <div className="panel-header">
              <h2>Agenda</h2>
              <p>
                Citas sincronizadas desde tu portal publico · perfil{" "}
                {clinicalProfile === "ODONTOLOGY" ? "odontologia" : "medicina general"}
              </p>
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
              <WeekAgenda
                appointments={appointments}
                slotMinutes={slotMinutes}
                workStartMinutes={workStartMinutes}
                workEndMinutes={workEndMinutes}
                onAttend={(appointmentId) => void openPatientFromAppointment(appointmentId)}
              />
            )}
          </section>
            )}
          </>
        )}

        <p className="footer-meta">
          Base: {unlocked.db_path}
          <br />
          Respaldo: {unlocked.backup_path}
        </p>
      </div>

      {resolutionDialog}
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
