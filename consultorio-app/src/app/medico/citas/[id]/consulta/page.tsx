"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  ArrowLeft,
  Brain,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  Loader2,
  Mic,
  Save,
  Sparkles,
  Square,
  Stethoscope,
  User,
  Utensils,
  WifiOff,
} from "lucide-react";
import { Button } from "@/components/Button";
import { TextArea } from "@/components/TextArea";
import { format, differenceInMinutes } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import {
  formatQuestionnaireLabel,
  formatQuestionnaireTag,
  formatQuestionnaireValue,
} from "@/lib/questionnaireFormatting";

type SoapData = {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  privateNotes: string;
};

type AppointmentData = {
  id: string;
  doctorId: string;
  status: string;
  startTime: string;
  durationMin: number;
  appointmentType: string;
  patient: {
    id: string;
    fullName: string;
    phone: string;
    email?: string | null;
    dateOfBirth: string;
  };
  questionnaire?: {
    primarySymptom?: string | null;
    createdAt: string;
    responses?: {
      duration?: string;
      basic?: { weight?: string; height?: string };
      dynamicAnswers?: Record<string, unknown>;
      additionalSymptomCategories?: string[];
      conditions?: string[];
      allergies?: string;
      medications?: string;
    } | null;
  } | null;
};

type AIInsights = {
  diagnoses?: Array<{ diagnosis: string; reasoning: string }>;
  treatments?: Array<{ treatment: string; instructions: string }>;
  allowedFoods?: string[];
  forbiddenFoods?: string[];
};

type NoteGenerationEvent = {
  id: string;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
  progressPct: number;
  statusMessage?: string | null;
  resultPayload?: {
    soap?: Partial<SoapData>;
  } | null;
  errorMessage?: string | null;
};

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const AUTOSAVE_DEBOUNCE_MS = 2500;

function calculateAge(dateOfBirth: string | null | undefined): number | null {
  if (!dateOfBirth) return null;
  const birth = new Date(dateOfBirth);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

function formatRecordingTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function ConsultaModePage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const router = useRouter();

  const [appointment, setAppointment] = useState<AppointmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [noteData, setNoteData] = useState<SoapData>({
    subjective: "",
    objective: "",
    assessment: "",
    plan: "",
    privateNotes: "",
  });
  const [contextTab, setContextTab] = useState<"questionnaire" | "ai">("questionnaire");
  const [aiInsights, setAiInsights] = useState<AIInsights | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStatus, setGenerationStatus] = useState("");

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [completing, setCompleting] = useState(false);
  const [now, setNow] = useState(new Date());

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const loadedNoteRef = useRef<SoapData | null>(null);
  const savingRef = useRef(false);

  // Load appointment + existing note + insights
  useEffect(() => {
    let active = true;

    fetch(`/api/clinical/admin/appointments/${params.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (!active || data?.error) return;
        setAppointment(data);
      })
      .catch(() => undefined);

    fetch(`/api/clinical/admin/appointments/${params.id}/note`)
      .then((res) => res.json())
      .then((data) => {
        if (!active || data?.error || !data?.id) return;
        const loaded: SoapData = {
          subjective: data.subjective || "",
          objective: data.objective || "",
          assessment: data.assessment || "",
          plan: data.plan || "",
          privateNotes: data.privateNotes || "",
        };
        setNoteData(loaded);
        loadedNoteRef.current = loaded;
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setLoading(false);
      });

    fetch(`/api/clinical/admin/appointments/${params.id}/ai-insights`)
      .then((res) => res.json())
      .then((data) => {
        if (active && data?.id) setAiInsights(data as AIInsights);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [params.id]);

  // Ticking clock for elapsed time
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Dirty tracking
  const isDirty = useMemo(() => {
    const baseline = loadedNoteRef.current;
    if (!baseline) return false;
    return (
      baseline.subjective !== noteData.subjective ||
      baseline.objective !== noteData.objective ||
      baseline.assessment !== noteData.assessment ||
      baseline.plan !== noteData.plan ||
      baseline.privateNotes !== noteData.privateNotes
    );
  }, [noteData]);

  const persistNote = useCallback(
    async (silent: boolean) => {
      if (savingRef.current) return;
      savingRef.current = true;
      setSaveState("saving");
      try {
        const res = await fetch(`/api/clinical/admin/appointments/${params.id}/note`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...noteData, prescriptions: [] }),
        });
        if (!res.ok) throw new Error("No se pudo guardar la evolución");

        loadedNoteRef.current = { ...noteData };
        setLastSavedAt(new Date());
        setSaveState("saved");
        if (!silent) toast.success("Evolución guardada");
      } catch (error) {
        setSaveState("error");
        if (!silent) {
          toast.error(error instanceof Error ? error.message : "Error guardando");
        }
      } finally {
        savingRef.current = false;
      }
    },
    [noteData, params.id]
  );

  // Autosave on dirty + debounce
  useEffect(() => {
    if (!isDirty) {
      if (saveState !== "saved" && saveState !== "error") setSaveState("idle");
      return;
    }
    setSaveState("dirty");
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      void persistNote(true);
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteData, isDirty]);

  // Recording
  const subscribeToGeneration = useCallback(
    (jobId: string) => {
      if (eventSourceRef.current) eventSourceRef.current.close();
      const source = new EventSource(
        `/api/clinical/admin/appointments/${params.id}/note/generate/events?jobId=${jobId}`
      );
      eventSourceRef.current = source;

      source.addEventListener("status", (event) => {
        const payload = JSON.parse((event as MessageEvent<string>).data) as NoteGenerationEvent;
        setGenerationProgress(payload.progressPct ?? 0);
        setGenerationStatus(payload.statusMessage || "");

        if (payload.status === "COMPLETED") {
          const soap = payload.resultPayload?.soap;
          if (soap) {
            setNoteData((prev) => ({
              ...prev,
              subjective:
                soap.subjective && soap.subjective !== "No se menciona en la consulta"
                  ? soap.subjective
                  : prev.subjective,
              objective:
                soap.objective && soap.objective !== "No se menciona en la consulta"
                  ? soap.objective
                  : prev.objective,
              assessment:
                soap.assessment && soap.assessment !== "No se menciona en la consulta"
                  ? soap.assessment
                  : prev.assessment,
              plan:
                soap.plan && soap.plan !== "No se menciona en la consulta"
                  ? soap.plan
                  : prev.plan,
            }));
          }
          setIsGenerating(false);
          toast.success("Nota generada con IA. Revísala antes de guardar.");
          source.close();
          eventSourceRef.current = null;
        }

        if (payload.status === "FAILED") {
          setIsGenerating(false);
          toast.error(payload.errorMessage || "No fue posible generar la nota con IA.");
          source.close();
          eventSourceRef.current = null;
        }
      });

      source.onerror = () => {
        if (eventSourceRef.current !== source) return;
        source.close();
        eventSourceRef.current = null;
      };
    },
    [params.id]
  );

  const handleGenerateFromAudio = useCallback(
    async (blob: Blob) => {
      setIsGenerating(true);
      setGenerationProgress(10);
      setGenerationStatus("Subiendo audio...");
      const form = new FormData();
      form.append("audio", blob, `consulta-${params.id}.webm`);
      try {
        const res = await fetch(`/api/clinical/admin/appointments/${params.id}/note/generate`, {
          method: "POST",
          body: form,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Error al procesar audio");
        if (data.jobId) subscribeToGeneration(data.jobId);
      } catch (error) {
        setIsGenerating(false);
        setGenerationProgress(0);
        setGenerationStatus("");
        toast.error(error instanceof Error ? error.message : "Error al procesar audio");
      }
    },
    [params.id, subscribeToGeneration]
  );

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Este navegador no soporta grabación clínica.");
      return;
    }
    try {
      // Verbal consent capture
      await fetch(`/api/clinical/admin/appointments/${params.id}/consent`, { method: "POST" }).catch(
        () => undefined
      );

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime =
        typeof MediaRecorder.isTypeSupported === "function" &&
        MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        void handleGenerateFromAudio(blob);
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
      toast.info("Grabación iniciada. Consentimiento verbal registrado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo acceder al micrófono.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
  };

  const handleGenerateInsights = async () => {
    setLoadingInsights(true);
    try {
      const res = await fetch(`/api/clinical/admin/appointments/${params.id}/ai-insights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ soap: noteData }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al generar sugerencias");
      setAiInsights(data as AIInsights);
      toast.success("Sugerencias regeneradas.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error generando sugerencias");
    } finally {
      setLoadingInsights(false);
    }
  };

  const applyDiagnosisToSoap = (diag: string) => {
    setNoteData((prev) => ({
      ...prev,
      assessment: prev.assessment ? `${prev.assessment}\n- ${diag}` : diag,
    }));
  };

  const applyTreatmentToSoap = (treatment: string) => {
    setNoteData((prev) => ({
      ...prev,
      plan: prev.plan ? `${prev.plan}\n- ${treatment}` : treatment,
    }));
  };

  const handleFinalize = async () => {
    if (isDirty) {
      await persistNote(true);
    }
    setCompleting(true);
    try {
      const res = await fetch(`/api/clinical/admin/appointments/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || data.error || "No fue posible finalizar");
      }
      toast.success("Consulta finalizada");
      router.push("/medico/agenda");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error finalizando");
    } finally {
      setCompleting(false);
    }
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
      if (eventSourceRef.current) eventSourceRef.current.close();
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Cargando consulta...
      </div>
    );
  }

  if (!appointment) {
    return (
      <div className="min-h-screen flex items-center justify-center text-destructive">
        Cita no encontrada.
      </div>
    );
  }

  const patientAge = calculateAge(appointment.patient.dateOfBirth);
  const startTime = new Date(appointment.startTime);
  const elapsedMin = Math.max(0, differenceInMinutes(now, startTime));
  const overtime = elapsedMin > appointment.durationMin;

  const q = appointment.questionnaire;
  const qResponses = q?.responses;
  const dynamicEntries = qResponses?.dynamicAnswers
    ? Object.entries(qResponses.dynamicAnswers).filter(([, v]) => {
        if (v === null || v === undefined) return false;
        if (typeof v === "string") return v.trim() !== "";
        return true;
      })
    : [];

  const tags = Array.from(
    new Set(
      [
        q?.primarySymptom?.trim() || "",
        ...(qResponses?.additionalSymptomCategories || []).map((t) => t.trim()).filter(Boolean),
      ].filter(Boolean)
    )
  );

  const saveLabel: Record<SaveState, string> = {
    idle: "Sin cambios",
    dirty: "Cambios sin guardar",
    saving: "Guardando...",
    saved: lastSavedAt ? `Guardado ${format(lastSavedAt, "HH:mm:ss")}` : "Guardado",
    error: "Error al guardar",
  };

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Top bar */}
      <header className="border-b border-border bg-card flex-shrink-0">
        <div className="px-4 md:px-6 py-3 flex items-center gap-3 md:gap-4">
          <button
            onClick={() => router.push(`/medico/citas/${params.id}`)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            title="Vista completa"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden md:inline">Salir</span>
          </button>

          <div className="h-8 w-px bg-border" />

          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-foreground text-sm md:text-base truncate">
                {appointment.patient.fullName}
              </div>
              <div className="text-xs text-muted-foreground">
                {patientAge !== null ? `${patientAge} años · ` : ""}
                {appointment.patient.phone}
              </div>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-4 text-sm flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-foreground">
                {format(startTime, "HH:mm", { locale: es })}
              </span>
            </div>
            <div
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${
                overtime
                  ? "bg-warning/10 text-warning"
                  : "bg-primary/10 text-primary"
              }`}
            >
              {elapsedMin} / {appointment.durationMin} min
            </div>
          </div>

          <div
            className={`hidden md:flex items-center gap-1.5 text-xs flex-shrink-0 ${
              saveState === "error"
                ? "text-destructive"
                : saveState === "saved"
                  ? "text-success"
                  : saveState === "saving"
                    ? "text-primary"
                    : "text-muted-foreground"
            }`}
          >
            {saveState === "saving" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : saveState === "error" ? (
              <WifiOff className="w-3.5 h-3.5" />
            ) : saveState === "saved" ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>{saveLabel[saveState]}</span>
          </div>

          <Button
            size="sm"
            onClick={handleFinalize}
            disabled={completing}
            className="flex-shrink-0"
          >
            {completing ? (
              <>
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                <span className="hidden sm:inline">Finalizando</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 mr-1.5" />
                <span>Finalizar</span>
              </>
            )}
          </Button>
        </div>
      </header>

      {/* Body split */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Context pane */}
        <aside className="lg:w-[38%] lg:border-r border-b lg:border-b-0 border-border bg-secondary/20 overflow-y-auto">
          <div className="sticky top-0 bg-secondary/80 backdrop-blur px-4 py-2 border-b border-border flex gap-1 z-10">
            <button
              onClick={() => setContextTab("questionnaire")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                contextTab === "questionnaire"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ClipboardList className="w-4 h-4" />
              Cuestionario
            </button>
            <button
              onClick={() => setContextTab("ai")}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                contextTab === "ai"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sparkles className="w-4 h-4" />
              IA Insights
            </button>
          </div>

          <div className="p-4 space-y-4">
            {contextTab === "questionnaire" ? (
              q ? (
                <>
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium"
                        >
                          {formatQuestionnaireTag(tag)}
                        </span>
                      ))}
                    </div>
                  )}

                  {qResponses?.duration && (
                    <KV label="Duración del síntoma" value={qResponses.duration} />
                  )}

                  {(qResponses?.basic?.weight || qResponses?.basic?.height) && (
                    <div className="grid grid-cols-2 gap-2">
                      {qResponses.basic?.weight && (
                        <KV label="Peso" value={`${qResponses.basic.weight} kg`} />
                      )}
                      {qResponses.basic?.height && (
                        <KV label="Altura" value={`${qResponses.basic.height} cm`} />
                      )}
                    </div>
                  )}

                  {dynamicEntries.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Respuestas
                      </div>
                      {dynamicEntries.map(([key, value]) => (
                        <KV
                          key={key}
                          label={formatQuestionnaireLabel(key)}
                          value={formatQuestionnaireValue(value)}
                        />
                      ))}
                    </div>
                  )}

                  {qResponses?.conditions && qResponses.conditions.length > 0 && (
                    <KV
                      label="Condiciones previas"
                      value={qResponses.conditions.join(", ")}
                    />
                  )}

                  {qResponses?.allergies && (
                    <KV label="Alergias" value={qResponses.allergies} highlight />
                  )}

                  {qResponses?.medications && (
                    <KV label="Medicamentos actuales" value={qResponses.medications} />
                  )}
                </>
              ) : (
                <div className="text-center py-10 text-sm text-muted-foreground">
                  <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  Este paciente no llenó el cuestionario pre-consulta.
                </div>
              )
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Basado en cuestionario y SOAP
                  </span>
                  <Button
                    size="sm"
                    variant="tertiary"
                    onClick={handleGenerateInsights}
                    disabled={loadingInsights}
                  >
                    {loadingInsights ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <Brain className="w-3.5 h-3.5 mr-1" />
                        {aiInsights ? "Regenerar" : "Generar"}
                      </>
                    )}
                  </Button>
                </div>

                {!aiInsights && !loadingInsights && (
                  <div className="text-center py-10 text-sm text-muted-foreground">
                    <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    Aún sin sugerencias. Presiona &quot;Generar&quot;.
                  </div>
                )}

                {aiInsights?.diagnoses && aiInsights.diagnoses.length > 0 && (
                  <Section
                    icon={<Stethoscope className="w-4 h-4" />}
                    title="Diagnósticos sugeridos"
                  >
                    <div className="space-y-2">
                      {aiInsights.diagnoses.map((d, i) => (
                        <button
                          key={i}
                          onClick={() => applyDiagnosisToSoap(d.diagnosis)}
                          className="w-full text-left p-3 rounded-lg bg-card border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors"
                        >
                          <div className="font-medium text-sm text-foreground">
                            {d.diagnosis}
                          </div>
                          {d.reasoning && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {d.reasoning}
                            </div>
                          )}
                          <div className="text-xs text-primary mt-2">
                            → agregar a Evaluación
                          </div>
                        </button>
                      ))}
                    </div>
                  </Section>
                )}

                {aiInsights?.treatments && aiInsights.treatments.length > 0 && (
                  <Section
                    icon={<FileText className="w-4 h-4" />}
                    title="Tratamientos sugeridos"
                  >
                    <div className="space-y-2">
                      {aiInsights.treatments.map((t, i) => (
                        <button
                          key={i}
                          onClick={() => applyTreatmentToSoap(t.treatment)}
                          className="w-full text-left p-3 rounded-lg bg-card border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors"
                        >
                          <div className="font-medium text-sm text-foreground">
                            {t.treatment}
                          </div>
                          {t.instructions && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {t.instructions}
                            </div>
                          )}
                          <div className="text-xs text-primary mt-2">
                            → agregar a Plan
                          </div>
                        </button>
                      ))}
                    </div>
                  </Section>
                )}

                {(aiInsights?.allowedFoods?.length || aiInsights?.forbiddenFoods?.length) && (
                  <Section icon={<Utensils className="w-4 h-4" />} title="Plan alimenticio">
                    {aiInsights.allowedFoods && aiInsights.allowedFoods.length > 0 && (
                      <div className="mb-2">
                        <div className="text-xs font-semibold text-success mb-1">Permitidos</div>
                        <div className="flex flex-wrap gap-1">
                          {aiInsights.allowedFoods.map((f, i) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 rounded-md bg-success/10 text-success text-xs"
                            >
                              {f}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {aiInsights.forbiddenFoods && aiInsights.forbiddenFoods.length > 0 && (
                      <div>
                        <div className="text-xs font-semibold text-destructive mb-1">Evitar</div>
                        <div className="flex flex-wrap gap-1">
                          {aiInsights.forbiddenFoods.map((f, i) => (
                            <span
                              key={i}
                              className="px-2 py-0.5 rounded-md bg-destructive/10 text-destructive text-xs"
                            >
                              {f}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </Section>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* SOAP pane */}
        <section className="flex-1 overflow-y-auto">
          <div className="p-4 md:p-6 space-y-4 max-w-3xl mx-auto">
            {/* Recording control */}
            <div
              className={`rounded-2xl border p-4 transition-colors ${
                isRecording
                  ? "border-destructive/50 bg-destructive/5"
                  : isGenerating
                    ? "border-primary/40 bg-primary/5"
                    : "border-border bg-card"
              }`}
            >
              <div className="flex items-center gap-4">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={isRecording ? stopRecording : startRecording}
                  disabled={isGenerating}
                  className={`w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${
                    isRecording
                      ? "bg-destructive text-destructive-foreground animate-pulse"
                      : "bg-primary text-primary-foreground hover:bg-primary/90"
                  } disabled:opacity-50`}
                >
                  {isRecording ? <Square className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                </motion.button>
                <div className="flex-1 min-w-0">
                  {isRecording ? (
                    <>
                      <div className="text-sm font-semibold text-destructive">Grabando</div>
                      <div className="text-2xl font-bold tabular-nums text-foreground">
                        {formatRecordingTime(recordingSeconds)}
                      </div>
                    </>
                  ) : isGenerating ? (
                    <>
                      <div className="text-sm font-medium text-primary">
                        {generationStatus || "Procesando audio..."}
                      </div>
                      <div className="mt-2 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${generationProgress}%` }}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="text-sm font-semibold text-foreground">
                        Grabar consulta
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        La IA transcribirá y llenará el SOAP automáticamente.
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* SOAP fields */}
            <SoapField
              label="S — Subjetivo"
              hint="Qué refiere el paciente"
              value={noteData.subjective}
              onChange={(v) => setNoteData((prev) => ({ ...prev, subjective: v }))}
            />
            <SoapField
              label="O — Objetivo"
              hint="Hallazgos de la exploración"
              value={noteData.objective}
              onChange={(v) => setNoteData((prev) => ({ ...prev, objective: v }))}
            />
            <SoapField
              label="A — Evaluación"
              hint="Diagnósticos"
              value={noteData.assessment}
              onChange={(v) => setNoteData((prev) => ({ ...prev, assessment: v }))}
            />
            <SoapField
              label="P — Plan"
              hint="Tratamiento y seguimiento"
              value={noteData.plan}
              onChange={(v) => setNoteData((prev) => ({ ...prev, plan: v }))}
            />

            <details className="rounded-xl border border-border">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground">
                Notas privadas del médico (no visibles al paciente)
              </summary>
              <div className="px-4 pb-4">
                <TextArea
                  value={noteData.privateNotes}
                  onChange={(e) =>
                    setNoteData((prev) => ({ ...prev, privateNotes: e.target.value }))
                  }
                  rows={3}
                  placeholder="Observaciones internas..."
                />
              </div>
            </details>

            <div className="flex gap-2 pt-2">
              <Button
                onClick={() => void persistNote(false)}
                disabled={saveState === "saving" || !isDirty}
                variant="secondary"
                fullWidth
              >
                <Save className="w-4 h-4 mr-2" />
                Guardar ahora
              </Button>
              <Button
                onClick={() => router.push(`/medico/citas/${params.id}`)}
                variant="tertiary"
                fullWidth
              >
                Receta y detalles
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function KV({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-2.5 ${
        highlight ? "border-warning/40 bg-warning/5" : "border-border bg-card"
      }`}
    >
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
        {label}
      </div>
      <div className="text-sm text-foreground mt-0.5 break-words">{value}</div>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function SoapField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="text-sm font-semibold text-foreground">{label}</label>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
      <TextArea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        placeholder={hint}
      />
    </div>
  );
}



