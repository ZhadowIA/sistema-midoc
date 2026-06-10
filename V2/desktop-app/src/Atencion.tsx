import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface NoteContent {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  diagnosis: string;
  instructions: string;
}

interface EncounterDetail {
  encounter: {
    id: string;
    status: string;
    opened_at: string;
    signed_at: string | null;
    signed_hash: string | null;
  };
  patient: {
    id: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    birth_date: string | null;
    allergies: string | null;
    medical_background: string | null;
    family_background: string | null;
  };
  appointment_reason: string | null;
  appointment_start: string | null;
  precheckin: string | null;
  note: (NoteContent & { version: number; created_at: string }) | null;
  note_version_count: number;
  prescription: string | null;
  history: Array<{
    encounter_id: string;
    signed_at: string | null;
    status: string;
    diagnosis: string;
  }>;
}

const EMPTY_NOTE: NoteContent = {
  subjective: "",
  objective: "",
  assessment: "",
  plan: "",
  diagnosis: "",
  instructions: ""
};

const NOTE_FIELDS: Array<{ key: keyof NoteContent; label: string; rows: number }> = [
  { key: "subjective", label: "S · Subjetivo (lo que refiere el paciente)", rows: 3 },
  { key: "objective", label: "O · Objetivo (exploracion y hallazgos)", rows: 3 },
  { key: "assessment", label: "A · Analisis", rows: 2 },
  { key: "diagnosis", label: "Diagnostico", rows: 2 },
  { key: "plan", label: "P · Plan", rows: 3 },
  { key: "instructions", label: "Indicaciones al paciente", rows: 3 }
];

const dateTimeFormatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short"
});

function formatPrecheckin(raw: string): Array<[string, string]> {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.entries(parsed)
      .filter(([, value]) => value !== null && String(value).trim() !== "")
      .map(([key, value]) => [key, String(value)]);
  } catch {
    return [["respuestas", raw]];
  }
}

export function Atencion({
  encounterId,
  onBack
}: {
  encounterId: string;
  onBack: () => void;
}) {
  const [detail, setDetail] = useState<EncounterDetail | null>(null);
  const [note, setNote] = useState<NoteContent>(EMPTY_NOTE);
  const [prescription, setPrescription] = useState("");
  const [background, setBackground] = useState({
    allergies: "",
    medical_background: "",
    family_background: "",
    birth_date: ""
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [signatureValid, setSignatureValid] = useState<boolean | null>(null);

  const load = useCallback(() => {
    invoke<EncounterDetail>("get_encounter", { encounterId })
      .then((data) => {
        setDetail(data);
        setNote(data.note ?? EMPTY_NOTE);
        setPrescription(data.prescription ?? "");
        setBackground({
          allergies: data.patient.allergies ?? "",
          medical_background: data.patient.medical_background ?? "",
          family_background: data.patient.family_background ?? "",
          birth_date: data.patient.birth_date ?? ""
        });
        if (data.encounter.status === "SIGNED") {
          invoke<boolean>("verify_signature", { encounterId })
            .then(setSignatureValid)
            .catch(() => setSignatureValid(null));
        }
      })
      .catch((e: unknown) => setError(String(e)));
  }, [encounterId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!detail) {
    return (
      <main className="container wide">
        {error ? <p className="error">{error}</p> : <p className="meta">Cargando encuentro…</p>}
      </main>
    );
  }

  const signed = detail.encounter.status === "SIGNED";

  async function run(label: string, action: () => Promise<unknown>) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await action();
      setMessage(label);
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function saveNote() {
    void run("Nota guardada (nueva version).", () =>
      invoke("save_note", { encounterId, note })
    );
  }

  function savePrescription() {
    void run("Receta guardada.", () =>
      invoke("save_prescription", { encounterId, content: prescription })
    );
  }

  function saveBackground() {
    void run("Antecedentes actualizados.", () =>
      invoke("update_patient_background", {
        patientId: detail!.patient.id,
        background: {
          allergies: background.allergies || null,
          medical_background: background.medical_background || null,
          family_background: background.family_background || null,
          birth_date: background.birth_date || null
        }
      })
    );
  }

  function sign() {
    const confirmed = window.confirm(
      "Al firmar, la nota y la receta quedan cerradas y no podran modificarse. ¿Firmar y cerrar la consulta?"
    );
    if (!confirmed) return;
    void run("Consulta firmada y cerrada.", () => invoke("sign_encounter", { encounterId }));
  }

  return (
    <main className="container wide">
      <header className="workspace-header">
        <div>
          <button className="secondary" onClick={onBack}>
            ← Agenda
          </button>
        </div>
        <div className="row">
          {signed ? (
            <span className="status status-confirmed">
              Firmada
              {signatureValid === true ? " · integridad verificada" : ""}
              {signatureValid === false ? " · ¡FIRMA NO COINCIDE!" : ""}
            </span>
          ) : (
            <button onClick={sign} disabled={busy || detail.note_version_count === 0}>
              Firmar y cerrar
            </button>
          )}
        </div>
      </header>

      <section className="card">
        <h2>
          {detail.patient.first_name} {detail.patient.last_name}
        </h2>
        <p className="meta">
          {detail.appointment_start
            ? dateTimeFormatter.format(new Date(detail.appointment_start))
            : "Sin cita asociada"}
          {detail.appointment_reason ? ` · Motivo: ${detail.appointment_reason}` : ""}
          {detail.patient.phone ? ` · Tel: ${detail.patient.phone}` : ""}
        </p>
        {detail.patient.allergies ? (
          <p className="alert-allergies">⚠ Alergias: {detail.patient.allergies}</p>
        ) : null}
      </section>

      {detail.precheckin ? (
        <section className="card">
          <h3>Preconsulta del paciente</h3>
          <dl className="precheckin-list">
            {formatPrecheckin(detail.precheckin).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {detail.history.length > 0 ? (
        <section className="card">
          <h3>Historial del paciente</h3>
          <ul className="history-list">
            {detail.history.map((entry) => (
              <li key={entry.encounter_id}>
                <span className="meta">
                  {entry.signed_at
                    ? dateTimeFormatter.format(new Date(entry.signed_at))
                    : "(sin firmar)"}
                </span>{" "}
                {entry.diagnosis || "Sin diagnostico registrado"}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card">
        <h3>Antecedentes</h3>
        <div className="stack">
          <label className="field-label">
            Alergias
            <input
              value={background.allergies}
              disabled={busy}
              onChange={(e) => setBackground((c) => ({ ...c, allergies: e.currentTarget.value }))}
            />
          </label>
          <label className="field-label">
            Antecedentes personales patologicos
            <textarea
              rows={2}
              value={background.medical_background}
              disabled={busy}
              onChange={(e) =>
                setBackground((c) => ({ ...c, medical_background: e.currentTarget.value }))
              }
            />
          </label>
          <label className="field-label">
            Antecedentes familiares
            <textarea
              rows={2}
              value={background.family_background}
              disabled={busy}
              onChange={(e) =>
                setBackground((c) => ({ ...c, family_background: e.currentTarget.value }))
              }
            />
          </label>
          <label className="field-label">
            Fecha de nacimiento
            <input
              type="date"
              value={background.birth_date}
              disabled={busy}
              onChange={(e) => setBackground((c) => ({ ...c, birth_date: e.currentTarget.value }))}
            />
          </label>
          <div>
            <button className="secondary" onClick={saveBackground} disabled={busy}>
              Guardar antecedentes
            </button>
          </div>
        </div>
      </section>

      <section className="card">
        <h3>
          Nota clinica (SOAP)
          {detail.note ? (
            <span className="meta"> · version {detail.note.version}</span>
          ) : null}
        </h3>
        <div className="stack">
          {NOTE_FIELDS.map(({ key, label, rows }) => (
            <label className="field-label" key={key}>
              {label}
              <textarea
                rows={rows}
                value={note[key]}
                disabled={busy || signed}
                onChange={(e) => setNote((c) => ({ ...c, [key]: e.currentTarget.value }))}
              />
            </label>
          ))}
          {!signed ? (
            <div>
              <button onClick={saveNote} disabled={busy}>
                Guardar nota
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <section className="card">
        <h3>Receta</h3>
        <div className="stack">
          <textarea
            rows={4}
            placeholder="Medicamento, dosis, via, frecuencia y duracion…"
            value={prescription}
            disabled={busy || signed}
            onChange={(e) => setPrescription(e.currentTarget.value)}
          />
          {!signed ? (
            <div>
              <button onClick={savePrescription} disabled={busy}>
                Guardar receta
              </button>
            </div>
          ) : null}
        </div>
      </section>

      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}

      {signed ? (
        <p className="meta footer-meta">
          Firmada el{" "}
          {detail.encounter.signed_at
            ? dateTimeFormatter.format(new Date(detail.encounter.signed_at))
            : ""}{" "}
          · huella {detail.encounter.signed_hash?.slice(0, 16)}…
        </p>
      ) : null}
    </main>
  );
}
