import { useCallback, useEffect, useState } from "react";
import { call } from "./ipc";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
import { MedicalHistoryGroups } from "./MedicalHistoryGroups";
import { formatMedicalHistoryForDisplay } from "./medicalHistoryFormat";

interface Guardian {
  name: string;
  relationship: string | null;
  phone: string | null;
  email: string | null;
}

interface PatientRecord {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
  allergies: string | null;
  medical_background: string | null;
  family_background: string | null;
  guardian: Guardian | null;
  is_minor: boolean;
}

function guardianContactLine(guardian: Guardian): string {
  const parts = [guardian.phone, guardian.email].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Sin contacto";
}

interface HistoryEntry {
  encounter_id: string;
  signed_at: string | null;
  status: string;
  diagnosis: string;
}

interface PatientProfile {
  patient: PatientRecord;
  history: HistoryEntry[];
}

interface PatientMedicalHistoryVersion {
  id: string;
  patient_id: string;
  version: number;
  payload_json: string;
  source: string;
  encounter_id: string | null;
  source_appointment_id: string | null;
  reconciled_source_hash: string | null;
  created_at: string;
}

interface TimelineEvent {
  id: string;
  patient_id: string;
  event_date: string;
  category: string;
  title: string;
  detail: string | null;
  created_at: string;
  updated_at: string;
}

type SectionId = "antecedentes" | "historial" | "timeline";

const CATEGORY_LABELS: Record<string, string> = {
  NOTE: "Nota",
  DIAGNOSIS: "Diagnostico",
  PROCEDURE: "Procedimiento",
  MEDICATION: "Medicacion",
  LAB: "Laboratorio",
  ALERT: "Alerta",
  MILESTONE: "Hito"
};

const CATEGORY_PILLS: Record<string, string> = {
  NOTE: "pill pill-muted",
  DIAGNOSIS: "pill pill-primary",
  PROCEDURE: "pill pill-muted",
  MEDICATION: "pill pill-muted",
  LAB: "pill pill-muted",
  ALERT: "pill pill-danger",
  MILESTONE: "pill pill-success"
};

const CATEGORY_ORDER = [
  "NOTE",
  "DIAGNOSIS",
  "PROCEDURE",
  "MEDICATION",
  "LAB",
  "ALERT",
  "MILESTONE"
] as const;

const dateTimeFormatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short"
});

const dateFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "long" });

function formatEventDate(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : dateFormatter.format(parsed);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface EventForm {
  event_date: string;
  category: string;
  title: string;
  detail: string;
}

const EMPTY_FORM: EventForm = {
  event_date: todayIso(),
  category: "NOTE",
  title: "",
  detail: ""
};

interface BackgroundForm {
  allergies: string;
  medical_background: string;
  family_background: string;
  birth_date: string;
}

export function Expediente({
  patientId,
  onBack,
  onOpenEncounter
}: {
  patientId: string;
  onBack: () => void;
  onOpenEncounter: (encounterId: string) => void;
}) {
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [patientMedicalHistory, setPatientMedicalHistory] =
    useState<PatientMedicalHistoryVersion | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [section, setSection] = useState<SectionId>("timeline");
  const [editing, setEditing] = useState<"new" | string | null>(null);
  const [form, setForm] = useState<EventForm>(EMPTY_FORM);
  const [editingBackground, setEditingBackground] = useState(false);
  const [backgroundForm, setBackgroundForm] = useState<BackgroundForm>({
    allergies: "",
    medical_background: "",
    family_background: "",
    birth_date: ""
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadProfile = useCallback(() => {
    call<PatientProfile>("get_patient_profile", { patientId })
      .then(setProfile)
      .catch((e: unknown) => setError(String(e)));
  }, [patientId]);

  const loadEvents = useCallback(() => {
    call<TimelineEvent[]>("list_timeline_events", { patientId })
      .then(setEvents)
      .catch((e: unknown) => setError(String(e)));
  }, [patientId]);

  const loadMedicalHistory = useCallback(() => {
    call<PatientMedicalHistoryVersion | null>("get_patient_medical_history", { patientId })
      .then(setPatientMedicalHistory)
      .catch((e: unknown) => setError(String(e)));
  }, [patientId]);

  useEffect(() => {
    loadProfile();
    loadEvents();
    loadMedicalHistory();
  }, [loadProfile, loadEvents, loadMedicalHistory]);

  function startNew() {
    setForm({ ...EMPTY_FORM, event_date: todayIso() });
    setEditing("new");
    setError("");
    setMessage("");
  }

  function startEdit(event: TimelineEvent) {
    setForm({
      event_date: event.event_date.slice(0, 10),
      category: event.category,
      title: event.title,
      detail: event.detail ?? ""
    });
    setEditing(event.id);
    setError("");
    setMessage("");
  }

  function cancelEdit() {
    setEditing(null);
    setError("");
  }

  async function submitForm() {
    setBusy(true);
    setError("");
    setMessage("");
    const payload = {
      event_date: form.event_date,
      category: form.category,
      title: form.title,
      detail: form.detail || null
    };
    try {
      if (editing === "new") {
        await call("add_timeline_event", { patientId, event: payload });
        setMessage("Evento agregado a la linea del tiempo.");
      } else if (editing) {
        await call("update_timeline_event", { eventId: editing, event: payload });
        setMessage("Evento actualizado.");
      }
      setEditing(null);
      loadEvents();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeEvent(event: TimelineEvent) {
    const confirmed = window.confirm(
      `¿Eliminar el evento "${event.title}" de la linea del tiempo? Esta accion no se puede deshacer.`
    );
    if (!confirmed) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await call("delete_timeline_event", { eventId: event.id });
      setMessage("Evento eliminado.");
      if (editing === event.id) setEditing(null);
      loadEvents();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function startEditBackground() {
    if (!profile) return;
    const pr = profile.patient;
    setBackgroundForm({
      allergies: pr.allergies ?? "",
      medical_background: pr.medical_background ?? "",
      family_background: pr.family_background ?? "",
      birth_date: pr.birth_date ? pr.birth_date.slice(0, 10) : ""
    });
    setEditingBackground(true);
    setError("");
    setMessage("");
  }

  async function saveBackground() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await call("update_patient_background", {
        patientId,
        background: {
          allergies: backgroundForm.allergies || null,
          medical_background: backgroundForm.medical_background || null,
          family_background: backgroundForm.family_background || null,
          birth_date: backgroundForm.birth_date || null
        }
      });
      setEditingBackground(false);
      setMessage("Antecedentes actualizados.");
      loadProfile();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!profile) {
    return (
      <div className="content">
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : (
          <p className="meta">Cargando expediente…</p>
        )}
      </div>
    );
  }

  const p = profile.patient;
  const medicalHistoryGroups = formatMedicalHistoryForDisplay(
    patientMedicalHistory?.payload_json ?? null
  );
  const navItems: Array<{ id: SectionId; label: string }> = [
    { id: "antecedentes", label: "Antecedentes" },
    { id: "historial", label: "Historial" },
    { id: "timeline", label: "Linea del tiempo" }
  ];

  return (
    <>
      <header className="app-topbar">
        <button className="ghost-button" onClick={onBack}>
          ← Directorio
        </button>
        <span className="topbar-context">Expediente longitudinal</span>
      </header>

      <div className="content encounter-content">
        <section className="panel patient-banner">
          <div className="panel-header">
            <h2>
              {p.first_name} {p.last_name}
              {p.is_minor ? (
                <span className="pill pill-primary patient-minor-pill">Menor con tutor</span>
              ) : null}
            </h2>
            <p>
              {p.phone ? `Tel: ${p.phone}` : "Sin telefono"}
              {p.email ? ` · ${p.email}` : ""}
              {p.birth_date ? ` · Nac: ${formatEventDate(p.birth_date)}` : ""}
            </p>
          </div>
          {p.guardian ? (
            <p className="meta patient-guardian">
              Responsable: <strong>{p.guardian.name}</strong>
              {p.guardian.relationship ? ` (${p.guardian.relationship})` : ""}
              {" · "}
              {guardianContactLine(p.guardian)}
            </p>
          ) : null}
          {p.allergies ? <p className="alert-allergies">Alergias: {p.allergies}</p> : null}
        </section>

        <div className="encounter-layout">
          <nav className="encounter-nav" aria-label="Secciones del expediente">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={section === item.id ? "nav-item nav-item-active" : "nav-item"}
                aria-current={section === item.id ? "page" : undefined}
                onClick={() => setSection(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="encounter-main">
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

            {section === "antecedentes" ? (
              <section className="panel">
                <div className="panel-header timeline-header">
                  <h3>Antecedentes</h3>
                  {!editingBackground ? (
                    <button className="ghost-button" onClick={startEditBackground} disabled={busy}>
                      Editar antecedentes
                    </button>
                  ) : null}
                </div>

                {editingBackground ? (
                  <form
                    className="stack"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void saveBackground();
                    }}
                  >
                    <label className="field">
                      <span>Alergias</span>
                      <input
                        value={backgroundForm.allergies}
                        disabled={busy}
                        onChange={(e) =>
                          setBackgroundForm((c) => ({ ...c, allergies: e.target.value }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Antecedentes personales</span>
                      <AutoGrowTextarea
                        rows={2}
                        value={backgroundForm.medical_background}
                        disabled={busy}
                        onChange={(e) =>
                          setBackgroundForm((c) => ({ ...c, medical_background: e.target.value }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Antecedentes familiares</span>
                      <AutoGrowTextarea
                        rows={2}
                        value={backgroundForm.family_background}
                        disabled={busy}
                        onChange={(e) =>
                          setBackgroundForm((c) => ({ ...c, family_background: e.target.value }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Fecha de nacimiento</span>
                      <input
                        type="date"
                        value={backgroundForm.birth_date}
                        disabled={busy}
                        onChange={(e) =>
                          setBackgroundForm((c) => ({ ...c, birth_date: e.target.value }))
                        }
                      />
                    </label>
                    <div className="button-row">
                      <button className="action-button" type="submit" disabled={busy}>
                        Guardar antecedentes
                      </button>
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() => {
                          setEditingBackground(false);
                          setError("");
                        }}
                        disabled={busy}
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : medicalHistoryGroups.length > 0 ? (
                  <div className="questionnaire-history">
                    <div className="panel-header">
                      <strong>Cuestionario de antecedentes</strong>
                      <p>
                        Expediente permanente · versión {patientMedicalHistory?.version}
                      </p>
                    </div>
                    <MedicalHistoryGroups groups={medicalHistoryGroups} />
                  </div>
                ) : p.allergies || p.medical_background || p.family_background ? (
                  <dl className="precheckin-list">
                    {p.allergies ? (
                      <div>
                        <dt>Alergias</dt>
                        <dd>{p.allergies}</dd>
                      </div>
                    ) : null}
                    {p.medical_background ? (
                      <div>
                        <dt>Antecedentes personales</dt>
                        <dd>{p.medical_background}</dd>
                      </div>
                    ) : null}
                    {p.family_background ? (
                      <div>
                        <dt>Antecedentes familiares</dt>
                        <dd>{p.family_background}</dd>
                      </div>
                    ) : null}
                  </dl>
                ) : (
                  <p className="meta">
                    Sin antecedentes registrados. Pulsa &quot;Editar antecedentes&quot; para
                    capturarlos.
                  </p>
                )}
              </section>
            ) : null}

            {section === "historial" ? (
              <section className="panel">
                <h3>Historial de consultas</h3>
                {profile.history.length === 0 ? (
                  <p className="meta">Este paciente todavia no tiene consultas registradas.</p>
                ) : (
                  <ul className="appointment-list">
                    {profile.history.map((entry) => (
                      <li key={entry.encounter_id} className="list-row">
                        <div className="list-row-main">
                          <span className="meta">
                            {entry.signed_at
                              ? dateTimeFormatter.format(new Date(entry.signed_at))
                              : "Sin firmar"}
                          </span>
                          <strong>{entry.diagnosis || "Sin diagnostico registrado"}</strong>
                        </div>
                        {entry.status !== "SIGNED" ? (
                          <div className="row-actions">
                            <span className="pill pill-warning">Sin firmar</span>
                            <button
                              className="ghost-button"
                              onClick={() => onOpenEncounter(entry.encounter_id)}
                            >
                              Abrir y firmar
                            </button>
                          </div>
                        ) : (
                          <span className="pill pill-success">Firmada</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ) : null}

            {section === "timeline" ? (
              <section className="panel">
                <div className="panel-header timeline-header">
                  <div>
                    <h3>Linea del tiempo</h3>
                    <p>
                      Eventos clinicos relevantes que tu curas: diagnosticos, hitos,
                      alertas, laboratorios y mas.
                    </p>
                  </div>
                  {editing === null ? (
                    <button className="action-button" onClick={startNew} disabled={busy}>
                      Anadir evento
                    </button>
                  ) : null}
                </div>

                {editing !== null ? (
                  <form
                    className="stack timeline-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void submitForm();
                    }}
                  >
                    <div className="timeline-form-grid">
                      <label className="field">
                        <span>Fecha del evento</span>
                        <input
                          type="date"
                          value={form.event_date}
                          disabled={busy}
                          onChange={(e) =>
                            setForm((current) => ({ ...current, event_date: e.target.value }))
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Categoria</span>
                        <select
                          value={form.category}
                          disabled={busy}
                          onChange={(e) =>
                            setForm((current) => ({ ...current, category: e.target.value }))
                          }
                        >
                          {CATEGORY_ORDER.map((category) => (
                            <option key={category} value={category}>
                              {CATEGORY_LABELS[category]}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="field">
                      <span>Titulo</span>
                      <input
                        value={form.title}
                        disabled={busy}
                        placeholder="Diabetes tipo 2, alergia confirmada, cirugia…"
                        onChange={(e) =>
                          setForm((current) => ({ ...current, title: e.target.value }))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Detalle (opcional)</span>
                      <AutoGrowTextarea
                        rows={3}
                        value={form.detail}
                        disabled={busy}
                        onChange={(e) =>
                          setForm((current) => ({ ...current, detail: e.target.value }))
                        }
                      />
                    </label>
                    <div className="button-row">
                      <button
                        className="action-button"
                        type="submit"
                        disabled={busy || form.title.trim() === "" || form.event_date === ""}
                      >
                        {editing === "new" ? "Agregar evento" : "Guardar cambios"}
                      </button>
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={cancelEdit}
                        disabled={busy}
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : null}

                {events.length === 0 ? (
                  <div className="empty-state">
                    <strong>Linea del tiempo vacia</strong>
                    <p>Agrega el primer evento clinico relevante de este paciente.</p>
                  </div>
                ) : (
                  <ol className="timeline">
                    {events.map((event) => (
                      <li key={event.id} className="timeline-item">
                        <div className="timeline-item-head">
                          <span className="timeline-date">{formatEventDate(event.event_date)}</span>
                          <span className={CATEGORY_PILLS[event.category] ?? "pill pill-muted"}>
                            {CATEGORY_LABELS[event.category] ?? event.category}
                          </span>
                        </div>
                        <strong>{event.title}</strong>
                        {event.detail ? <p className="timeline-detail">{event.detail}</p> : null}
                        <div className="button-row">
                          <button
                            className="ghost-button"
                            onClick={() => startEdit(event)}
                            disabled={busy}
                          >
                            Editar
                          </button>
                          <button
                            className="danger-button"
                            onClick={() => void removeEvent(event)}
                            disabled={busy}
                          >
                            Eliminar
                          </button>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
