import { useCallback, useEffect, useRef, useState } from "react";
import { DentalNoteEditor } from "./DentalNoteEditor";
import { DentalBudgetPanel } from "./DentalBudgetPanel";
import { DentalLabPanel } from "./DentalLabPanel";
import { DentalEvolutionPanel, PostOpInstructionsPanel } from "./DentalNoteAids";
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
  assignDiarizedRole,
  assignRoleToSpeaker,
  buildTemplateSegments,
  diarizedReviewToConsultationTurns,
  diarizedRolesResolved,
  diarizedSegmentsToTurns,
  diarizedTurnsToConsultationTurns,
  normalizeTemplateDefinition,
  swapTwoSpeakerRoles,
  transcriptToTurns,
  type ConsultationTurn,
  type DiarizedReview,
  type DiarizedSegment,
  type DiarizedSpeakerRole,
  type LocalDiarizedTurn,
  type SegmentDraft,
  type TemplateDefinition
} from "./consultationScribe";
import { MedicationSafety } from "./MedicationSafety";
import { EncounterAgendaRail } from "./EncounterAgendaRail";
import { call } from "./ipc";
import { DICTATING_BODY_CLASS, isDictating } from "./focusMode";
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
import { buildPreconsultaPresentation } from "./clinicalQuestionnairePresentation";
import { MedicalHistoryEditor } from "./MedicalHistoryEditor";
import { MedicalHistoryConflictReview } from "./MedicalHistoryConflictReview";
import { MedicalHistoryGroups } from "./MedicalHistoryGroups";
import { TranscriptionWorkspace } from "./ConsultationTranscriptionPanel";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
import {
  DEFAULT_CLOUD_TRANSCRIPTION_PROVIDER,
  DEFAULT_SPEAKER_COUNT,
  DEFAULT_TRANSCRIPTION_MODE,
  type CloudTranscriptionProviderId,
  type TranscriptionMode
} from "./transcriptionWorkspace";
import { ClinicalAidRail } from "./ClinicalAidRail";
import {
  parseAiOverload,
  type AiOverloadInfo,
  type BackgroundUpdate,
  type ClinicalAidDraft,
  type TextModelOption
} from "./clinicalAid";
import {
  applyConflictDecisions,
  reconcileMedicalHistories,
  type ConflictDecision,
  type MedicalHistoryPayload,
  type MedicalHistoryReconciliation as MedicalHistoryReconciliationState
} from "./medicalHistoryReconciliation";
import { formatMedicalHistoryForDisplay } from "./medicalHistoryFormat";

type SpecialtyPayload = GeneralMedicinePayload | DentalPayload;
type RecordingState = "idle" | "recording" | "paused" | "stopping";

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
  /** Cuestionario de antecedentes / historia clinica del paciente. */
  medical_history: string | null;
  /** Resultado de la preconsulta guiada por IA. */
  preconsulta: string | null;
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

interface TranscriptionDraft {
  run_id: string;
  usage_type: string;
  provider: string;
  model_version: string;
  estimated_cost_cents: number;
  latency_ms: number;
  transcript_text: string;
  audio_retention_policy: string;
  /** Turnos anonimos crudos (JSON) en modo diarizado en nube; ausente en los
   * demas modos. Se mapea con `diarizedSegmentsToTurns` para la asignacion de
   * roles por hablante (Ruta B, F4). */
  segments_json?: string | null;
}

// Borrador de transcripcion + separacion de hablantes (diarizacion local). Si
// `diarized` es false (sin modelos/feature o audio no diarizable), `turns` viene
// vacio y el frontend cae a la heuristica de turnos sobre el texto.
interface DiarizationDraft extends TranscriptionDraft {
  turns: LocalDiarizedTurn[];
  diarized: boolean;
}

interface ReviewedTranscription {
  id: string;
  encounter_id: string;
  run_id: string;
  transcript_text: string;
  turns: ConsultationTurn[];
  status: "REVIEWED";
  created_at: string;
  reviewed_at: string;
}

interface StoredConsultationTemplate extends TemplateDefinition {
  name: string;
  clinical_profile: ClinicalProfile;
  created_at?: string | null;
  updated_at?: string | null;
}

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

function parseMedicalHistoryPayload(raw: string | null): MedicalHistoryPayload {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function legacyMedicalHistory(detail: EncounterDetail): MedicalHistoryPayload {
  const payload: MedicalHistoryPayload = {};
  if (detail.patient.allergies) payload.allergies = detail.patient.allergies;
  if (detail.patient.birth_date) {
    payload.identification = { fechaNacimiento: detail.patient.birth_date.slice(0, 10) };
  }
  return payload;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
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
  const [aiVoiceConsent, setAiVoiceConsent] = useState(false);
  const [aiScribeConsent, setAiScribeConsent] = useState(false);
  const [aiTranscription, setAiTranscription] = useState<TranscriptionDraft | null>(null);
  const [scribeTurns, setScribeTurns] = useState<ConsultationTurn[]>([]);
  const [diarizedReview, setDiarizedReview] = useState<DiarizedReview | null>(null);
  const [reviewedTranscription, setReviewedTranscription] =
    useState<ReviewedTranscription | null>(null);
  const [clinicalAidDraft, setClinicalAidDraft] = useState<ClinicalAidDraft | null>(null);
  const [aiOverload, setAiOverload] = useState<
    (AiOverloadInfo & { alternatives: TextModelOption[] }) | null
  >(null);
  const [consultationTemplates, setConsultationTemplates] = useState<StoredConsultationTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("default");
  const [recordingState, setRecordingState] = useState<RecordingState>("idle");
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingError, setRecordingError] = useState("");
  const [transcriptionMode, setTranscriptionMode] =
    useState<TranscriptionMode>(DEFAULT_TRANSCRIPTION_MODE);
  const [cloudProvider, setCloudProvider] = useState<CloudTranscriptionProviderId>(
    DEFAULT_CLOUD_TRANSCRIPTION_PROVIDER
  );
  const [numSpeakers, setNumSpeakers] = useState(DEFAULT_SPEAKER_COUNT);
  const [transcribing, setTranscribing] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>("nota");
  const [permanentMedicalHistory, setPermanentMedicalHistory] =
    useState<PatientMedicalHistoryVersion | null>(null);
  const [permanentMedicalHistoryLoaded, setPermanentMedicalHistoryLoaded] = useState(false);
  const [medicalHistoryMode, setMedicalHistoryMode] =
    useState<"read" | "reconcile" | "edit">("read");
  const [medicalHistoryDraft, setMedicalHistoryDraft] = useState<MedicalHistoryPayload>({});
  const [medicalHistoryReconciliation, setMedicalHistoryReconciliation] =
    useState<MedicalHistoryReconciliationState | null>(null);
  const [medicalHistoryDecisions, setMedicalHistoryDecisions] = useState<
    Record<string, ConflictDecision>
  >({});
  const [medicalHistorySourceHash, setMedicalHistorySourceHash] = useState<string | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const recorderNodeRef = useRef<ScriptProcessorNode | null>(null);
  const recorderChunksRef = useRef<Float32Array[]>([]);
  const recordingStartedAtRef = useRef<number>(0);
  const recordingTimerRef = useRef<number | null>(null);
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
        if (data.encounter.status === "SIGNED") {
          call<boolean>("verify_signature", { encounterId })
            .then(setSignatureValid)
            .catch(() => setSignatureValid(null));
        } else {
          setSignatureValid(null);
        }
        call<boolean>("ai_voice_consent_status", { patientId: data.patient.id })
          .then(setAiVoiceConsent)
          .catch(() => setAiVoiceConsent(false));
        call<boolean>("ai_scribe_consent_status", { patientId: data.patient.id })
          .then(setAiScribeConsent)
          .catch(() => setAiScribeConsent(false));
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
        call<ReviewedTranscription | null>("ai_latest_reviewed_transcription", {
          encounterId
        })
          .then((reviewed) => {
            setReviewedTranscription(reviewed);
            if (reviewed) setScribeTurns(reviewed.turns);
          })
          .catch(() => setReviewedTranscription(null));
      })
      .catch((e: unknown) => setError(String(e)));
  }, [encounterId, resolvedProfile]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!detail) return;
    setPermanentMedicalHistoryLoaded(false);
    call<PatientMedicalHistoryVersion | null>("get_patient_medical_history", {
      patientId: detail.patient.id
    })
      .then(setPermanentMedicalHistory)
      .catch(() => setPermanentMedicalHistory(null))
      .finally(() => setPermanentMedicalHistoryLoaded(true));
    if (detail.medical_history) {
      void sha256Hex(detail.medical_history).then(setMedicalHistorySourceHash);
    } else {
      setMedicalHistorySourceHash(null);
    }
  }, [detail?.patient.id, detail?.medical_history]);

  useEffect(() => {
    setNote((current) => ({
      ...current,
      specialty: coerceSpecialtyPayload(resolvedProfile, current.specialty)
    }));
    setSelectedTemplateId("default");
  }, [resolvedProfile]);

  // Modo Foco: al dictar, atenúa el chrome de navegación (clase en <body>, ver
  // App.css). Se limpia al salir de la consulta o al dejar de grabar.
  useEffect(() => {
    const active = isDictating(recordingState === "paused" ? "recording" : recordingState);
    document.body.classList.toggle(DICTATING_BODY_CLASS, active);
    return () => document.body.classList.remove(DICTATING_BODY_CLASS);
  }, [recordingState]);

  useEffect(() => () => cleanupRecording(), []);

  // En cuanto la nube diarizada tiene rol para todo hablante con texto, vuelca
  // el borrador a scribeTurns: la pantalla pasa del asignador de roles al
  // editor de turnos comun (mismo camino que local/nube estandar) (Ruta B, F4).
  useEffect(() => {
    if (diarizedReview && diarizedRolesResolved(diarizedReview)) {
      setScribeTurns(diarizedReviewToConsultationTurns(diarizedReview));
    }
  }, [diarizedReview]);

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
  const hasUnsavedChanges =
    medicalHistoryMode !== "read" ||
    hasEncounterDraftChanges({ note, prescription, background }, persistedDraft);
  const displayedMedicalHistory =
    permanentMedicalHistory?.payload_json ?? detail.medical_history;
  const medicalHistoryGroups = formatMedicalHistoryForDisplay(displayedMedicalHistory);
  const preconsultaPresentation = detail.preconsulta
    ? buildPreconsultaPresentation(detail.preconsulta)
    : null;
  const hasPendingPatientMedicalHistory = Boolean(
    permanentMedicalHistory &&
      medicalHistorySourceHash &&
      permanentMedicalHistory.reconciled_source_hash !== medicalHistorySourceHash
  );

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

  const navItems = buildEncounterModes({
    hasPreconsulta: Boolean(detail.preconsulta),
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

  function beginMedicalHistoryEdit() {
    if (!detail) return;
    const current = permanentMedicalHistory
      ? parseMedicalHistoryPayload(permanentMedicalHistory.payload_json)
      : legacyMedicalHistory(detail);
    const incoming = parseMedicalHistoryPayload(detail.medical_history);
    const sourceAlreadyReconciled =
      Boolean(permanentMedicalHistory) &&
      Boolean(medicalHistorySourceHash) &&
      permanentMedicalHistory?.reconciled_source_hash === medicalHistorySourceHash;

    if (sourceAlreadyReconciled || !detail.medical_history) {
      setMedicalHistoryDraft(current);
      setMedicalHistoryMode("edit");
      return;
    }

    const reconciliation = reconcileMedicalHistories(current, incoming);
    setMedicalHistoryReconciliation(reconciliation);
    setMedicalHistoryDecisions({});
    if (permanentMedicalHistory && reconciliation.conflicts.length > 0) {
      setMedicalHistoryMode("reconcile");
    } else {
      setMedicalHistoryDraft(reconciliation.merged);
      setMedicalHistoryMode("edit");
    }
  }

  function continueAfterMedicalHistoryReconciliation() {
    if (!medicalHistoryReconciliation) return;
    setMedicalHistoryDraft(
      applyConflictDecisions(
        medicalHistoryReconciliation.merged,
        medicalHistoryReconciliation.conflicts,
        medicalHistoryDecisions
      )
    );
    setMedicalHistoryMode("edit");
  }

  function savePermanentMedicalHistory() {
    if (!detail) return;
    const source =
      detail.medical_history && !permanentMedicalHistory
        ? "PATIENT_INITIAL"
        : hasPendingPatientMedicalHistory
          ? "PATIENT_RECONCILIATION"
          : "DOCTOR_EDIT";
    void run("Antecedentes guardados como nueva versión.", async () => {
      const saved = await call<PatientMedicalHistoryVersion>("save_patient_medical_history", {
        patientId,
        input: {
          payload_json: JSON.stringify(medicalHistoryDraft),
          source,
          encounter_id: encounterId,
          source_appointment_id: medicalHistorySourceHash
            ? detail.encounter.appointment_id
            : null,
          reconciled_source_hash: medicalHistorySourceHash
        }
      });
      setPermanentMedicalHistory(saved);
      setMedicalHistoryMode("read");
      setMedicalHistoryReconciliation(null);
      setMedicalHistoryDecisions({});
    });
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

  function transcribeAudioFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setTranscribing(true);
    setMessage("");
    setError("");
    setAiTranscription(null);
    setDiarizedReview(null);
    fileToBase64(file)
      .then(async (audioBase64) => {
        const audio = {
          fileName: file.name,
          mediaType: file.type || "audio/wav",
          audioBase64,
          durationSeconds: null
        };
        // Local (por defecto): separa hablantes con diarizacion local. Nube
        // estandar: transcripcion simple (sin marcas de tiempo). Nube con
        // hablantes: el portal (OpenAI) diariza pero no asume roles; el medico
        // los confirma antes de acomodar (Ruta B, F4).
        if (transcriptionMode === "local") {
          const draft = await call<DiarizationDraft>("ai_diarize_consultation", {
            encounterId,
            audio,
            numSpeakers
          });
          setAiTranscription(draft);
          setScribeTurns(
            draft.diarized && draft.turns.length > 0
              ? diarizedTurnsToConsultationTurns(draft.turns)
              : transcriptToTurns(draft.transcript_text)
          );
          setMessage(
            draft.diarized
              ? "Transcripcion con separacion de voces generada. Revisala antes de usarla."
              : "Transcripcion generada (sin separacion automatica de voces). Revisala antes de usarla."
          );
        } else {
          const draft = await call<TranscriptionDraft>("ai_transcribe_audio", {
            encounterId,
            audio,
            useCloud: true,
            mode: transcriptionMode === "cloud_diarized" ? "diarized" : "standard",
            provider: cloudProvider
          });
          setAiTranscription(draft);
          if (transcriptionMode === "cloud_diarized" && draft.segments_json) {
            const segments = JSON.parse(draft.segments_json) as DiarizedSegment[];
            setDiarizedReview(diarizedSegmentsToTurns(segments));
            setScribeTurns([]);
            setMessage(
              "Transcripcion con hablantes anonimos generada. Asigna el rol de cada hablante antes de continuar."
            );
          } else {
            setScribeTurns(transcriptToTurns(draft.transcript_text));
            setMessage("Transcripcion generada. Revisala antes de usarla.");
          }
        }
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => {
        setBusy(false);
        setTranscribing(false);
      });
  }

  async function discardAiTranscription() {
    const runId = reviewedTranscription?.run_id ?? aiTranscription?.run_id;
    if (!runId) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (reviewedTranscription) {
        await call("ai_discard_reviewed_transcription", { encounterId, runId });
      } else {
        await call("ai_review_run", { runId, status: "DISCARDED", feedback: null });
      }
      setAiTranscription(null);
      setReviewedTranscription(null);
      setScribeTurns([]);
      setDiarizedReview(null);
      setClinicalAidDraft(null);
      setMessage("Transcripción descartada.");
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }

  function updateScribeTurn(id: string, patch: Partial<Pick<ConsultationTurn, "speaker" | "text">>) {
    setScribeTurns((current) =>
      current.map((turn) => (turn.id === id ? { ...turn, ...patch } : turn))
    );
  }

  // Asigna el rol de un hablante anonimo de la nube diarizada. En cuanto todo
  // hablante con texto tiene rol, un efecto abajo vuelca el borrador a
  // scribeTurns y la pantalla pasa al editor de turnos comun (Ruta B, F4).
  function assignScribeDiarizedRole(speakerId: string, role: DiarizedSpeakerRole) {
    setDiarizedReview((current) => (current ? assignDiarizedRole(current, speakerId, role) : current));
  }

  // Aplica retroactivamente un rol a todos los turnos ya resueltos que comparten
  // la misma voz tecnica (speakerId) — boton "Aplicar a esta voz" del rediseno.
  function assignScribeSpeakerRole(speakerId: string, speaker: ConsultationTurn["speaker"]) {
    setScribeTurns((current) => assignRoleToSpeaker(current, speakerId, speaker));
  }

  // Intercambia los roles del dialogo cuando la separacion automatica asigno
  // medico/paciente al reves. Si hay speakerId tecnico, el cambio respeta ese
  // mapeo por voz; si no, cae al intercambio por turno legado. Acompañante/Otro
  // no se ven afectados (swapTwoSpeakerRoles solo alterna Medico<->Paciente).
  function swapScribeRoles() {
    setScribeTurns((current) => swapTwoSpeakerRoles(current));
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
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      const context = new AudioContextCtor();
      if (context.state === "suspended") {
        await context.resume();
      }
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
    if (recordingState !== "recording" && recordingState !== "paused") return;
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

  async function pauseConsultationRecording() {
    if (recordingState !== "recording" || !audioContextRef.current) return;
    await audioContextRef.current.suspend();
    setRecordingState("paused");
  }

  async function resumeConsultationRecording() {
    if (recordingState !== "paused" || !audioContextRef.current) return;
    await audioContextRef.current.resume();
    setRecordingState("recording");
  }

  function markTranscriptionReviewed() {
    if (!aiTranscription || scribeTurns.every((turn) => !turn.text.trim())) return;
    setBusy(true);
    setError("");
    call<ReviewedTranscription>("ai_save_reviewed_transcription", {
      encounterId,
      runId: aiTranscription.run_id,
      turns: scribeTurns
    })
      .then((reviewed) => {
        setReviewedTranscription(reviewed);
        setAiTranscription(null);
        setMessage("Transcripción revisada. Ayuda IA ya puede usarla.");
      })
      .catch((cause: unknown) => setError(String(cause)))
      .finally(() => setBusy(false));
  }

  function generateClinicalAid(alternative?: TextModelOption) {
    if (!reviewedTranscription) return;
    setBusy(true);
    setError("");
    setAiOverload(null);
    setClinicalAidDraft(null);
    call<ClinicalAidDraft>("ai_generate_clinical_aid", {
      encounterId,
      template: activeTemplate,
      modelOverride: alternative?.id ?? null
    })
      .then((draft) => {
        setClinicalAidDraft(draft);
        setMessage(
          alternative
            ? `Ayuda clínica generada con la alternativa ${alternative.label}. Revisa cada propuesta antes de aplicarla.`
            : "Ayuda clínica generada. Revisa cada propuesta antes de aplicarla."
        );
      })
      .catch((cause: unknown) => {
        const overload = parseAiOverload(cause);
        if (!overload) {
          setError(String(cause));
          return;
        }
        // Sobrecarga transitoria del proveedor: en lugar del banner críptico,
        // el médico decide si reintenta o genera con otro modelo/proveedor.
        void call<TextModelOption[]>("ai_list_text_models", {})
          .then((models) =>
            models.filter(
              (option) =>
                !(option.provider === overload.provider && option.model === overload.model)
            )
          )
          .catch(() => [] as TextModelOption[])
          .then((alternatives) => setAiOverload({ ...overload, alternatives }));
      })
      .finally(() => setBusy(false));
  }

  function applyClinicalAidSoap() {
    if (!clinicalAidDraft) return;
    const draft = clinicalAidDraft.soap;
    setNote((current) => ({
      ...current,
      subjective: draft.subjective,
      objective: draft.objective,
      assessment: draft.assessment,
      diagnosis: draft.diagnosis,
      plan: draft.plan,
      instructions: draft.instructions
    }));
    setMessage("SOAP aplicado al editor. Revisa y guarda manualmente.");
  }

  // Las propuestas de IA se ANEXAN a lo que el medico ya escribio; nunca
  // sobrescriben. El medico revisa el resultado en el editor antes de guardar.
  function applyClinicalAidPrescription(text: string) {
    setPrescription((current) => (current.trim() ? `${current.trimEnd()}\n${text}` : text));
    setMessage("Receta sugerida aplicada al editor. Revisa y guarda manualmente.");
  }

  function applyClinicalAidBackground(update: BackgroundUpdate) {
    setBackground((current) => {
      const existing = current[update.field] ?? "";
      return {
        ...current,
        [update.field]: existing.trim()
          ? `${existing.trimEnd()}\n${update.content}`
          : update.content
      };
    });
    setMessage("Antecedente aplicado. Revisa y guarda manualmente.");
  }

  function discardClinicalAid() {
    if (!clinicalAidDraft) return;
    const runId = clinicalAidDraft.run_id;
    setClinicalAidDraft(null);
    void call("ai_review_run", { runId, status: "DISCARDED", feedback: null });
  }

  function applyScribeSegment(segment: SegmentDraft) {
    setNote((current) => appendSegmentToNote(current, segment, activeTemplate));
    setMessage("Segmento aplicado al editor. Revisa, ajusta y guarda la nota manualmente.");
  }

  function sign() {
    const confirmed = window.confirm(
      "Al firmar, la nota y la receta quedan cerradas y no podran modificarse. ¿Firmar y cerrar la consulta?"
    );
    if (!confirmed) return;
    void run("Consulta firmada y cerrada.", () => call("sign_encounter", { encounterId }));
  }

  return (
    <div className="consultation-station">
      <header className="consultation-topbar">
        <div className="consultation-titlebar">
          <button className="ghost-button" onClick={onBack}>
            ‹ Agenda
          </button>
          <div className="consultation-patient-title">
            <strong>
              {detail.patient.first_name} {detail.patient.last_name}
            </strong>
            <span>
              {detail.appointment_start
                ? dateTimeFormatter.format(new Date(detail.appointment_start))
                : "Sin cita asociada"}
            </span>
          </div>
        </div>

        <div className="button-row consultation-actions">
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
        </div>
      </header>

      <div className="consultation-body">
        <aside className="consultation-route-rail" aria-label="Ruta de la consulta">
          <div className="consultation-route-section">
            <span className="sidebar-heading">Ruta de la consulta</span>
            <nav className="consultation-steps" aria-label="Secciones de la consulta">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={
                    resolvedSection === item.id
                      ? "consultation-step consultation-step-active"
                      : "consultation-step"
                  }
                  aria-current={resolvedSection === item.id ? "page" : undefined}
                  onClick={() => setActiveSection(item.id)}
                >
                  <span className="consultation-step-dot" aria-hidden="true" />
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.id === "nota" ? "SOAP" : item.id === "ia" ? "Dictado" : item.id === "ayuda" ? "Asistencia" : "Clínico"}</small>
                  </span>
                </button>
              ))}
            </nav>
          </div>

          <EncounterAgendaRail
            appointments={appointments}
            currentAppointmentId={currentAppointmentId}
            appointmentStart={detail.appointment_start}
            busy={appointmentSelectionBusy}
            onSelectAppointment={selectAgendaAppointment}
          />
        </aside>

        <main className="consultation-center">
            {message && (
              <p className="form-success" role="status">
                <span>{message}</span>
                <button
                  type="button"
                  className="form-message-dismiss"
                  aria-label="Cerrar mensaje"
                  onClick={() => setMessage("")}
                >
                  ×
                </button>
              </p>
            )}
            {error && (
              <p className="form-error" role="alert">
                <span>{error}</span>
                <button
                  type="button"
                  className="form-message-dismiss"
                  aria-label="Cerrar error"
                  onClick={() => setError("")}
                >
                  ×
                </button>
              </p>
            )}
            {aiOverload && (
              <section
                className="panel ai-overload-dialog"
                role="alertdialog"
                aria-label="Proveedor de IA sobrecargado"
              >
                <h3>El modelo de IA está sobrecargado</h3>
                <p>
                  {aiOverload.provider} ({aiOverload.model}) está sobrecargado o temporalmente
                  no disponible. Es un problema del proveedor, no de tu sistema ni de tu
                  configuración; suele resolverse en minutos.
                </p>
                <p className="meta">{aiOverload.message}</p>
                <div className="ai-overload-actions">
                  <button
                    className="action-button"
                    disabled={busy}
                    onClick={() => generateClinicalAid()}
                  >
                    Reintentar con {aiOverload.model}
                  </button>
                  {aiOverload.alternatives.map((option) => (
                    <button
                      key={option.id}
                      className="ghost-button"
                      disabled={busy}
                      onClick={() => generateClinicalAid(option)}
                    >
                      Generar con {option.label}
                    </button>
                  ))}
                  <button
                    className="ghost-button danger-link"
                    disabled={busy}
                    onClick={() => setAiOverload(null)}
                  >
                    Cancelar
                  </button>
                </div>
                {aiOverload.alternatives.length === 0 && (
                  <p className="meta">
                    No hay modelos alternativos configurados; puedes reintentar en unos minutos.
                  </p>
                )}
              </section>
            )}

            {resolvedSection === "preconsulta" && detail.preconsulta ? (
              <section className="panel">
                <h3>Preconsulta del paciente</h3>
                <p className="meta">Cuestionario guiado por IA previo a la consulta.</p>
                {preconsultaPresentation ? (
                  <div className="clinical-response-groups preconsulta-response-groups">
                    {preconsultaPresentation.motivo ? (
                      <section className="clinical-response-group">
                        <div className="clinical-response-heading">
                          <h4>Motivo de consulta</h4>
                          <span>1 respuesta</span>
                        </div>
                        <dl className="clinical-field-list">
                          <div className="clinical-field-row">
                            <dt>Motivo</dt>
                            <dd>{preconsultaPresentation.motivo}</dd>
                          </div>
                        </dl>
                      </section>
                    ) : null}

                    {preconsultaPresentation.questions.length > 0 ? (
                      <section className="clinical-response-group">
                        <div className="clinical-response-heading">
                          <h4>Entrevista guiada</h4>
                          <span>
                            {preconsultaPresentation.questions.length}{" "}
                            {preconsultaPresentation.questions.length === 1
                              ? "respuesta"
                              : "respuestas"}
                          </span>
                        </div>
                        <dl className="clinical-question-list">
                          {preconsultaPresentation.questions.map((item, index) => (
                            <div
                              key={`${item.question}-${index}`}
                              className="clinical-question-row"
                            >
                              <span className="clinical-question-number" aria-hidden="true">
                                {index + 1}
                              </span>
                              <div>
                                <dt>{item.question}</dt>
                                <dd>{item.answer || "Sin respuesta capturada"}</dd>
                              </div>
                            </div>
                          ))}
                        </dl>
                      </section>
                    ) : null}

                    {preconsultaPresentation.legacyRows.length > 0 ? (
                      <section className="clinical-response-group">
                        <div className="clinical-response-heading">
                          <h4>Respuestas recibidas</h4>
                          <span>
                            {preconsultaPresentation.legacyRows.length}{" "}
                            {preconsultaPresentation.legacyRows.length === 1
                              ? "respuesta"
                              : "respuestas"}
                          </span>
                        </div>
                        <dl className="clinical-field-list">
                          {preconsultaPresentation.legacyRows.map(([key, value], index) => (
                            <div key={`${key}-${index}`} className="clinical-field-row">
                              <dt>{key}</dt>
                              <dd>{value}</dd>
                            </div>
                          ))}
                        </dl>
                      </section>
                    ) : null}
                  </div>
                ) : null}
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
                <div className="medical-history-section-header">
                  <div>
                    <h3>Antecedentes</h3>
                    <p className="meta">
                      {permanentMedicalHistory
                        ? `Expediente permanente · versión ${permanentMedicalHistory.version}`
                        : "Aún no existe una versión permanente"}
                    </p>
                  </div>
                  {medicalHistoryMode === "read" ? (
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={busy || signed || !permanentMedicalHistoryLoaded}
                      onClick={beginMedicalHistoryEdit}
                    >
                      Editar antecedentes
                    </button>
                  ) : null}
                </div>

                {hasPendingPatientMedicalHistory && medicalHistoryMode === "read" ? (
                  <div className="history-pending-notice" role="status">
                    <strong>El paciente llenó antecedentes nuevos</strong>
                    <p>
                      Ya existe una versión en el expediente. Al editar podrás comparar
                      únicamente los campos que tengan información distinta en ambas.
                    </p>
                  </div>
                ) : null}

                {medicalHistoryMode === "reconcile" && medicalHistoryReconciliation ? (
                  <MedicalHistoryConflictReview
                    conflicts={medicalHistoryReconciliation.conflicts}
                    decisions={medicalHistoryDecisions}
                    autoMergedCount={medicalHistoryReconciliation.autoMergedCount}
                    onChoose={(path, decision) =>
                      setMedicalHistoryDecisions((current) => ({ ...current, [path]: decision }))
                    }
                    onContinue={continueAfterMedicalHistoryReconciliation}
                    onCancel={() => setMedicalHistoryMode("read")}
                  />
                ) : null}

                {medicalHistoryMode === "edit" ? (
                  <MedicalHistoryEditor
                    value={medicalHistoryDraft}
                    busy={busy}
                    onChange={setMedicalHistoryDraft}
                    onSave={savePermanentMedicalHistory}
                    onCancel={() => setMedicalHistoryMode("read")}
                  />
                ) : null}

                {medicalHistoryMode === "read" ? (
                  medicalHistoryGroups.length > 0 ? (
                    <div className="questionnaire-history">
                      <div className="panel-header">
                        <strong>Cuestionario de antecedentes</strong>
                        <p>
                          {permanentMedicalHistory
                            ? "Última versión revisada por el médico."
                            : "Respuestas recibidas del paciente, aún sin guardar como expediente permanente."}
                        </p>
                      </div>
                      <MedicalHistoryGroups groups={medicalHistoryGroups} />
                    </div>
                  ) : (
                    <div className="empty-state">
                      <strong>Sin antecedentes capturados</strong>
                      <p>Usa Editar antecedentes para completar el expediente.</p>
                    </div>
                  )
                ) : null}
              </section>
            ) : null}

            {resolvedSection === "ia" && !signed ? (
              <section className="panel transcription-panel">
                <div className="consultation-section-heading transcription-heading">
                  <div>
                    <span className="section-kicker">Dictado clínico</span>
                    <h2>Transcripción de la consulta</h2>
                    <p>
                      Captura la conversación, confirma los hablantes y deja el texto listo
                      para que Ayuda IA genere la nota clínica.
                    </p>
                  </div>
                  <div className="consultation-save-meta">
                    {reviewedTranscription ? <span>Revisada</span> : <span>Por revisar</span>}
                    <span>
                      {transcriptionMode === "local"
                        ? "Local"
                        : transcriptionMode === "cloud_diarized"
                          ? "Nube (con hablantes)"
                          : "Nube (estándar)"}
                    </span>
                  </div>
                </div>
                <TranscriptionWorkspace
                  busy={busy}
                  voiceConsent={aiVoiceConsent}
                  recordingState={recordingState}
                  recordingSeconds={recordingSeconds}
                  recordingError={recordingError}
                  mode={transcriptionMode}
                  cloudProvider={cloudProvider}
                  numSpeakers={numSpeakers}
                  transcribing={transcribing}
                  turns={scribeTurns}
                  diarizedReview={diarizedReview}
                  rolesResolved={!diarizedReview || diarizedRolesResolved(diarizedReview)}
                  reviewed={Boolean(reviewedTranscription)}
                  provider={aiTranscription?.provider ?? reviewedTranscription?.run_id ?? null}
                  onToggleConsent={() => void toggleVoiceConsent()}
                  onStart={() => void startConsultationRecording()}
                  onPause={() => void pauseConsultationRecording()}
                  onResume={() => void resumeConsultationRecording()}
                  onStop={stopConsultationRecording}
                  onFile={transcribeAudioFile}
                  onModeChange={setTranscriptionMode}
                  onCloudProviderChange={setCloudProvider}
                  onNumSpeakersChange={setNumSpeakers}
                  onTurnChange={updateScribeTurn}
                  onAssignDiarizedRole={assignScribeDiarizedRole}
                  onSpeakerRoleChange={assignScribeSpeakerRole}
                  onSwapRoles={swapScribeRoles}
                  onMarkReviewed={markTranscriptionReviewed}
                  onDiscard={discardAiTranscription}
                />
              </section>
            ) : null}

            {resolvedSection === "nota" ? (
              <section className="consultation-soap">
                <div className="consultation-section-heading">
                  <div>
                    <h2>Nota clínica — SOAP</h2>
                    <p>Estructura tu razonamiento; el dictado llena los campos y tú revisas.</p>
                  </div>
                  <div className="consultation-save-meta">
                    {detail.note ? <span>v{detail.note.version}</span> : null}
                    {signed ? <span>Firmada</span> : <span>Edición activa</span>}
                  </div>
                </div>
                <div className="soap-field-grid">
                  {NOTE_FIELDS.map(({ key, label, rows }, index) => (
                    <label className="soap-field-card" key={key}>
                      <span className="soap-field-heading">
                        <span className="soap-field-key">{index + 1}</span>
                        <span>{label}</span>
                      </span>
                      <AutoGrowTextarea
                        rows={rows}
                        value={note[key]}
                        disabled={busy || signed}
                        onChange={(e) => setNote((current) => ({ ...current, [key]: e.target.value }))}
                      />
                    </label>
                  ))}
                </div>
                {!signed ? (
                  <div className="button-row">
                    <button className="action-button" onClick={saveNote} disabled={busy}>
                      Guardar nota
                    </button>
                  </div>
                ) : null}
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
            <>
              <DentalNoteEditor
                patientId={patientId}
                encounterId={encounterId}
                payload={coerceDentalPayload(note.specialty)}
                disabled={busy || signed}
                onChange={(specialty) => setNote((current) => ({ ...current, specialty }))}
              />
              <section className="dental-note-aids">
                <DentalEvolutionPanel
                  patientId={patientId}
                  encounterId={encounterId}
                  payload={coerceDentalPayload(note.specialty)}
                  disabled={busy || signed}
                  onInsert={(text) =>
                    setNote((current) => ({
                      ...current,
                      objective: current.objective.trim() === ""
                        ? text
                        : `${current.objective.trimEnd()}\n\n${text}`
                    }))
                  }
                />
                <PostOpInstructionsPanel
                  treatmentPlan={coerceDentalPayload(note.specialty).treatmentPlan}
                  disabled={busy || signed}
                  onInsert={(text) =>
                    setNote((current) => ({
                      ...current,
                      instructions: current.instructions.trim() === ""
                        ? text
                        : `${current.instructions.trimEnd()}\n\n${text}`
                    }))
                  }
                />
              </section>
              {/* Operativo, no clinico: el presupuesto se decide y se abona
                  aun con la nota firmada. */}
              <DentalBudgetPanel
                patientId={patientId}
                encounterId={detail.encounter.id}
                treatmentPlan={coerceDentalPayload(note.specialty).treatmentPlan}
                disabled={busy}
              />
              <DentalLabPanel
                patientId={patientId}
                encounterId={detail.encounter.id}
                disabled={busy}
              />
            </>
          ) : (
            <div className="soap-field-grid">
              {GENERAL_MEDICINE_FIELDS.map(({ key, label, rows }, index) => (
                <label className="soap-field-card" key={key}>
                  <span className="soap-field-heading">
                    <span className="soap-field-key">{index + 1}</span>
                    <span>{label}</span>
                  </span>
                  <AutoGrowTextarea
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
          <div className="soap-field-grid">
            <label className="soap-field-card">
              <span className="soap-field-heading">
                <span>Receta</span>
              </span>
              <AutoGrowTextarea
                rows={4}
                placeholder="Medicamento, dosis, via, frecuencia y duracion…"
                value={prescription}
                disabled={busy || signed}
                onChange={(e) => setPrescription(e.target.value)}
              />
            </label>
          </div>
          {!signed ? (
            <div className="button-row">
              <button className="action-button" onClick={savePrescription} disabled={busy}>
                Guardar receta
              </button>
            </div>
          ) : null}
          <MedicationSafety encounterId={encounterId} disabled={signed} prescription={prescription} />
        </section>
            ) : null}

            {resolvedSection === "ayuda" ? (
              <ClinicalAidRail
                ready={Boolean(reviewedTranscription)}
                consent={aiScribeConsent}
                hasHistory={medicalHistoryGroups.length > 0}
                hasPreconsulta={Boolean(detail.preconsulta)}
                templates={profileTemplates.map((template) => ({
                  id: template.id,
                  name: template.name
                }))}
                selectedTemplateId={selectedTemplateId}
                templateSegments={activeTemplate.segments}
                specialtyLabel={moduleLabel}
                busy={busy}
                draft={clinicalAidDraft}
                onToggleConsent={() => void toggleScribeConsent()}
                onTemplateChange={setSelectedTemplateId}
                onGenerate={() => generateClinicalAid()}
                onApplySoap={applyClinicalAidSoap}
                onApplySegment={applyScribeSegment}
                onApplyPrescription={applyClinicalAidPrescription}
                onApplyBackground={applyClinicalAidBackground}
                onDiscard={discardClinicalAid}
              />
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
        </main>
      </div>
    </div>
  );
}
