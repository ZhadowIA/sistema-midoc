import { useCallback, useEffect, useState } from "react";
import { DentalNoteEditor } from "./DentalNoteEditor";
import {
  coerceClinicalProfile,
  coerceDentalPayload,
  coerceGeneralMedicinePayload,
  type ClinicalProfile,
  EMPTY_DENTAL_PAYLOAD,
  EMPTY_GENERAL_MEDICINE_PAYLOAD,
  GENERAL_MEDICINE_FIELDS,
  type DentalPayload,
  type GeneralMedicinePayload
} from "./clinicalProfiles";
import { call } from "./ipc";

type SpecialtyPayload = GeneralMedicinePayload | DentalPayload;

interface NoteContent {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  diagnosis: string;
  instructions: string;
  specialty: SpecialtyPayload;
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
  note: (Omit<NoteContent, "specialty"> & {
    specialty: unknown;
    version: number;
    created_at: string;
  }) | null;
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
  instructions: "",
  specialty: EMPTY_GENERAL_MEDICINE_PAYLOAD
};

const NOTE_FIELDS: Array<{ key: keyof Omit<NoteContent, "specialty">; label: string; rows: number }> = [
  { key: "subjective", label: "S · Subjetivo (lo que refiere el paciente)", rows: 3 },
  { key: "objective", label: "O · Objetivo (exploracion y hallazgos)", rows: 3 },
  { key: "assessment", label: "A · Analisis", rows: 2 },
  { key: "diagnosis", label: "Diagnostico", rows: 2 },
  { key: "plan", label: "P · Plan", rows: 3 },
  { key: "instructions", label: "Indicaciones al paciente", rows: 3 }
];

function createEmptyNote(clinicalProfile: ClinicalProfile): NoteContent {
  return {
    ...EMPTY_NOTE,
    specialty:
      clinicalProfile === "ODONTOLOGY"
        ? structuredClone(EMPTY_DENTAL_PAYLOAD)
        : structuredClone(EMPTY_GENERAL_MEDICINE_PAYLOAD)
  };
}

function coerceSpecialtyPayload(
  clinicalProfile: ClinicalProfile,
  value: unknown
): SpecialtyPayload {
  return clinicalProfile === "ODONTOLOGY"
    ? coerceDentalPayload(value)
    : coerceGeneralMedicinePayload(value);
}

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
  clinicalProfile,
  onBack
}: {
  encounterId: string;
  clinicalProfile: ClinicalProfile;
  onBack: () => void;
}) {
  const resolvedProfile = coerceClinicalProfile(clinicalProfile);
  const [detail, setDetail] = useState<EncounterDetail | null>(null);
  const [note, setNote] = useState<NoteContent>(createEmptyNote(resolvedProfile));
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
    call<EncounterDetail>("get_encounter", { encounterId })
      .then((data) => {
        setDetail(data);
        setNote(
          data.note
            ? {
                ...data.note,
                specialty: coerceSpecialtyPayload(resolvedProfile, data.note.specialty)
              }
            : createEmptyNote(resolvedProfile)
        );
        setPrescription(data.prescription ?? "");
        setBackground({
          allergies: data.patient.allergies ?? "",
          medical_background: data.patient.medical_background ?? "",
          family_background: data.patient.family_background ?? "",
          birth_date: data.patient.birth_date ?? ""
        });
        if (data.encounter.status === "SIGNED") {
          call<boolean>("verify_signature", { encounterId })
            .then(setSignatureValid)
            .catch(() => setSignatureValid(null));
        } else {
          setSignatureValid(null);
        }
      })
      .catch((e: unknown) => setError(String(e)));
  }, [encounterId, resolvedProfile]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setNote((current) => ({
      ...current,
      specialty: coerceSpecialtyPayload(resolvedProfile, current.specialty)
    }));
  }, [resolvedProfile]);

  if (!detail) {
    return (
      <div className="content">
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : (
          <p className="meta">Cargando encuentro…</p>
        )}
      </div>
    );
  }

  const signed = detail.encounter.status === "SIGNED";
  const patientId = detail.patient.id;

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
    void run("Nota guardada (nueva version).", () => call("save_note", { encounterId, note }));
  }

  function savePrescription() {
    void run("Receta guardada.", () =>
      call("save_prescription", { encounterId, content: prescription })
    );
  }

  function saveBackground() {
    void run("Antecedentes actualizados.", () =>
      call("update_patient_background", {
        patientId,
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
    void run("Consulta firmada y cerrada.", () => call("sign_encounter", { encounterId }));
  }

  return (
    <>
      <header className="app-topbar">
        <button className="ghost-button" onClick={onBack}>
          ← Agenda
        </button>
        <span className="topbar-context">
          {resolvedProfile === "ODONTOLOGY" ? "Consulta odontologica" : "Consulta en curso"}
        </span>
        {signed ? (
          <span
            className={
              signatureValid === false ? "signature-banner invalid" : "signature-banner"
            }
          >
            {signatureValid === false
              ? "¡La firma no coincide con el contenido!"
              : "Consulta firmada"}
          </span>
        ) : (
          <button
            className="action-button"
            onClick={sign}
            disabled={busy || detail.note_version_count === 0}
          >
            Firmar y cerrar
          </button>
        )}
      </header>

      <div className="content">
        <section className="panel">
          <div className="panel-header">
            <h2>
              {detail.patient.first_name} {detail.patient.last_name}
            </h2>
            <p>
              {detail.appointment_start
                ? dateTimeFormatter.format(new Date(detail.appointment_start))
                : "Sin cita asociada"}
              {detail.appointment_reason ? ` · Motivo: ${detail.appointment_reason}` : ""}
              {detail.patient.phone ? ` · Tel: ${detail.patient.phone}` : ""}
            </p>
          </div>
          <div className="button-row">
            <span className="pill pill-warning">
              {resolvedProfile === "ODONTOLOGY"
                ? "Perfil odontologia"
                : "Perfil medicina general"}
            </span>
            {detail.note ? <span className="meta">Version actual: {detail.note.version}</span> : null}
          </div>
          {detail.patient.allergies ? (
            <p className="alert-allergies">Alergias: {detail.patient.allergies}</p>
          ) : null}
        </section>

        {detail.precheckin ? (
          <section className="panel">
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
          <section className="panel">
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

        <section className="panel">
          <h3>Antecedentes</h3>
          <div className="stack">
            <label className="field">
              <span>Alergias</span>
              <input
                value={background.allergies}
                disabled={busy}
                onChange={(e) => setBackground((current) => ({ ...current, allergies: e.target.value }))}
              />
            </label>
            <label className="field">
              <span>Antecedentes personales patologicos</span>
              <textarea
                rows={2}
                value={background.medical_background}
                disabled={busy}
                onChange={(e) =>
                  setBackground((current) => ({
                    ...current,
                    medical_background: e.target.value
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Antecedentes familiares</span>
              <textarea
                rows={2}
                value={background.family_background}
                disabled={busy}
                onChange={(e) =>
                  setBackground((current) => ({
                    ...current,
                    family_background: e.target.value
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Fecha de nacimiento</span>
              <input
                type="date"
                value={background.birth_date}
                disabled={busy}
                onChange={(e) => setBackground((current) => ({ ...current, birth_date: e.target.value }))}
              />
            </label>
            <div className="button-row">
              <button className="ghost-button" onClick={saveBackground} disabled={busy}>
                Guardar antecedentes
              </button>
            </div>
          </div>
        </section>

        <section className="panel">
          <h3>Nota clinica (SOAP)</h3>
          <div className="stack">
            {NOTE_FIELDS.map(({ key, label, rows }) => (
              <label className="field" key={key}>
                <span>{label}</span>
                <textarea
                  rows={rows}
                  value={note[key]}
                  disabled={busy || signed}
                  onChange={(e) => setNote((current) => ({ ...current, [key]: e.target.value }))}
                />
              </label>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <h3>
              {resolvedProfile === "ODONTOLOGY"
                ? "Modulo odontologico"
                : "Medicina general / familiar"}
            </h3>
            <p>
              {resolvedProfile === "ODONTOLOGY"
                ? "Odontograma, periodontograma, condiciones bucales, plan dental e higiene."
                : "Plantilla de consulta general. Se guarda y firma junto con la nota."}
            </p>
          </div>
          {resolvedProfile === "ODONTOLOGY" ? (
            <DentalNoteEditor
              payload={coerceDentalPayload(note.specialty)}
              disabled={busy || signed}
              onChange={(specialty) => setNote((current) => ({ ...current, specialty }))}
            />
          ) : (
            <div className="stack">
              {GENERAL_MEDICINE_FIELDS.map(({ key, label, rows }) => (
                <label className="field" key={key}>
                  <span>{label}</span>
                  <textarea
                    rows={rows}
                    value={coerceGeneralMedicinePayload(note.specialty)[key]}
                    disabled={busy || signed}
                    onChange={(e) =>
                      setNote((current) => ({
                        ...current,
                        specialty: {
                          ...coerceGeneralMedicinePayload(current.specialty),
                          [key]: e.target.value
                        }
                      }))
                    }
                  />
                </label>
              ))}
            </div>
          )}
          {!signed ? (
            <div className="button-row">
              <button className="action-button" onClick={saveNote} disabled={busy}>
                Guardar nota y plantilla
              </button>
            </div>
          ) : null}
        </section>

        <section className="panel">
          <h3>Receta</h3>
          <div className="stack">
            <textarea
              rows={4}
              placeholder="Medicamento, dosis, via, frecuencia y duracion…"
              value={prescription}
              disabled={busy || signed}
              onChange={(e) => setPrescription(e.target.value)}
            />
            {!signed ? (
              <div className="button-row">
                <button className="action-button" onClick={savePrescription} disabled={busy}>
                  Guardar receta
                </button>
              </div>
            ) : null}
          </div>
        </section>

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

        {signed ? (
          <p className="footer-meta">
            Firmada el{" "}
            {detail.encounter.signed_at
              ? dateTimeFormatter.format(new Date(detail.encounter.signed_at))
              : ""}{" "}
            · huella {detail.encounter.signed_hash?.slice(0, 16)}…
          </p>
        ) : null}
      </div>
    </>
  );
}
