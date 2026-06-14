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
import { MedicationSafety } from "./MedicationSafety";
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

interface SoapDraft {
  run_id: string;
  provider: string;
  model_version: string;
  estimated_cost_cents: number;
  latency_ms: number;
  draft: Omit<NoteContent, "specialty"> & { specialty: unknown };
}

interface TextDraft {
  run_id: string;
  usage_type: string;
  provider: string;
  model_version: string;
  estimated_cost_cents: number;
  latency_ms: number;
  text: string;
}

interface TranscriptionDraft {
  run_id: string;
  usage_type: string;
  provider: string;
  model_version: string;
  estimated_cost_cents: number;
  latency_ms: number;
  transcript_text: string;
  audio_retention_policy: string;
}

interface UsageSummary {
  month: string;
  budget_cents: number;
  spent_cents: number;
  run_count: number;
  by_usage: Array<{ usage_type: string; run_count: number; cost_cents: number }>;
}

const TEXT_ASSIST_LABELS: Record<string, string> = {
  SOAP_ASSIST: "Borrador SOAP",
  LONGITUDINAL_SUMMARY: "Resumen longitudinal",
  PATIENT_INSTRUCTIONS: "Instrucciones al paciente",
  CLINICAL_GAPS: "Brechas clinicas"
};

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

const centsFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN"
});

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

type SectionId =
  | "preconsulta"
  | "historial"
  | "antecedentes"
  | "ia"
  | "nota"
  | "modulo"
  | "receta";

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
  const [aiConsent, setAiConsent] = useState(false);
  const [aiVoiceConsent, setAiVoiceConsent] = useState(false);
  const [aiDraft, setAiDraft] = useState<SoapDraft | null>(null);
  const [aiText, setAiText] = useState<TextDraft | null>(null);
  const [aiTranscription, setAiTranscription] = useState<TranscriptionDraft | null>(null);
  const [aiUsage, setAiUsage] = useState<UsageSummary | null>(null);
  const [budgetInput, setBudgetInput] = useState("");
  const [activeSection, setActiveSection] = useState<SectionId>("nota");

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
        call<boolean>("ai_consent_status", { patientId: data.patient.id })
          .then(setAiConsent)
          .catch(() => setAiConsent(false));
        call<boolean>("ai_voice_consent_status", { patientId: data.patient.id })
          .then(setAiVoiceConsent)
          .catch(() => setAiVoiceConsent(false));
        call<UsageSummary>("ai_usage_summary")
          .then(setAiUsage)
          .catch(() => setAiUsage(null));
      })
      .catch((e: unknown) => setError(String(e)));
  }, [encounterId, resolvedProfile]);

  const refreshUsage = useCallback(() => {
    call<UsageSummary>("ai_usage_summary").then(setAiUsage).catch(() => {});
  }, []);

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

  const moduleLabel =
    resolvedProfile === "ODONTOLOGY" ? "Modulo odontologico" : "Medicina general / familiar";

  const navItems: Array<{ id: SectionId; label: string }> = [];
  if (detail.precheckin) navItems.push({ id: "preconsulta", label: "Preconsulta" });
  if (detail.history.length > 0) navItems.push({ id: "historial", label: "Historial" });
  navItems.push({ id: "antecedentes", label: "Antecedentes" });
  if (!signed) navItems.push({ id: "ia", label: "Asistencia de IA" });
  navItems.push({ id: "nota", label: "Nota clinica (SOAP)" });
  navItems.push({ id: "modulo", label: moduleLabel });
  navItems.push({ id: "receta", label: "Receta" });

  // Si la seccion activa ya no existe (p. ej. la consulta se firmo y la IA
  // desaparecio), recae en la nota, que siempre esta presente.
  const resolvedSection: SectionId = navItems.some((item) => item.id === activeSection)
    ? activeSection
    : "nota";

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

  async function toggleConsent() {
    const command = aiConsent ? "ai_revoke_consent" : "ai_grant_consent";
    await run(
      aiConsent ? "Consentimiento de IA revocado." : "Consentimiento de IA registrado.",
      () => call(command, { patientId })
    );
  }

  async function toggleVoiceConsent() {
    const command = aiVoiceConsent ? "ai_revoke_voice_consent" : "ai_grant_voice_consent";
    await run(
      aiVoiceConsent
        ? "Consentimiento de transcripcion revocado."
        : "Consentimiento de transcripcion registrado.",
      () => call(command, { patientId })
    );
  }

  function generateAiDraft() {
    setBusy(true);
    setMessage("");
    setError("");
    setAiDraft(null);
    call<SoapDraft>("ai_assist_soap", { encounterId })
      .then((draft) => {
        setAiDraft(draft);
        setMessage("Borrador IA generado. Revisalo antes de usarlo.");
        refreshUsage();
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setBusy(false));
  }

  function useAiDraft() {
    if (!aiDraft) return;
    const d = aiDraft.draft;
    // Precarga el editor SOAP; NO guarda. El medico revisa y guarda manualmente.
    setNote((current) => ({
      ...current,
      subjective: d.subjective,
      objective: d.objective,
      assessment: d.assessment,
      plan: d.plan,
      diagnosis: d.diagnosis,
      instructions: d.instructions
    }));
    const runId = aiDraft.run_id;
    setAiDraft(null);
    setError("");
    // Cierra la traza sin recargar: el borrador vive en el editor (aun sin
    // guardar) y una recarga lo sobreescribiria con la nota persistida.
    call("ai_review_run", { runId, status: "APPROVED", feedback: null })
      .then(() => setMessage("Borrador aplicado al editor. Revisa, ajusta y guarda la nota."))
      .catch((e: unknown) => setError(String(e)));
  }

  function discardAiDraft() {
    if (!aiDraft) return;
    const runId = aiDraft.run_id;
    setAiDraft(null);
    void run("Borrador IA descartado.", () =>
      call("ai_review_run", { runId, status: "DISCARDED", feedback: null })
    );
  }

  function generateAiText(usageType: string) {
    setBusy(true);
    setMessage("");
    setError("");
    setAiText(null);
    call<TextDraft>("ai_assist_text", { encounterId, usageType })
      .then((draft) => {
        setAiText(draft);
        setMessage(`${TEXT_ASSIST_LABELS[usageType] ?? "Borrador"} generado. Revisalo antes de usarlo.`);
        refreshUsage();
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setBusy(false));
  }

  function useAiInstructions() {
    if (!aiText) return;
    const text = aiText.text;
    // Precarga el campo de indicaciones del editor; NO guarda.
    setNote((current) => ({ ...current, instructions: text }));
    const runId = aiText.run_id;
    setAiText(null);
    setError("");
    call("ai_review_run", { runId, status: "APPROVED", feedback: null })
      .then(() => setMessage("Indicaciones aplicadas al editor. Revisa, ajusta y guarda la nota."))
      .catch((e: unknown) => setError(String(e)));
  }

  function discardAiText() {
    if (!aiText) return;
    const runId = aiText.run_id;
    setAiText(null);
    void run("Borrador IA descartado.", () =>
      call("ai_review_run", { runId, status: "DISCARDED", feedback: null })
    );
  }

  function transcribeAudioFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setMessage("");
    setError("");
    setAiTranscription(null);
    fileToBase64(file)
      .then((audioBase64) =>
        call<TranscriptionDraft>("ai_transcribe_audio", {
          encounterId,
          audio: {
            fileName: file.name,
            mediaType: file.type || "audio/webm",
            audioBase64,
            durationSeconds: null
          }
        })
      )
      .then((draft) => {
        setAiTranscription(draft);
        setMessage("Transcripcion generada. Revisala antes de usarla.");
        refreshUsage();
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setBusy(false));
  }

  function useAiTranscription() {
    if (!aiTranscription) return;
    const text = `Transcripcion de consulta (borrador IA):\n${aiTranscription.transcript_text}`;
    setNote((current) => ({
      ...current,
      subjective: current.subjective ? `${current.subjective}\n\n${text}` : text
    }));
    const runId = aiTranscription.run_id;
    setAiTranscription(null);
    setError("");
    call("ai_review_run", { runId, status: "APPROVED", feedback: null })
      .then(() => setMessage("Transcripcion aplicada al editor. Revisa, ajusta y guarda la nota."))
      .catch((e: unknown) => setError(String(e)));
  }

  function discardAiTranscription() {
    if (!aiTranscription) return;
    const runId = aiTranscription.run_id;
    setAiTranscription(null);
    void run("Transcripcion descartada.", () =>
      call("ai_review_run", { runId, status: "DISCARDED", feedback: null })
    );
  }

  function saveBudget() {
    const pesos = Number(budgetInput);
    if (!Number.isFinite(pesos) || pesos < 0) return;
    const budgetCents = Math.round(pesos * 100);
    setBudgetInput("");
    void run("Presupuesto mensual de IA actualizado.", async () => {
      await call("ai_set_budget", { budgetCents });
      refreshUsage();
    });
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

      <div className="content encounter-content">
        <section className="panel patient-banner">
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

        <div className="encounter-layout">
          <nav className="encounter-nav" aria-label="Secciones de la consulta">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={resolvedSection === item.id ? "nav-item nav-item-active" : "nav-item"}
                aria-current={resolvedSection === item.id ? "page" : undefined}
                onClick={() => setActiveSection(item.id)}
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

            {resolvedSection === "preconsulta" && detail.precheckin ? (
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

            {resolvedSection === "historial" && detail.history.length > 0 ? (
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

            {resolvedSection === "antecedentes" ? (
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
            ) : null}

            {resolvedSection === "ia" && !signed ? (
          <section className="panel">
            <div className="panel-header">
              <h3>Asistencia de IA</h3>
              <p>
                La IA propone borradores a partir del expediente. Son solo un punto de
                partida: tu los revisas, editas y guardas. Nada se guarda sin tu revision,
                y el contenido se seudonimiza antes de procesarse.
              </p>
            </div>
            <div className="button-row">
              <span className={aiConsent ? "pill pill-success" : "pill pill-muted"}>
                {aiConsent ? "Texto autorizado" : "Texto sin consentimiento"}
              </span>
              <button className="ghost-button" onClick={() => void toggleConsent()} disabled={busy}>
                {aiConsent ? "Revocar texto" : "Autorizar texto"}
              </button>
              <span className={aiVoiceConsent ? "pill pill-success" : "pill pill-muted"}>
                {aiVoiceConsent ? "Voz autorizada" : "Voz sin consentimiento"}
              </span>
              <button className="ghost-button" onClick={() => void toggleVoiceConsent()} disabled={busy}>
                {aiVoiceConsent ? "Revocar voz" : "Autorizar voz"}
              </button>
            </div>

            {aiUsage ? (
              <p className="meta">
                Uso de IA en {aiUsage.month}: {centsFormatter.format(aiUsage.spent_cents / 100)}
                {aiUsage.budget_cents > 0
                  ? ` de ${centsFormatter.format(aiUsage.budget_cents / 100)}`
                  : " · sin limite mensual"}{" "}
                · {aiUsage.run_count} ejecucion(es)
              </p>
            ) : null}
            <div className="button-row">
              <label className="field">
                <span>Presupuesto mensual (MXN, 0 = sin limite)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={budgetInput}
                  disabled={busy}
                  onChange={(e) => setBudgetInput(e.currentTarget.value)}
                />
              </label>
              <button className="ghost-button" onClick={saveBudget} disabled={busy || budgetInput === ""}>
                Guardar presupuesto
              </button>
            </div>

            <div className="button-row">
              <button
                className="action-button"
                onClick={generateAiDraft}
                disabled={busy || !aiConsent}
              >
                Borrador SOAP
              </button>
              <button
                className="ghost-button"
                onClick={() => generateAiText("LONGITUDINAL_SUMMARY")}
                disabled={busy || !aiConsent}
              >
                Resumen longitudinal
              </button>
              <button
                className="ghost-button"
                onClick={() => generateAiText("PATIENT_INSTRUCTIONS")}
                disabled={busy || !aiConsent}
              >
                Instrucciones al paciente
              </button>
              <button
                className="ghost-button"
                onClick={() => generateAiText("CLINICAL_GAPS")}
                disabled={busy || !aiConsent}
              >
                Brechas clinicas
              </button>
            </div>

            <div className="button-row">
              <label className="field">
                <span>Audio de consulta</span>
                <input
                  type="file"
                  accept="audio/*"
                  disabled={busy || !aiVoiceConsent}
                  onChange={(e) => {
                    transcribeAudioFile(e.currentTarget.files?.[0] ?? null);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
              <span className="meta">Retencion: descarte inmediato del audio.</span>
            </div>

            {aiTranscription ? (
              <div className="ai-draft">
                <p className="meta">
                  Transcripcion · proveedor {aiTranscription.provider} · modelo{" "}
                  {aiTranscription.model_version} · costo estimado{" "}
                  {centsFormatter.format(aiTranscription.estimated_cost_cents / 100)} ·{" "}
                  {aiTranscription.latency_ms} ms
                </p>
                <p className="ai-draft-text">{aiTranscription.transcript_text}</p>
                <div className="button-row">
                  <button className="action-button" onClick={useAiTranscription} disabled={busy}>
                    Usar en subjetivo
                  </button>
                  <button className="ghost-button" onClick={discardAiTranscription} disabled={busy}>
                    Descartar
                  </button>
                </div>
              </div>
            ) : null}

            {aiText ? (
              <div className="ai-draft">
                <p className="meta">
                  {TEXT_ASSIST_LABELS[aiText.usage_type] ?? "Borrador"} · proveedor{" "}
                  {aiText.provider} · modelo {aiText.model_version} · costo estimado{" "}
                  {centsFormatter.format(aiText.estimated_cost_cents / 100)} · {aiText.latency_ms} ms
                </p>
                <p className="ai-draft-text">{aiText.text}</p>
                <div className="button-row">
                  {aiText.usage_type === "PATIENT_INSTRUCTIONS" ? (
                    <button className="action-button" onClick={useAiInstructions} disabled={busy}>
                      Usar en indicaciones
                    </button>
                  ) : null}
                  <button className="ghost-button" onClick={discardAiText} disabled={busy}>
                    Descartar
                  </button>
                </div>
              </div>
            ) : null}

            {aiDraft ? (
              <div className="ai-draft">
                <p className="meta">
                  Proveedor {aiDraft.provider} · modelo {aiDraft.model_version} · costo estimado{" "}
                  {centsFormatter.format(aiDraft.estimated_cost_cents / 100)} · {aiDraft.latency_ms} ms
                </p>
                <div className="stack">
                  {NOTE_FIELDS.map(({ key, label }) => {
                    const value = aiDraft.draft[key];
                    if (!value) return null;
                    return (
                      <div className="field" key={key}>
                        <span>{label}</span>
                        <p className="ai-draft-text">{value}</p>
                      </div>
                    );
                  })}
                </div>
                <div className="button-row">
                  <button className="action-button" onClick={useAiDraft} disabled={busy}>
                    Usar borrador en el editor
                  </button>
                  <button className="ghost-button" onClick={discardAiDraft} disabled={busy}>
                    Descartar
                  </button>
                </div>
              </div>
            ) : null}
          </section>
            ) : null}

            {resolvedSection === "nota" ? (
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
            ) : null}

            {resolvedSection === "modulo" ? (
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
            ) : null}

            {resolvedSection === "receta" ? (
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
          <MedicationSafety encounterId={encounterId} disabled={signed} prescription={prescription} />
        </section>
            ) : null}

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
        </div>
      </div>
    </>
  );
}
