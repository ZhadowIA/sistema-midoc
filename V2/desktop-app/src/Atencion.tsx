import { useCallback, useEffect, useRef, useState } from "react";
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
import { createRecordedWavFile } from "./consultationRecorder";
import {
  appendSegmentToNote,
  buildTemplateSegments,
  formatSourceTurnReferences,
  normalizeTemplateDefinition,
  transcriptToTurns,
  type ConsultationTurn,
  type SegmentDraft,
  type ScribeSpeaker,
  type TemplateDefinition,
  type TemplateSegment
} from "./consultationScribe";
import { MedicationSafety } from "./MedicationSafety";
import { EncounterAgendaRail } from "./EncounterAgendaRail";
import { call } from "./ipc";
import { allergyText, buildContextHistory, isFirstVisit } from "./encounterContext";
import {
  hasEncounterDraftChanges,
  shouldConfirmEncounterSwitch,
  type EncounterAgendaAppointment
} from "./encounterAgenda";
import {
  buildEncounterModes,
  resolveActiveSection,
  type EncounterSectionId as SectionId
} from "./encounterModes";
import { buildBackgroundReview } from "./precheckinBackground";
import {
  flattenMedicalHistoryDisplayRows,
  formatMedicalHistoryForDisplay,
  type MedicalHistoryGroup
} from "./medicalHistoryFormat";

type SpecialtyPayload = GeneralMedicinePayload | DentalPayload;
type RecordingState = "idle" | "recording" | "stopping";

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
    appointment_id: string | null;
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

interface ConsultationStructuringDraft {
  run_id: string;
  usage_type: "CONSULTATION_STRUCTURING";
  provider: string;
  model_version: string;
  estimated_cost_cents: number;
  latency_ms: number;
  segments: SegmentDraft[];
  missing: string[];
  warnings: string[];
}

interface StoredConsultationTemplate extends TemplateDefinition {
  name: string;
  clinical_profile: ClinicalProfile;
  created_at?: string | null;
  updated_at?: string | null;
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

function noteFromStoredDetail(
  storedNote: EncounterDetail["note"],
  clinicalProfile: ClinicalProfile
): NoteContent {
  return storedNote
    ? {
        subjective: storedNote.subjective,
        objective: storedNote.objective,
        assessment: storedNote.assessment,
        plan: storedNote.plan,
        diagnosis: storedNote.diagnosis,
        instructions: storedNote.instructions,
        specialty: coerceSpecialtyPayload(clinicalProfile, storedNote.specialty)
      }
    : createEmptyNote(clinicalProfile);
}

const dateTimeFormatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short"
});

function formatRecordingDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`;
}

type AiConversationTurn = { question?: string; answer?: string };

function createTemplateDraft(profile: ClinicalProfile): StoredConsultationTemplate {
  const base = buildTemplateSegments(profile);
  return {
    id: `custom-${profile.toLowerCase().replace(/_/g, "-")}-${Date.now()}`,
    name: profile === "ODONTOLOGY" ? "Plantilla odontologica personalizada" : "Plantilla general personalizada",
    clinical_profile: profile,
    segments: base.segments.map((segment) => ({ ...segment }))
  };
}

/**
 * Aplana la preconsulta a pares legibles. Soporta el formato plano (placeholder
 * de la rebanada 6), el de antecedentes anidado (rebanada 7) y el resultado de
 * la preconsulta guiada por IA (rebanada 8: motivo + conversacion Q&A).
 */
function formatPrecheckin(raw: string): Array<[string, string]> {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    // Resultado de la IA: motivo + lista de preguntas/respuestas.
    if (Array.isArray(parsed.conversation)) {
      const rows: Array<[string, string]> = [];
      const motivo = String(parsed.motivo ?? "").trim();
      if (motivo) rows.push(["Motivo", motivo]);
      (parsed.conversation as AiConversationTurn[]).forEach((turn, index) => {
        const question = String(turn.question ?? "").trim();
        const answer = String(turn.answer ?? "").trim();
        if (question || answer) rows.push([question || `Pregunta ${index + 1}`, answer]);
      });
      return rows;
    }

    return flattenMedicalHistoryDisplayRows(raw);
  } catch {
    return [["respuestas", raw]];
  }
}

function MedicalHistoryGroups({ groups }: { groups: MedicalHistoryGroup[] }) {
  return (
    <div className="medical-history-groups">
      {groups.map((group) => (
        <section key={group.key} className="medical-history-group">
          <h4>{group.title}</h4>
          <dl className="precheckin-list">
            {group.rows.map((row) => (
              <div key={`${group.key}-${row.label}`}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

export function Atencion({
  encounterId,
  clinicalProfile,
  appointments,
  appointmentSelectionBusy,
  onBack,
  onSelectAppointment
}: {
  encounterId: string;
  clinicalProfile: ClinicalProfile;
  appointments: EncounterAgendaAppointment[];
  appointmentSelectionBusy: boolean;
  onBack: () => void;
  onSelectAppointment: (appointmentId: string) => void;
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
  const [aiScribeConsent, setAiScribeConsent] = useState(false);
  const [aiDraft, setAiDraft] = useState<SoapDraft | null>(null);
  const [aiText, setAiText] = useState<TextDraft | null>(null);
  const [aiTranscription, setAiTranscription] = useState<TranscriptionDraft | null>(null);
  const [scribeTurns, setScribeTurns] = useState<ConsultationTurn[]>([]);
  const [scribeDraft, setScribeDraft] = useState<ConsultationStructuringDraft | null>(null);
  const [appliedScribeSegments, setAppliedScribeSegments] = useState<string[]>([]);
  const [consultationTemplates, setConsultationTemplates] = useState<StoredConsultationTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("default");
  const [templateEditor, setTemplateEditor] = useState<StoredConsultationTemplate | null>(null);
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingError, setRecordingError] = useState("");
  const [useCloudTranscription, setUseCloudTranscription] = useState(false);
  const [aiUsage, setAiUsage] = useState<UsageSummary | null>(null);
  const [budgetInput, setBudgetInput] = useState("");
  const [activeSection, setActiveSection] = useState<SectionId>("nota");
  const [backgroundReviewDismissed, setBackgroundReviewDismissed] = useState(false);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const recorderNodeRef = useRef<ScriptProcessorNode | null>(null);
  const recorderChunksRef = useRef<Float32Array[]>([]);
  const recordingStartedAtRef = useRef<number>(0);
  const recordingTimerRef = useRef<number | null>(null);
  const initialSectionSetRef = useRef(false);

  const load = useCallback(() => {
    call<EncounterDetail>("get_encounter", { encounterId })
      .then((data) => {
        setDetail(data);
        setNote(noteFromStoredDetail(data.note, resolvedProfile));
        setPrescription(data.prescription ?? "");
        setBackground({
          allergies: data.patient.allergies ?? "",
          medical_background: data.patient.medical_background ?? "",
          family_background: data.patient.family_background ?? "",
          birth_date: data.patient.birth_date ?? ""
        });
        if (data.precheckin && !initialSectionSetRef.current) {
          initialSectionSetRef.current = true;
          setActiveSection("preconsulta");
        }
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
        call<boolean>("ai_scribe_consent_status", { patientId: data.patient.id })
          .then(setAiScribeConsent)
          .catch(() => setAiScribeConsent(false));
        call<UsageSummary>("ai_usage_summary")
          .then(setAiUsage)
          .catch(() => setAiUsage(null));
        call<StoredConsultationTemplate[]>("list_consultation_templates")
          .then((templates) =>
            setConsultationTemplates(
              templates.map((template) => ({
                ...template,
                clinical_profile: coerceClinicalProfile(template.clinical_profile),
                ...normalizeTemplateDefinition(template, coerceClinicalProfile(template.clinical_profile))
              }))
            )
          )
          .catch(() => setConsultationTemplates([]));
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
    setSelectedTemplateId("default");
    setTemplateEditor(null);
  }, [resolvedProfile]);

  useEffect(() => () => cleanupRecording(), []);

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
  const currentAppointmentId = detail.encounter.appointment_id;
  const persistedDraft = {
    note: noteFromStoredDetail(detail.note, resolvedProfile),
    prescription: detail.prescription ?? "",
    background: {
      allergies: detail.patient.allergies ?? "",
      medical_background: detail.patient.medical_background ?? "",
      family_background: detail.patient.family_background ?? "",
      birth_date: detail.patient.birth_date ?? ""
    }
  };
  const hasUnsavedChanges = hasEncounterDraftChanges(
    { note, prescription, background },
    persistedDraft
  );
  const backgroundReview = buildBackgroundReview(background, detail.precheckin);
  const medicalHistoryGroups = formatMedicalHistoryForDisplay(detail.precheckin);
  const showBackgroundReview =
    Boolean(backgroundReview?.hasImportableChanges) && !backgroundReviewDismissed && !signed;

  const moduleLabel =
    resolvedProfile === "ODONTOLOGY" ? "Modulo odontologico" : "Medicina general / familiar";
  const defaultTemplate = buildTemplateSegments(resolvedProfile);
  const profileTemplates = consultationTemplates
    .filter((template) => template.clinical_profile === resolvedProfile)
    .map((template) => ({
      ...template,
      ...normalizeTemplateDefinition(template, resolvedProfile)
    }));
  const selectedCustomTemplate = profileTemplates.find((template) => template.id === selectedTemplateId);
  const activeTemplate = selectedCustomTemplate ?? defaultTemplate;
  const activeTemplateName =
    selectedCustomTemplate?.name ?? (resolvedProfile === "ODONTOLOGY" ? "SOAP odontologia" : "SOAP general");
  const targetOptions = defaultTemplate.segments.map((segment) => ({
    target: segment.target,
    label: segment.label
  }));
  const segmentLabels = new Map(activeTemplate.segments.map((segment) => [segment.id, segment.label]));

  const navItems = buildEncounterModes({
    hasPrecheckin: Boolean(detail.precheckin),
    hasHistory: detail.history.length > 0,
    signed,
    moduleLabel
  });

  const resolvedSection = resolveActiveSection(navItems, activeSection);

  function selectAgendaAppointment(appointmentId: string) {
    const needsConfirmation = shouldConfirmEncounterSwitch({
      currentAppointmentId,
      targetAppointmentId: appointmentId,
      signed,
      hasUnsavedChanges
    });
    if (
      needsConfirmation &&
      !window.confirm(
        hasUnsavedChanges
          ? "Hay cambios sin guardar en esta consulta. Si cambias de paciente se perderán. ¿Continuar?"
          : "La consulta actual sigue abierta y sin firmar. ¿Cambiar de paciente de todos modos?"
      )
    ) {
      return;
    }
    onSelectAppointment(appointmentId);
  }

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

  function importPrecheckinBackground() {
    if (!backgroundReview) return;
    const nextBackground = {
      ...background,
      allergies: backgroundReview.incoming.allergies || background.allergies,
      medical_background:
        backgroundReview.incoming.medical_background || background.medical_background,
      family_background:
        backgroundReview.incoming.family_background || background.family_background
    };
    setBackground(nextBackground);
    setBackgroundReviewDismissed(true);
    void run("Antecedentes importados desde el cuestionario.", () =>
      call("update_patient_background", {
        patientId,
        background: {
          allergies: nextBackground.allergies || null,
          medical_background: nextBackground.medical_background || null,
          family_background: nextBackground.family_background || null,
          birth_date: nextBackground.birth_date || null
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

  async function toggleScribeConsent() {
    const command = aiScribeConsent ? "ai_revoke_scribe_consent" : "ai_grant_scribe_consent";
    await run(
      aiScribeConsent
        ? "Consentimiento de escriba revocado."
        : "Consentimiento de escriba registrado.",
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
    setScribeDraft(null);
    setAppliedScribeSegments([]);
    fileToBase64(file)
      .then((audioBase64) =>
        call<TranscriptionDraft>("ai_transcribe_audio", {
          encounterId,
          audio: {
            fileName: file.name,
            mediaType: file.type || "audio/wav",
            audioBase64,
            durationSeconds: null
          },
          useCloud: useCloudTranscription
        })
      )
      .then((draft) => {
        setAiTranscription(draft);
        setScribeTurns(transcriptToTurns(draft.transcript_text));
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
    setScribeTurns([]);
    setScribeDraft(null);
    setAppliedScribeSegments([]);
    void run("Transcripcion descartada.", () =>
      call("ai_review_run", { runId, status: "DISCARDED", feedback: null })
    );
  }

  function updateScribeTurn(id: string, patch: Partial<Pick<ConsultationTurn, "speaker" | "text">>) {
    setScribeTurns((current) =>
      current.map((turn) => (turn.id === id ? { ...turn, ...patch } : turn))
    );
  }

  function startNewTemplate() {
    setTemplateEditor(createTemplateDraft(resolvedProfile));
  }

  function editSelectedTemplate() {
    const selected = profileTemplates.find((template) => template.id === selectedTemplateId);
    if (selected) {
      setTemplateEditor({
        ...selected,
        segments: selected.segments.map((segment) => ({ ...segment }))
      });
    }
  }

  function updateTemplateSegment(index: number, patch: Partial<TemplateSegment>) {
    setTemplateEditor((current) => {
      if (!current) return current;
      return {
        ...current,
        segments: current.segments.map((segment, position) =>
          position === index ? { ...segment, ...patch } : segment
        )
      };
    });
  }

  function addTemplateSegment() {
    const target = targetOptions[0]?.target ?? "subjective";
    setTemplateEditor((current) => {
      if (!current) return current;
      return {
        ...current,
        segments: [
          ...current.segments,
          {
            id: `segment_${current.segments.length + 1}`,
            label: "Nuevo segmento",
            target,
            instructions: "",
            required: false
          }
        ]
      };
    });
  }

  function removeTemplateSegment(index: number) {
    setTemplateEditor((current) =>
      current
        ? {
            ...current,
            segments: current.segments.filter((_, position) => position !== index)
          }
        : current
    );
  }

  function saveTemplateEditor() {
    if (!templateEditor) return;
    const normalized = normalizeTemplateDefinition(templateEditor, resolvedProfile);
    const payload: StoredConsultationTemplate = {
      ...templateEditor,
      id: normalized.id,
      name: templateEditor.name.trim(),
      clinical_profile: resolvedProfile,
      segments: normalized.segments
    };
    if (!payload.name) {
      setError("La plantilla necesita nombre.");
      return;
    }
    void run("Plantilla guardada localmente.", async () => {
      const saved = await call<StoredConsultationTemplate>("save_consultation_template", {
        template: payload
      });
      const normalizedSaved: StoredConsultationTemplate = {
        ...saved,
        clinical_profile: coerceClinicalProfile(saved.clinical_profile),
        ...normalizeTemplateDefinition(saved, coerceClinicalProfile(saved.clinical_profile))
      };
      setConsultationTemplates((current) => [
        ...current.filter((template) => template.id !== normalizedSaved.id),
        normalizedSaved
      ]);
      setSelectedTemplateId(normalizedSaved.id);
      setTemplateEditor(null);
    });
  }

  function deleteSelectedTemplate() {
    const selected = profileTemplates.find((template) => template.id === selectedTemplateId);
    if (!selected) return;
    void run("Plantilla eliminada localmente.", async () => {
      await call("delete_consultation_template", { id: selected.id });
      setConsultationTemplates((current) => current.filter((template) => template.id !== selected.id));
      setSelectedTemplateId("default");
      setTemplateEditor(null);
    });
  }

  function structureConsultation() {
    const turns = scribeTurns.filter((turn) => turn.text.trim());
    if (turns.length === 0) return;
    setBusy(true);
    setMessage("");
    setError("");
    setScribeDraft(null);
    setAppliedScribeSegments([]);
    call<ConsultationStructuringDraft>("ai_structure_consultation", {
      encounterId,
      turns,
      template: activeTemplate
    })
      .then((draft) => {
        setScribeDraft(draft);
        setMessage("Acomodo por plantilla generado. Revisa cada segmento antes de aplicarlo.");
        refreshUsage();
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setBusy(false));
  }

  function cleanupRecording() {
    if (recordingTimerRef.current !== null) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    recorderNodeRef.current?.disconnect();
    audioSourceRef.current?.disconnect();
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    void audioContextRef.current?.close().catch(() => {});
    recorderNodeRef.current = null;
    audioSourceRef.current = null;
    mediaStreamRef.current = null;
    audioContextRef.current = null;
    recordingStartedAtRef.current = 0;
  }

  async function startConsultationRecording() {
    if (recordingState !== "idle" || busy || !aiVoiceConsent) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setRecordingError("Este equipo no expone acceso al microfono en la app.");
      return;
    }

    const AudioContextCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      setRecordingError("Este equipo no permite capturar audio desde la app.");
      return;
    }

    try {
      setRecordingError("");
      setRecordingSeconds(0);
      recorderChunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      const context = new AudioContextCtor();
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (event) => {
        const input = event.inputBuffer.getChannelData(0);
        recorderChunksRef.current.push(new Float32Array(input));
        const output = event.outputBuffer.getChannelData(0);
        output.fill(0);
      };

      source.connect(processor);
      processor.connect(context.destination);
      mediaStreamRef.current = stream;
      audioContextRef.current = context;
      audioSourceRef.current = source;
      recorderNodeRef.current = processor;
      recordingStartedAtRef.current = Date.now();
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds(Math.floor((Date.now() - recordingStartedAtRef.current) / 1000));
      }, 500);
      setRecordingState("recording");
    } catch (e) {
      cleanupRecording();
      setRecordingState("idle");
      setRecordingError(String(e));
    }
  }

  function stopConsultationRecording() {
    if (recordingState !== "recording") return;
    setRecordingState("stopping");
    const inputSampleRate = audioContextRef.current?.sampleRate ?? 48_000;
    const chunks = recorderChunksRef.current.slice();
    cleanupRecording();
    setRecordingSeconds(0);
    try {
      const file = createRecordedWavFile(chunks, inputSampleRate);
      setMessage("Grabacion capturada. Transcribiendo audio temporal.");
      transcribeAudioFile(file);
    } catch (e) {
      setRecordingError(String(e));
    } finally {
      setRecordingState("idle");
    }
  }

  function applyScribeSegment(segment: SegmentDraft) {
    setNote((current) => appendSegmentToNote(current, segment, activeTemplate));
    setAppliedScribeSegments((current) =>
      current.includes(segment.segment_id) ? current : [...current, segment.segment_id]
    );
    setMessage("Segmento aplicado al editor. Revisa, ajusta y guarda la nota manualmente.");
  }

  function approveScribeDraft() {
    if (!scribeDraft) return;
    const runId = scribeDraft.run_id;
    setScribeDraft(null);
    setAppliedScribeSegments([]);
    call("ai_review_run", { runId, status: "APPROVED", feedback: null })
      .then(() => setMessage("Acomodo marcado como revisado. Guarda la nota cuando termines."))
      .catch((e: unknown) => setError(String(e)));
  }

  function discardScribeDraft() {
    if (!scribeDraft) return;
    const runId = scribeDraft.run_id;
    setScribeDraft(null);
    setAppliedScribeSegments([]);
    call("ai_review_run", { runId, status: "DISCARDED", feedback: null })
      .then(() => setMessage("Acomodo por plantilla descartado."))
      .catch((e: unknown) => setError(String(e)));
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
        </section>

        <div className="encounter-layout">
          <EncounterAgendaRail
            appointments={appointments}
            currentAppointmentId={currentAppointmentId}
            appointmentStart={detail.appointment_start}
            busy={appointmentSelectionBusy}
            onSelectAppointment={selectAgendaAppointment}
          />

          <div className="encounter-main">
            <nav className="encounter-modes" aria-label="Secciones de la consulta">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={resolvedSection === item.id ? "mode-item mode-item-active" : "mode-item"}
                  aria-current={resolvedSection === item.id ? "page" : undefined}
                  onClick={() => setActiveSection(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </nav>

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
                {medicalHistoryGroups.length > 0 ? (
                  <MedicalHistoryGroups groups={medicalHistoryGroups} />
                ) : (
                  <dl className="precheckin-list">
                    {formatPrecheckin(detail.precheckin).map(([key, value]) => (
                      <div key={key}>
                        <dt>{key}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
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
                {medicalHistoryGroups.length > 0 ? (
                  <div className="questionnaire-history">
                    <div className="panel-header">
                      <strong>Cuestionario de antecedentes</strong>
                      <p>Respuestas recibidas con el mismo formato que vio el paciente.</p>
                    </div>
                    <MedicalHistoryGroups groups={medicalHistoryGroups} />
                  </div>
                ) : null}
                {showBackgroundReview && backgroundReview ? (
                  <div className="background-review" role="status">
                    <div className="panel-header">
                      <strong>
                        {backgroundReview.hasDiscrepancies
                          ? "El paciente envio antecedentes distintos"
                          : "El paciente envio antecedentes nuevos"}
                      </strong>
                      <p>
                        Compara el expediente actual contra el cuestionario de preconsulta antes
                        de decidir si importas la version nueva.
                      </p>
                    </div>
                    <div className="background-review-grid">
                      {backgroundReview.fields.map((field) => (
                        <div
                          key={field.key}
                          className={
                            field.hasDifference
                              ? "background-review-row background-review-row-different"
                              : "background-review-row"
                          }
                        >
                          <strong>{field.label}</strong>
                          <div>
                            <span className="meta">Expediente actual</span>
                            <p>{field.current || "Sin dato registrado"}</p>
                          </div>
                          <div>
                            <span className="meta">Cuestionario nuevo</span>
                            <p>{field.incoming || "Sin dato enviado"}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="button-row">
                      <button
                        className="ghost-button"
                        disabled={busy}
                        onClick={() => {
                          setBackgroundReviewDismissed(true);
                          setMessage("Se mantuvieron los antecedentes anteriores.");
                        }}
                      >
                        Mantener anteriores
                      </button>
                      <button
                        className="action-button"
                        disabled={busy}
                        onClick={importPrecheckinBackground}
                      >
                        Importar nuevos
                      </button>
                      {detail.precheckin ? (
                        <button
                          className="ghost-button"
                          disabled={busy}
                          onClick={() => setActiveSection("preconsulta")}
                        >
                          Ver preconsulta
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
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
              <span className={aiScribeConsent ? "pill pill-success" : "pill pill-muted"}>
                {aiScribeConsent ? "Escriba autorizado" : "Escriba sin consentimiento"}
              </span>
              <button className="ghost-button" onClick={() => void toggleScribeConsent()} disabled={busy}>
                {aiScribeConsent ? "Revocar escriba" : "Autorizar escriba"}
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

            <div className="ai-draft template-editor">
              <div className="panel-header">
                <h4>Plantilla de acomodo</h4>
              </div>
              <div className="button-row">
                <label className="field">
                  <span>Plantilla activa</span>
                  <select
                    value={selectedTemplateId}
                    disabled={busy}
                    onChange={(event) => {
                      setSelectedTemplateId(event.currentTarget.value);
                      setTemplateEditor(null);
                    }}
                  >
                    <option value="default">
                      {resolvedProfile === "ODONTOLOGY" ? "SOAP odontologia" : "SOAP general"}
                    </option>
                    {profileTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="ghost-button" type="button" onClick={startNewTemplate} disabled={busy}>
                  Nueva plantilla
                </button>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={editSelectedTemplate}
                  disabled={busy || selectedTemplateId === "default"}
                >
                  Editar
                </button>
                <button
                  className="ghost-button danger-link"
                  type="button"
                  onClick={deleteSelectedTemplate}
                  disabled={busy || selectedTemplateId === "default"}
                >
                  Eliminar
                </button>
              </div>
              <p className="meta">
                {activeTemplateName} · {activeTemplate.segments.length} segmento(s) textuales locales.
              </p>

              {templateEditor ? (
                <div className="template-editor-form">
                  <label className="field">
                    <span>Nombre</span>
                    <input
                      value={templateEditor.name}
                      disabled={busy}
                      onChange={(event) =>
                        setTemplateEditor((current) =>
                          current ? { ...current, name: event.currentTarget.value } : current
                        )
                      }
                    />
                  </label>
                  <div className="template-segment-list">
                    {templateEditor.segments.map((segment, index) => (
                      <div className="template-segment" key={`${segment.id}-${index}`}>
                        <label className="field compact-field">
                          <span>Clave</span>
                          <input
                            value={segment.id}
                            disabled={busy}
                            onChange={(event) => updateTemplateSegment(index, { id: event.currentTarget.value })}
                          />
                        </label>
                        <label className="field">
                          <span>Etiqueta</span>
                          <input
                            value={segment.label}
                            disabled={busy}
                            onChange={(event) =>
                              updateTemplateSegment(index, { label: event.currentTarget.value })
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Destino</span>
                          <select
                            value={segment.target}
                            disabled={busy}
                            onChange={(event) =>
                              updateTemplateSegment(index, { target: event.currentTarget.value })
                            }
                          >
                            {targetOptions.map((option) => (
                              <option key={option.target} value={option.target}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="week-cancelled-toggle">
                          <input
                            type="checkbox"
                            checked={segment.required}
                            disabled={busy}
                            onChange={(event) =>
                              updateTemplateSegment(index, { required: event.currentTarget.checked })
                            }
                          />
                          <span>Obligatorio</span>
                        </label>
                        <label className="field template-instructions">
                          <span>Instrucciones para IA</span>
                          <textarea
                            rows={2}
                            value={segment.instructions}
                            disabled={busy}
                            onChange={(event) =>
                              updateTemplateSegment(index, { instructions: event.currentTarget.value })
                            }
                          />
                        </label>
                        <button
                          className="ghost-button danger-link"
                          type="button"
                          onClick={() => removeTemplateSegment(index)}
                          disabled={busy || templateEditor.segments.length <= 1}
                        >
                          Quitar
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="button-row">
                    <button className="ghost-button" type="button" onClick={addTemplateSegment} disabled={busy}>
                      Agregar segmento
                    </button>
                    <button className="action-button" type="button" onClick={saveTemplateEditor} disabled={busy}>
                      Guardar plantilla
                    </button>
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() => setTemplateEditor(null)}
                      disabled={busy}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="button-row">
              <label className="field">
                <span>Audio de consulta</span>
                <input
                  type="file"
                  accept=".wav,audio/wav,audio/x-wav"
                  disabled={busy || !aiVoiceConsent}
                  onChange={(e) => {
                    transcribeAudioFile(e.currentTarget.files?.[0] ?? null);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
              <div className="recording-controls">
                <button
                  className={recordingState === "recording" ? "ghost-button recording-button" : "ghost-button"}
                  type="button"
                  onClick={() => void startConsultationRecording()}
                  disabled={busy || !aiVoiceConsent || recordingState !== "idle"}
                >
                  Iniciar grabacion
                </button>
                <button
                  className="action-button"
                  type="button"
                  onClick={stopConsultationRecording}
                  disabled={recordingState !== "recording"}
                >
                  Detener y transcribir
                </button>
                <span className={recordingState === "recording" ? "pill pill-success" : "pill pill-muted"}>
                  {recordingState === "recording"
                    ? `Grabando ${formatRecordingDuration(recordingSeconds)}`
                    : recordingState === "stopping"
                      ? "Preparando audio"
                      : "Grabadora lista"}
                </span>
              </div>
              <span className="meta">
                WAV mono 16 kHz · {useCloudTranscription ? "respaldo en nube (bajo BAA)" : "transcripcion local"} · descarte inmediato del audio.
              </span>
            </div>
            {recordingError ? (
              <p className="form-error" role="alert">
                {recordingError}
              </p>
            ) : null}

            <label className="week-cancelled-toggle">
              <input
                type="checkbox"
                checked={useCloudTranscription}
                disabled={busy || !aiVoiceConsent}
                onChange={(e) => setUseCloudTranscription(e.currentTarget.checked)}
              />
              <span>Usar respaldo en nube (equipo lento; el audio sale del equipo)</span>
            </label>

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

            {scribeTurns.length > 0 ? (
              <div className="ai-draft">
                <div className="panel-header">
                  <h4>Dialogo revisable</h4>
                  <p>Corrige hablante y texto antes de acomodar la consulta en la plantilla.</p>
                </div>
                <div className="scribe-turn-list">
                  {scribeTurns.map((turn) => (
                    <div className="scribe-turn" key={turn.id}>
                      <label className="field compact-field">
                        <span>Hablante</span>
                        <select
                          value={turn.speaker}
                          disabled={busy}
                          onChange={(event) =>
                            updateScribeTurn(turn.id, {
                              speaker: event.currentTarget.value as ScribeSpeaker
                            })
                          }
                        >
                          <option value="MEDICO">Medico</option>
                          <option value="PACIENTE">Paciente</option>
                        </select>
                      </label>
                      <label className="field">
                        <span>{turn.id}</span>
                        <textarea
                          rows={2}
                          value={turn.text}
                          disabled={busy}
                          onChange={(event) =>
                            updateScribeTurn(turn.id, { text: event.currentTarget.value })
                          }
                        />
                      </label>
                    </div>
                  ))}
                </div>
                <div className="button-row">
                  <button
                    className="action-button"
                    onClick={structureConsultation}
                    disabled={busy || !aiScribeConsent || scribeTurns.every((turn) => !turn.text.trim())}
                  >
                    Acomodar en plantilla
                  </button>
                  <span className="meta">
                    Usa {activeTemplateName} · no guarda la nota automaticamente.
                  </span>
                </div>
              </div>
            ) : null}

            {scribeDraft ? (
              <div className="ai-draft">
                <p className="meta">
                  Acomodo de plantilla · proveedor {scribeDraft.provider} · modelo{" "}
                  {scribeDraft.model_version} · costo estimado{" "}
                  {centsFormatter.format(scribeDraft.estimated_cost_cents / 100)} ·{" "}
                  {scribeDraft.latency_ms} ms
                </p>
                {scribeDraft.warnings.length > 0 ? (
                  <ul className="scribe-warning-list">
                    {scribeDraft.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                ) : null}
                {scribeDraft.missing.length > 0 ? (
                  <div className="field">
                    <span>Faltantes detectados</span>
                    <ul className="scribe-warning-list">
                      {scribeDraft.missing.map((missing) => (
                        <li key={missing}>{missing}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="stack">
                  {scribeDraft.segments.map((segment) => (
                    <article className="scribe-segment" key={segment.segment_id}>
                      <div>
                        <strong>{segmentLabels.get(segment.segment_id) ?? segment.segment_id}</strong>
                        <span className="meta">
                          Confianza {segment.confidence} · fuentes{" "}
                          {segment.source_turns.length > 0 ? segment.source_turns.join(", ") : "sin fuente"}
                        </span>
                      </div>
                      <p className="ai-draft-text">{segment.content}</p>
                      {segment.source_turns.length > 0 ? (
                        <div className="scribe-source-list">
                          {formatSourceTurnReferences(scribeTurns, segment.source_turns).map((source) => (
                            <blockquote
                              className={source.missing ? "scribe-source missing-source" : "scribe-source"}
                              key={source.id}
                            >
                              <strong>{source.label}</strong>
                              {source.text ? <span>{source.text}</span> : null}
                            </blockquote>
                          ))}
                        </div>
                      ) : null}
                      {segment.warnings.length > 0 ? (
                        <ul className="scribe-warning-list">
                          {segment.warnings.map((warning) => (
                            <li key={warning}>{warning}</li>
                          ))}
                        </ul>
                      ) : null}
                      <button
                        className="ghost-button"
                        onClick={() => applyScribeSegment(segment)}
                        disabled={busy || appliedScribeSegments.includes(segment.segment_id)}
                      >
                        {appliedScribeSegments.includes(segment.segment_id)
                          ? "Aplicado"
                          : "Aplicar segmento"}
                      </button>
                    </article>
                  ))}
                </div>
                <div className="button-row">
                  <button
                    className="action-button"
                    onClick={approveScribeDraft}
                    disabled={busy || appliedScribeSegments.length === 0}
                  >
                    Marcar revision aplicada
                  </button>
                  <button className="ghost-button" onClick={discardScribeDraft} disabled={busy}>
                    Descartar acomodo
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

          <aside className="encounter-context" aria-label="Contexto del paciente">
            {allergyText(detail.patient.allergies) ? (
              <p className="alert-allergies">Alergias: {allergyText(detail.patient.allergies)}</p>
            ) : (
              <p className="context-empty">Sin alergias registradas</p>
            )}

            {detail.precheckin ? (
              <div className="context-block">
                <h4>Preconsulta</h4>
                <dl className="precheckin-list">
                  {formatPrecheckin(detail.precheckin)
                    .slice(0, 6)
                    .map(([key, value]) => (
                      <div key={key}>
                        <dt>{key}</dt>
                        <dd>{value}</dd>
                      </div>
                    ))}
                </dl>
              </div>
            ) : null}

            <div className="context-block">
              <h4>Consultas previas</h4>
              {isFirstVisit(detail.history) ? (
                <p className="context-empty">Primera vez — sin consultas previas</p>
              ) : (
                <ul className="history-list">
                  {buildContextHistory(detail.history, (iso) =>
                    dateTimeFormatter.format(new Date(iso))
                  ).map((row) => (
                    <li key={row.encounterId}>
                      <span className="meta">{row.when ?? "(sin firmar)"}</span> {row.diagnosis}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}
