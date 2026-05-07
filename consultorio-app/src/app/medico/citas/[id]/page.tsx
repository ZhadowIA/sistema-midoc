"use client";

import { useState, useEffect, use, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft, User, Phone, Mail, Calendar, Clock,
  CheckCircle2, XCircle, Save, Printer, Plus, Trash2,
  Mic, Square, Wand2, Loader2, AlertCircle, Brain, Stethoscope, Utensils, AlertTriangle, ChevronRight, Pill, Info
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { DoctorLayout } from "@/components/DoctorLayout";
import { PatientClinicalAlerts } from "@/components/clinical/PatientClinicalAlerts";
import { Button } from "@/components/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/Card";
import { TextArea } from "@/components/TextArea";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Input } from "@/components/Input";
import { toast } from "sonner";
import { formatPatientName } from "@/lib/patientName";
import {
  formatQuestionnaireLabel,
  formatQuestionnaireTag,
  formatQuestionnaireValue,
} from "@/lib/questionnaireFormatting";

const STATUS_OPTIONS = [
  { value: "PENDING", label: "Pendiente", color: "bg-warning/10 text-warning border-warning/30", icon: Clock },
  { value: "CONFIRMED", label: "Confirmada", color: "bg-primary/10 text-primary border-primary/30", icon: CheckCircle2 },
  { value: "COMPLETED", label: "Realizada", color: "bg-success/10 text-success border-success/30", icon: CheckCircle2 },
  { value: "CANCELLED", label: "Cancelada", color: "bg-destructive/10 text-destructive border-destructive/30", icon: XCircle },
];

type PrescriptionForm = {
  medication: string
  dosage: string
  frequency: string
  duration: string
  instructions: string
}

type DirectoryPatientOption = {
  id: string
  firstName?: string | null
  lastNamePaternal?: string | null
  lastNameMaternal?: string | null
  phone: string
}

type AppointmentData = {
  id: string
  doctorId: string
  status: string
  notes?: string | null
  startTime: string
  durationMin: number
  appointmentType: string
  source: string
  patient: {
    id: string
    firstName?: string | null
    lastNamePaternal?: string | null
    lastNameMaternal?: string | null
    phone: string
    email?: string | null
    dateOfBirth: string
    ownerDoctorId?: string | null
  }
  questionnaire?: {
    primarySymptom?: string | null
    createdAt: string
    responses?: {
      duration?: string
      basic?: {
        weight?: string
        height?: string
      }
      dynamicAnswers?: Record<string, unknown>
      additionalSymptomCategories?: string[]
      conditions?: string[]
      allergies?: string
      medications?: string
    } | null
  } | null
  consentCaptures?: Array<{
    id: string
    type: string
    createdAt: string
  }>
}

type AIInsightDiagnosis = {
  diagnosis: string
  reasoning: string
}

type AIInsightTreatment = {
  treatment: string
  instructions: string
}

type AIInsights = {
  diagnoses?: AIInsightDiagnosis[]
  treatments?: AIInsightTreatment[]
  allowedFoods?: string[]
  forbiddenFoods?: string[]
}

type PrescriptionAlert = {
  severity: "high" | "medium" | "low"
  message: string
  recommendation: string
}

type MicrophonePermissionState = "unknown" | "prompt" | "granted" | "denied" | "unsupported";

type NoteGenerationEvent = {
  id: string;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
  progressPct: number;
  statusMessage?: string | null;
  resultPayload?: {
    soap?: {
      subjective?: string;
      objective?: string;
      assessment?: string;
      plan?: string;
    };
  } | null;
  errorMessage?: string | null;
};

type PrecheckinSummary = {
  precheckin?: {
    attendanceConfirmed?: boolean
    demographicsConfirmed?: boolean
    pendingPaymentsAcknowledged?: boolean
    notes?: string | null
    createdAt?: string
  } | null
  documents?: Array<{
    id: string
    category: string
    fileName: string
    fileUrl: string
    uploadedAt: string
  }>
}

export default function AppointmentDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const [appointment, setAppointment] = useState<AppointmentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState("");
  const [notes, setNotes] = useState("");
  const [showRescheduleMenu, setShowRescheduleMenu] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleSlots, setRescheduleSlots] = useState<Array<{ start: string; end: string; type: string }>>([]);
  const [rescheduleSlot, setRescheduleSlot] = useState<string>("");
  const [loadingRescheduleSlots, setLoadingRescheduleSlots] = useState(false);
  const [directoryPatients, setDirectoryPatients] = useState<DirectoryPatientOption[]>([]);
  const [loadingDirectoryPatients, setLoadingDirectoryPatients] = useState(false);
  const [selectedDirectoryPatientId, setSelectedDirectoryPatientId] = useState("");
  const [patientSearchTerm, setPatientSearchTerm] = useState("");
  const [patientSearchOpen, setPatientSearchOpen] = useState(false);
  const [assigningPatient, setAssigningPatient] = useState(false);
  const [creatingAndAssigningPatient, setCreatingAndAssigningPatient] = useState(false);
  const [clinicalTab, setClinicalTab] = useState<"soap" | "questionnaire" | "ai">("soap");
  const [precheckinSummary, setPrecheckinSummary] = useState<PrecheckinSummary | null>(null);
  const [uploadsEnabled, setUploadsEnabled] = useState(false);
  const [uploadsExpiresInHours, setUploadsExpiresInHours] = useState(24);
  const [externalUploadLink, setExternalUploadLink] = useState("");
  const [doctorUploadFile, setDoctorUploadFile] = useState<File | null>(null);
  const [doctorDocuments, setDoctorDocuments] = useState<Array<{ id: string; fileName: string; fileUrl: string; uploadedAt: string; uploadSource?: string }>>([]);

  // Notas Médicas (SOAP)
  const [noteData, setNoteData] = useState({
    subjective: "",
    objective: "",
    assessment: "",
    plan: "",
    privateNotes: "",
    prescriptions: [] as PrescriptionForm[]
  });
  const [savingNote, setSavingNote] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const noteDataOriginalRef = useRef<typeof noteData | null>(null);
  const isDirtyNote = noteDataOriginalRef.current !== null &&
    JSON.stringify(noteData) !== JSON.stringify(noteDataOriginalRef.current);

  // AI Recording & Generation
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState("");
  const [generationProgress, setGenerationProgress] = useState(0);
  const [microphonePermission, setMicrophonePermission] = useState<MicrophonePermissionState>("unknown");
  const [isConfirmingConsent, setIsConfirmingConsent] = useState(false);
  const [lastVerbalConsentAt, setLastVerbalConsentAt] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const appointmentId = appointment?.id

  // AI Insights State
  const [aiInsights, setAiInsights] = useState<AIInsights | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [prescriptionAlerts, setPrescriptionAlerts] = useState<PrescriptionAlert[]>([]);
  const [validatingPrescription, setValidatingPrescription] = useState(false);

  const formatDirectoryPatientLabel = (patient: DirectoryPatientOption) =>
    `${formatPatientName(patient)} · ${patient.phone}`;

  const filteredDirectoryPatients = useMemo(() => {
    const normalizedTerm = patientSearchTerm.trim().toLowerCase();
    if (!normalizedTerm) return directoryPatients.slice(0, 8);

    return directoryPatients
      .filter((patient) =>
        `${formatPatientName(patient)} ${patient.phone}`.toLowerCase().includes(normalizedTerm)
      )
      .slice(0, 12);
  }, [directoryPatients, patientSearchTerm]);

  useEffect(() => {
    fetch(`/api/clinical/admin/appointments/${params.id}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) return;
        setAppointment(data);
        setSelectedStatus(data.status === "RESCHEDULED" ? "CONFIRMED" : data.status);
        setNotes(data.notes || "");
        const latestConsent = Array.isArray(data.consentCaptures)
          ? data.consentCaptures.find((item: { type?: string }) => item.type === "VERBAL_RECORDING_CONFIRMATION")
          : null;
        setLastVerbalConsentAt(latestConsent?.createdAt || null);
        setSelectedDirectoryPatientId(data.patient?.ownerDoctorId ? data.patient.id : "");
        setPatientSearchTerm(
          data.patient?.ownerDoctorId ? formatDirectoryPatientLabel(data.patient) : ""
        );
      })
      .catch(console.error);

    fetch(`/api/clinical/admin/appointments/${params.id}/note`)
      .then(res => res.json())
      .then(data => {
        if (!data.error && data.id) {
          const loaded = {
            subjective: data.subjective || "",
            objective: data.objective || "",
            assessment: data.assessment || "",
            plan: data.plan || "",
            privateNotes: data.privateNotes || "",
            prescriptions: data.prescriptions || []
          };
          setNoteData(loaded);
          noteDataOriginalRef.current = loaded;
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));

    // Load existing insights
    fetch(`/api/clinical/admin/appointments/${params.id}/ai-insights`)
      .then(res => res.json())
      .then(data => {
        if (data.id) setAiInsights(data);
      })
      .catch(console.error);
  }, [params.id]);

  useEffect(() => {
    if (!appointment?.patient?.id) return
    fetch(`/api/agenda/admin/patients/${appointment.patient.id}/precheckin-summary`)
      .then((res) => res.json())
      .then((data) => setPrecheckinSummary(data))
      .catch(() => setPrecheckinSummary(null))
  }, [appointment?.patient?.id])

  useEffect(() => {
    if (!appointmentId) return;
    fetch(`/api/clinical/admin/appointments/${appointmentId}/documents`)
      .then((res) => res.json())
      .then((data) => setDoctorDocuments(Array.isArray(data.documents) ? data.documents : []))
      .catch(() => setDoctorDocuments([]));
  }, [appointmentId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("mediaDevices" in navigator) || typeof MediaRecorder === "undefined") {
      setMicrophonePermission("unsupported");
      return;
    }

    if (!("permissions" in navigator) || typeof navigator.permissions?.query !== "function") {
      setMicrophonePermission("unknown");
      return;
    }

    let active = true;
    let permissionStatus: PermissionStatus | null = null;

    void navigator.permissions
      .query({ name: "microphone" as PermissionName })
      .then((status) => {
        if (!active) return;
        permissionStatus = status;
        setMicrophonePermission(status.state as MicrophonePermissionState);
        status.onchange = () => setMicrophonePermission(status.state as MicrophonePermissionState);
      })
      .catch(() => {
        if (active) setMicrophonePermission("unknown");
      });

    return () => {
      active = false;
      if (permissionStatus) permissionStatus.onchange = null;
      if (timerRef.current) clearInterval(timerRef.current);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirtyNote) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirtyNote]);

  useEffect(() => {
    if (!showRescheduleMenu || !rescheduleDate || !appointment) {
      setRescheduleSlots([]);
      setRescheduleSlot("");
      return;
    }

    const qParams = new URLSearchParams({
      date: rescheduleDate,
      doctorId: appointment.doctorId,
      type: appointment.appointmentType.toLowerCase()
    });

    setLoadingRescheduleSlots(true);
    fetch(`/api/agenda/public/availability?${qParams}`)
      .then(res => res.json())
      .then(data => {
        if (data && Array.isArray(data.slots)) {
          setRescheduleSlots(data.slots);
        } else {
          setRescheduleSlots([]);
        }
      })
      .catch(() => setRescheduleSlots([]))
      .finally(() => setLoadingRescheduleSlots(false));
  }, [showRescheduleMenu, rescheduleDate, appointment]);

  useEffect(() => {
    if (!appointmentId) return;

    setLoadingDirectoryPatients(true);
    fetch("/api/clinical/admin/patients")
      .then((res) => res.json())
      .then((data) => {
        const patients = Array.isArray(data) ? (data as DirectoryPatientOption[]) : [];
        setDirectoryPatients(patients);
      })
      .catch(() => setDirectoryPatients([]))
      .finally(() => setLoadingDirectoryPatients(false));
  }, [appointmentId]);

  useEffect(() => {
    if (!selectedDirectoryPatientId) return;
    const selectedPatient = directoryPatients.find(
      (patient) => patient.id === selectedDirectoryPatientId
    );
    if (selectedPatient) {
      setPatientSearchTerm(formatDirectoryPatientLabel(selectedPatient));
    }
  }, [directoryPatients, selectedDirectoryPatientId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/clinical/admin/appointments/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: selectedStatus, notes })
      });
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.message || data.error || "Error al actualizar");
      }
      
      setAppointment(data);
      toast.success("Cita actualizada exitosamente.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error inesperado";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleReschedule = async () => {
    if (!rescheduleSlot) {
      toast.error("Selecciona un horario disponible para reagendar.");
      return;
    }

    setRescheduling(true);
    try {
      const res = await fetch(`/api/clinical/admin/appointments/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "RESCHEDULE",
          newStartTime: rescheduleSlot,
          notes
        })
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.error === 'OVERLAP') {
          throw new Error("Ese módulo ya fue ocupado por otra cita.");
        }
        if (data.error === 'BLOCKED') {
          throw new Error("Ese módulo está bloqueado en agenda.");
        }
        throw new Error(data.message || data.error || "No fue posible reagendar.");
      }

      setAppointment(data);
      setSelectedStatus(data.status);
      setShowRescheduleMenu(false);
      setRescheduleSlot("");
      toast.success("Cita reagendada exitosamente.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error inesperado";
      toast.error(message);
    } finally {
      setRescheduling(false);
    }
  };

  const handleAssignPatient = async () => {
    if (!appointment) return;
    if (!selectedDirectoryPatientId) {
      toast.error("Selecciona un paciente del directorio.");
      return;
    }
    if (selectedDirectoryPatientId === appointment.patient.id) {
      toast.error("Esta cita ya está vinculada a ese paciente del directorio.");
      return;
    }

    setAssigningPatient(true);
    try {
      const res = await fetch(`/api/clinical/admin/appointments/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ASSIGN_PATIENT",
          patientId: selectedDirectoryPatientId,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || data.error || "No fue posible asignar la cita.");
      }

      setAppointment(data);
      setSelectedDirectoryPatientId(data.patient.id);
      setPatientSearchTerm(formatDirectoryPatientLabel(data.patient));
      setPatientSearchOpen(false);
      toast.success("Cita vinculada al paciente del directorio.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error inesperado";
      toast.error(message);
    } finally {
      setAssigningPatient(false);
    }
  };

  const handleCreateAndAssignPatient = async () => {
    if (!appointment) return;
    if (appointment.patient.ownerDoctorId) {
      toast.error("Esta cita ya está vinculada a un expediente del directorio.");
      return;
    }

    setCreatingAndAssigningPatient(true);
    try {
      const res = await fetch(`/api/clinical/admin/appointments/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "CREATE_AND_ASSIGN_PATIENT",
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || data.error || "No fue posible crear y vincular el paciente.");
      }

      setAppointment(data);
      setSelectedDirectoryPatientId(data.patient.id);
      setPatientSearchTerm(formatDirectoryPatientLabel(data.patient));
      setPatientSearchOpen(false);
      setDirectoryPatients((prev) => {
        if (prev.some((item) => item.id === data.patient.id)) return prev;
        return [
          {
            id: data.patient.id,
            firstName: data.patient.firstName,
            lastNamePaternal: data.patient.lastNamePaternal,
            lastNameMaternal: data.patient.lastNameMaternal ?? null,
            phone: data.patient.phone,
          },
          ...prev,
        ];
      });
      toast.success("Paciente creado en el directorio y cita vinculada.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error inesperado";
      toast.error(message);
    } finally {
      setCreatingAndAssigningPatient(false);
    }
  };

  const handleSaveNote = async () => {
    setSavingNote(true);
    try {
      const res = await fetch(`/api/clinical/admin/appointments/${params.id}/note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(noteData)
      });
      if (!res.ok) throw new Error("Error guardando evolución clínica");
      noteDataOriginalRef.current = { ...noteData };
      toast.success("Evolución médica actualizada exitosamente.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error inesperado";
      toast.error(message);
    } finally {
      setSavingNote(false);
    }
  };

  const toggleAppointmentUploads = async (enabled: boolean) => {
    if (!appointmentId) return;
    const res = await fetch(`/api/clinical/admin/appointments/${appointmentId}/uploads`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uploadsEnabled: enabled, expiresInHours: uploadsExpiresInHours }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(data.error || "No se pudo actualizar permisos de carga");
    setUploadsEnabled(Boolean(data.appointment?.uploadsEnabled));
    toast.success(enabled ? "Carga habilitada para esta cita" : "Carga deshabilitada para esta cita");
  };

  const generateExternalLink = async () => {
    if (!appointmentId) return;
    const res = await fetch(`/api/clinical/admin/appointments/${appointmentId}/uploads`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(data.error || "No se pudo generar link");
    setExternalUploadLink(`${window.location.origin}${data.url}`);
    toast.success("Link generado");
  };

  const uploadAsDoctor = async () => {
    if (!appointmentId || !doctorUploadFile) return toast.error("Selecciona un archivo");
    const fd = new FormData();
    fd.append("file", doctorUploadFile);
    const res = await fetch(`/api/clinical/admin/appointments/${appointmentId}/documents`, { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(data.error || "No se pudo subir archivo");
    setDoctorUploadFile(null);
    setDoctorDocuments((prev) => [data.document, ...prev]);
    toast.success("Archivo subido correctamente");
  };

  const addMedication = () => {
    setNoteData((prev) => ({
      ...prev,
      prescriptions: [
        ...prev.prescriptions,
        { medication: "", dosage: "", frequency: "", duration: "", instructions: "" },
      ],
    }));
  };

  const updateMedication = (index: number, field: keyof PrescriptionForm, value: string) => {
    setNoteData((prev) => ({
      ...prev,
      prescriptions: prev.prescriptions.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      ),
    }));
  };

  const removeMedication = (index: number) => {
    setNoteData((prev) => ({
      ...prev,
      prescriptions: prev.prescriptions.filter((_, i) => i !== index),
    }));
  };

  const microphoneStatusMessage = {
    unknown: "El navegador decidirá el permiso al iniciar la grabación.",
    prompt: "El navegador solicitará autorización de micrófono al iniciar.",
    granted: "Micrófono autorizado para esta sesión.",
    denied: "Permiso denegado. Habilítalo en la configuración del navegador.",
    unsupported: "Este navegador no soporta grabación clínica con Web Audio API.",
  } satisfies Record<MicrophonePermissionState, string>;

  const subscribeToGenerationJob = (jobId: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const source = new EventSource(`/api/clinical/admin/appointments/${params.id}/note/generate/events?jobId=${jobId}`);
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
            subjective: soap.subjective && soap.subjective !== "No se menciona en la consulta" ? soap.subjective : prev.subjective,
            objective: soap.objective && soap.objective !== "No se menciona en la consulta" ? soap.objective : prev.objective,
            assessment: soap.assessment && soap.assessment !== "No se menciona en la consulta" ? soap.assessment : prev.assessment,
            plan: soap.plan && soap.plan !== "No se menciona en la consulta" ? soap.plan : prev.plan,
          }));
        }
        setIsGenerating(false);
        toast.success("Nota generada exitosamente con IA. Por favor, revísala.");
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
  };

  const ensureVerbalConsent = async () => {
    setIsConfirmingConsent(true);
    try {
      const res = await fetch(`/api/clinical/admin/appointments/${params.id}/consent`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "No fue posible registrar el consentimiento verbal.");
      }
      setLastVerbalConsentAt(data.consent?.createdAt || new Date().toISOString());
    } finally {
      setIsConfirmingConsent(false);
    }
  };

  // Recording Logic
  const startRecording = async () => {
    const localHostname = typeof window !== "undefined" ? window.location.hostname : "";
    const secureContext =
      typeof window !== "undefined" &&
      (window.isSecureContext || localHostname === "localhost" || localHostname === "127.0.0.1");

    if (!secureContext) {
      toast.error("La grabación clínica requiere HTTPS para proteger el acceso al micrófono.");
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Este navegador no soporta grabación clínica con Web Audio API.");
      return;
    }

    if (microphonePermission === "denied") {
      toast.error("El navegador tiene bloqueado el micrófono. Habilítalo y vuelve a intentar.");
      return;
    }

    try {
      await ensureVerbalConsent();

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMime =
        typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType: preferredMime });
      const chunks: Blob[] = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        void handleGenerateAI(blob);
        stream.getTracks().forEach((track) => track.stop());
      };

      setMediaRecorder(recorder);
      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      setGenerationStatus("");
      setGenerationProgress(0);
      timerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);

      toast.info("Consentimiento verbal registrado. Grabación iniciada.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo acceder al micrófono.");
      console.error(err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const handleGenerateAI = async (blob: Blob) => {
    setIsGenerating(true);
    setGenerationStatus("Subiendo audio cifrado al backend...");
    setGenerationProgress(10);
    const formData = new FormData();
    formData.append("audio", blob, `consulta-${params.id}.webm`);

    try {
      const res = await fetch(`/api/clinical/admin/appointments/${params.id}/note/generate`, {
        method: "POST",
        body: formData
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Error al generar nota con IA");

      if (data.jobId) {
        subscribeToGenerationJob(data.jobId);
      }
    } catch (err: unknown) {
      setIsGenerating(false);
      setGenerationStatus("");
      setGenerationProgress(0);
      toast.error(err instanceof Error ? err.message : "Error al procesar audio.");
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleGenerateInsights = async () => {
    setLoadingInsights(true);
    try {
      const res = await fetch(`/api/clinical/admin/appointments/${params.id}/ai-insights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ soap: noteData })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al generar sugerencias");
      setAiInsights(data as AIInsights);
      toast.success("Sugerencias generadas por la IA.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al generar sugerencias.");
    } finally {
      setLoadingInsights(false);
    }
  };

  const handleValidatePrescription = async () => {
    if (noteData.prescriptions.length === 0) {
      toast.info("No hay medicamentos para validar.");
      return;
    }
    setValidatingPrescription(true);
    try {
      const res = await fetch(`/api/clinical/admin/appointments/${params.id}/ai-validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prescriptions: noteData.prescriptions })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al validar");
      setPrescriptionAlerts(Array.isArray(data.alerts) ? (data.alerts as PrescriptionAlert[]) : []);
      if (data.alerts?.length === 0) {
        toast.success("No se detectaron riesgos en la receta.");
      } else {
        toast.warning(`Se detectaron ${data.alerts.length} posibles riesgos.`);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al validar.");
    } finally {
      setValidatingPrescription(false);
    }
  };

  const applyDiagnosisToSoap = (diag: string) => {
    setNoteData(prev => ({
      ...prev,
      assessment: prev.assessment ? `${prev.assessment}\n- ${diag}` : diag
    }));
    toast.info("Añadido a Evaluación");
  };

  const applyTreatmentToSoap = (treatment: string) => {
    setNoteData(prev => ({
      ...prev,
      plan: prev.plan ? `${prev.plan}\n- ${treatment}` : treatment
    }));
    toast.info("Añadido a Plan");
  };

  const applyMedicationToReceta = (med: AIInsightTreatment) => {
    setNoteData(prev => ({
      ...prev,
      prescriptions: [
        ...prev.prescriptions,
        {
          medication: med.treatment,
          instructions: med.instructions,
          dosage: "",
          frequency: "",
          duration: ""
        }
      ]
    }));
    toast.info("Agregado a la receta móvil");
  };

  if (loading) {
    return (
      <DoctorLayout>
        <div className="p-8 text-center text-muted-foreground">Cargando detalles de la cita...</div>
      </DoctorLayout>
    );
  }

  if (!appointment) {
    return (
      <DoctorLayout>
        <div className="p-8 text-center text-red-500">Cita no encontrada.</div>
      </DoctorLayout>
    );
  }

  const currentStatusOption =
    STATUS_OPTIONS.find(s => s.value === appointment.status) ||
    { value: "LEGACY", label: "Histórico", color: "bg-purple-500/15 text-purple-700 border-purple-500/30", icon: Clock };
  const q = appointment.questionnaire;
  const questionnaireTags = Array.from(
    new Set(
      [
        q?.primarySymptom?.trim() || "",
        ...(q?.responses?.additionalSymptomCategories || []).map((item) => item.trim()).filter(Boolean),
        ...(q?.responses?.conditions || []).map((item) => item.trim()).filter(Boolean),
      ]
        .map((item) => formatQuestionnaireTag(item))
        .filter(Boolean)
    )
  );
  const questionnaireEntries: Array<{ label: string; value: string }> = [];
  const questionnaireSymptoms: string[] = [];
  if (q?.responses?.dynamicAnswers) {
    Object.entries(q.responses.dynamicAnswers).forEach(([key, value]) => {
      if (typeof value === "boolean") {
        if (value) {
          questionnaireSymptoms.push(formatQuestionnaireLabel(key));
        }
        return;
      }

      questionnaireEntries.push({
        label: formatQuestionnaireLabel(key),
        value: formatQuestionnaireValue(value),
      });
    });
  }
  const uniqueQuestionnaireSymptoms = Array.from(new Set(questionnaireSymptoms.filter(Boolean)));
  if (q?.responses?.duration) {
    questionnaireEntries.push({ label: "Duración", value: formatQuestionnaireValue(q.responses.duration) });
  }
  if (q?.responses?.basic?.weight) {
    questionnaireEntries.push({ label: "Peso", value: `${q.responses.basic.weight} kg` });
  }
  if (q?.responses?.basic?.height) {
    questionnaireEntries.push({ label: "Estatura", value: `${q.responses.basic.height} cm` });
  }
  if (q?.responses?.allergies) {
    questionnaireEntries.push({ label: "Alergias", value: formatQuestionnaireValue(q.responses.allergies) });
  }
  if (q?.responses?.medications) {
    questionnaireEntries.push({ label: "Medicamentos actuales", value: formatQuestionnaireValue(q.responses.medications) });
  }

  return (
    <DoctorLayout>
      <div className="p-6 lg:p-8 max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-medium">Volver a la agenda</span>
          </button>

          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-3xl font-semibold text-foreground">Detalle de Cita</h1>
              <p className="text-muted-foreground mt-1">
                {format(new Date(appointment.startTime), "EEEE dd 'de' MMMM 'de' yyyy · HH:mm", { locale: es })}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {currentStatusOption && (
                <div className={`px-4 py-2 rounded-md border text-sm font-semibold ${currentStatusOption.color}`}>
                  {currentStatusOption.label}
                </div>
              )}
              {appointment.status !== "CANCELLED" && appointment.status !== "COMPLETED" && (
                <Button
                  size="sm"
                  onClick={() => router.push(`/medico/citas/${params.id}/consulta`)}
                >
                  <Stethoscope className="w-4 h-4 mr-2" />
                  Modo consulta
                </Button>
              )}
              <Button
                size="sm"
                variant="secondary"
                onClick={() => router.push(`/medico/citas/${params.id}/encuentro`)}
              >
                Encuentro clínico
              </Button>
            </div>
          </div>
        </motion.div>

        <div className="mb-4">
          <PatientClinicalAlerts patientId={appointment.patient.id} />
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Patient Info */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="w-5 h-5 text-primary" />
                  Datos del Paciente
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-secondary/30 rounded-md">
                  <User className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <div className="text-xs text-muted-foreground">Nombre</div>
                    <div className="font-semibold">{formatPatientName(appointment.patient)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 bg-secondary/30 rounded-md">
                  <Phone className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <div className="text-xs text-muted-foreground">Teléfono</div>
                    <div className="font-semibold">{appointment.patient.phone}</div>
                  </div>
                </div>
                {appointment.patient.email && (
                  <div className="flex items-center gap-3 p-3 bg-secondary/30 rounded-md">
                    <Mail className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <div className="text-xs text-muted-foreground">Email</div>
                      <div className="font-semibold">{appointment.patient.email}</div>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-secondary/30 rounded-md">
                    <div className="text-xs text-muted-foreground">Edad</div>
                    <div className="font-semibold">{new Date().getFullYear() - new Date(appointment.patient.dateOfBirth).getFullYear()} años</div>
                  </div>
                  <div className="p-3 bg-secondary/30 rounded-md">
                    <div className="text-xs text-muted-foreground">Tipo de consulta</div>
                    <div className="font-semibold capitalize">{appointment.appointmentType.toLowerCase()}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 bg-secondary/30 rounded-md">
                    <div className="text-xs text-muted-foreground">Duración</div>
                    <div className="font-semibold">{appointment.durationMin} minutos</div>
                  </div>
                  <div className="p-3 bg-secondary/30 rounded-md">
                    <div className="text-xs text-muted-foreground">Origen</div>
                    <div className="font-semibold capitalize">{appointment.source.toLowerCase()}</div>
                  </div>
                </div>
                <div className="p-3 bg-secondary/30 rounded-md">
                  <div className="text-xs text-muted-foreground">Expediente</div>
                  <div className="font-semibold">
                    {appointment.patient.ownerDoctorId ? "Vinculado al directorio" : "Cita de invitado (sin vincular)"}
                  </div>
                </div>
                <div className="p-3 bg-secondary/30 rounded-md space-y-2">
                  <div className="text-xs text-muted-foreground">Resumen previo (portal paciente)</div>
                  {precheckinSummary?.precheckin ? (
                    <div className="text-sm space-y-1">
                      <div>Asistencia: <strong>{precheckinSummary.precheckin.attendanceConfirmed ? "Confirmada" : "Sin confirmar"}</strong></div>
                      <div>Datos demográficos: <strong>{precheckinSummary.precheckin.demographicsConfirmed ? "Confirmados" : "Pendientes"}</strong></div>
                      <div>Pagos pendientes: <strong>{precheckinSummary.precheckin.pendingPaymentsAcknowledged ? "Reconocidos" : "Sin confirmar"}</strong></div>
                      {precheckinSummary.precheckin.notes ? (
                        <div className="text-muted-foreground">Notas: {precheckinSummary.precheckin.notes}</div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">El paciente aún no completa pre-check-in.</div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    Documentos recientes: <strong>{precheckinSummary?.documents?.length ?? 0}</strong>
                  </div>
                  <div className="mt-4 rounded-lg border border-border p-3 space-y-3">
                    <div className="font-semibold text-sm">Estudios clínicos (control por cita)</div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant={uploadsEnabled ? "secondary" : "primary"} onClick={() => toggleAppointmentUploads(!uploadsEnabled)}>
                        {uploadsEnabled ? "Deshabilitar carga paciente/external" : "Habilitar carga paciente/external"}
                      </Button>
                      <Input
                        type="number"
                        min={1}
                        max={168}
                        className="w-28"
                        value={uploadsExpiresInHours}
                        onChange={(e) => setUploadsExpiresInHours(Number(e.target.value))}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="secondary" onClick={generateExternalLink}>Generar link externo</Button>
                    </div>
                    {externalUploadLink ? (
                      <div className="text-xs break-all bg-secondary/20 rounded p-2 border border-border">{externalUploadLink}</div>
                    ) : null}
                    <div className="border-t border-border pt-3 space-y-2">
                      <div className="text-sm font-medium">Subir como médico</div>
                      <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => setDoctorUploadFile(e.target.files?.[0] ?? null)} className="block w-full text-sm" />
                      <Button size="sm" onClick={uploadAsDoctor}>Subir archivo</Button>
                    </div>
                    <div className="space-y-1">
                      {doctorDocuments.slice(0, 5).map((doc) => (
                        <a key={doc.id} href={doc.fileUrl} target="_blank" rel="noreferrer" className="block text-xs text-primary underline">
                          {doc.fileName} · {new Date(doc.uploadedAt).toLocaleString("es-MX")}
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Status Management */}
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-primary" />
                  Estado de la Cita
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-2">
                  {STATUS_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const isSelected = selectedStatus === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => {
                          if (opt.value === "CANCELLED" && selectedStatus !== "CANCELLED") {
                            setShowCancelConfirm(true);
                          } else {
                            setSelectedStatus(opt.value);
                          }
                        }}
                        className={`flex items-center gap-3 p-3 rounded-md border-2 transition-all text-left ${
                          isSelected
                            ? `${opt.color} border-current shadow-sm`
                            : "border-border hover:border-muted-foreground/30 bg-secondary/20"
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                        <span className="font-medium">{opt.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="pt-2">
                  <div className="rounded-md border border-border bg-secondary/20 p-3 space-y-3">
                    <div className="text-sm font-medium">Asignar cita a paciente del directorio</div>
                    {!appointment.patient.ownerDoctorId && (
                      <Button
                        fullWidth
                        onClick={handleCreateAndAssignPatient}
                        disabled={creatingAndAssigningPatient}
                      >
                        {creatingAndAssigningPatient
                          ? "Creando y vinculando..."
                          : "Crear paciente en directorio y vincular"}
                      </Button>
                    )}
                    {loadingDirectoryPatients ? (
                      <div className="text-sm text-muted-foreground">Cargando pacientes...</div>
                    ) : directoryPatients.length === 0 ? (
                      <div className="text-sm text-muted-foreground">
                        No tienes pacientes en tu directorio. Crea uno desde el módulo de pacientes.
                      </div>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <Input
                            label="Buscar paciente"
                            placeholder="Escribe nombre o teléfono..."
                            value={patientSearchTerm}
                            onFocus={() => setPatientSearchOpen(true)}
                            onBlur={() => {
                              setTimeout(() => setPatientSearchOpen(false), 120);
                            }}
                            onChange={(event) => {
                              setPatientSearchTerm(event.target.value);
                              setSelectedDirectoryPatientId("");
                              setPatientSearchOpen(true);
                            }}
                          />
                          {patientSearchOpen && (
                            <div className="max-h-52 overflow-auto rounded-md border border-border bg-background">
                              {filteredDirectoryPatients.length > 0 ? (
                                filteredDirectoryPatients.map((patient) => (
                                  <button
                                    key={patient.id}
                                    type="button"
                                    onMouseDown={() => {
                                      setSelectedDirectoryPatientId(patient.id);
                                      setPatientSearchTerm(formatDirectoryPatientLabel(patient));
                                      setPatientSearchOpen(false);
                                    }}
                                    className={`w-full px-3 py-2 text-left text-sm transition-colors ${
                                      selectedDirectoryPatientId === patient.id
                                        ? "bg-primary/15 text-foreground"
                                        : "hover:bg-secondary/40 text-muted-foreground"
                                    }`}
                                  >
                                    {formatDirectoryPatientLabel(patient)}
                                  </button>
                                ))
                              ) : (
                                <div className="px-3 py-2 text-sm text-muted-foreground">
                                  No encontramos pacientes con ese criterio.
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <Button
                          fullWidth
                          variant="secondary"
                          onClick={handleAssignPatient}
                          disabled={assigningPatient || !selectedDirectoryPatientId}
                        >
                          {assigningPatient ? "Asignando..." : "Vincular al expediente"}
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    fullWidth
                    variant="secondary"
                    onClick={() => setShowRescheduleMenu((prev) => !prev)}
                  >
                    <Calendar className="w-4 h-4 mr-2" />
                    {showRescheduleMenu ? "Cerrar menú de reagendado" : "Reagendar cita"}
                  </Button>
                </div>

                {showRescheduleMenu && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>
                    <div className="pt-4 space-y-4">
                      <Input
                        type="date"
                        label="Selecciona nueva fecha"
                        value={rescheduleDate}
                        onChange={(e) => setRescheduleDate(e.target.value)}
                      />

                      {loadingRescheduleSlots ? (
                        <div className="text-sm text-muted-foreground">Cargando módulos disponibles...</div>
                      ) : rescheduleDate && rescheduleSlots.length > 0 ? (
                        <div className="space-y-2">
                          <div className="text-sm font-medium text-muted-foreground">Opciones de horario por módulo</div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {rescheduleSlots.map((slot, index) => {
                              const selected = rescheduleSlot === slot.start;
                              const startLabel = format(new Date(slot.start), "HH:mm");
                              const endLabel = format(new Date(slot.end), "HH:mm");
                              return (
                                <button
                                  key={slot.start}
                                  type="button"
                                  onClick={() => setRescheduleSlot(slot.start)}
                                  className={`p-3 rounded-md border text-left transition-all ${
                                    selected
                                      ? "border-primary bg-primary/10 shadow-sm"
                                      : "border-border hover:border-primary/40 bg-secondary/20"
                                  }`}
                                >
                                  <div className="text-xs text-muted-foreground">Módulo {index + 1}</div>
                                  <div className="font-semibold">{startLabel} - {endLabel}</div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : rescheduleDate ? (
                        <div className="p-3 bg-warning/10 border border-warning/30 rounded-md text-sm">
                          No hay módulos disponibles para esa fecha.
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">Elige una fecha para ver módulos.</div>
                      )}

                      <Button
                        fullWidth
                        onClick={handleReschedule}
                        disabled={!rescheduleSlot || rescheduling}
                      >
                        {rescheduling ? "Reagendando..." : "Confirmar reagendado"}
                      </Button>
                    </div>
                  </motion.div>
                )}

                <div className="pt-2">
                  <TextArea
                    label="Notas del médico (opcional)"
                    placeholder="Añade observaciones sobre esta cita..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                  />
                </div>

                <Button
                  fullWidth
                  size="lg"
                  onClick={handleSave}
                  disabled={saving}
                >
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? "Guardando..." : "Guardar cambios"}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-6 space-y-4"
        >
          <div className="inline-flex items-center rounded-lg bg-secondary/40 p-1 border border-border">
            <button
              type="button"
              onClick={() => setClinicalTab("soap")}
              className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                clinicalTab === "soap"
                  ? "bg-card text-foreground border border-border shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Nota Clínica (SOAP)
            </button>
            <button
              type="button"
              onClick={() => {
                if (clinicalTab === "soap" && isDirtyNote && !window.confirm("Tienes cambios sin guardar en la nota clínica. ¿Deseas continuar sin guardar?")) return;
                setClinicalTab("questionnaire");
              }}
              className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                clinicalTab === "questionnaire"
                  ? "bg-card text-foreground border border-border shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Cuestionario del paciente
            </button>
            <button
              type="button"
              onClick={() => {
                if (clinicalTab === "soap" && isDirtyNote && !window.confirm("Tienes cambios sin guardar en la nota clínica. ¿Deseas continuar sin guardar?")) return;
                setClinicalTab("ai");
              }}
              className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                clinicalTab === "ai"
                  ? "bg-card text-foreground border border-border shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4" />
                Asistente IA
              </div>
            </button>
          </div>

          <Card className="p-0 overflow-hidden">
            <CardContent className="p-0">
              {clinicalTab === "soap" ? (
                <div className="p-5 sm:p-6 space-y-6">
                  {/* AI Scribe Toolbar */}
                  <div className="rounded-3xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex items-start gap-3">
                        <div className={`p-3 rounded-lg ${isRecording ? 'bg-destructive animate-pulse' : 'bg-primary/10'}`}>
                          <Mic className={`w-6 h-6 ${isRecording ? 'text-white' : 'text-primary'}`} />
                        </div>
                        <div className="space-y-1">
                          <h3 className="text-base font-semibold text-foreground">Escucha Inteligente (IA)</h3>
                          <p className="text-sm text-muted-foreground">
                            {isRecording
                              ? `Grabando consulta... ${formatTime(recordingSeconds)}`
                              : "Confirma el consentimiento verbal y después inicia la grabación clínica."}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 sm:flex-row">
                        {isRecording ? (
                          <Button variant="destructive" className="min-h-[56px]" onClick={stopRecording}>
                            <Square className="w-4 h-4 mr-2" />
                            Detener y Generar
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            className="min-h-[56px] px-6"
                            onClick={startRecording}
                            disabled={isGenerating || isConfirmingConsent}
                          >
                            {isGenerating || isConfirmingConsent ? (
                              <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                {isConfirmingConsent ? "Registrando consentimiento..." : "Procesando..."}
                              </>
                            ) : (
                              <>
                                <Mic className="w-4 h-4 mr-2" />
                                Confirmar Consentimiento e Iniciar Grabación
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="rounded-lg border border-border/70 bg-background/70 p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Micrófono</div>
                        <div className="mt-1 text-sm font-medium text-foreground">{microphonePermission}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{microphoneStatusMessage[microphonePermission]}</div>
                      </div>
                      <div className="rounded-lg border border-border/70 bg-background/70 p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Consentimiento verbal</div>
                        <div className="mt-1 text-sm font-medium text-foreground">
                          {lastVerbalConsentAt
                            ? `Registrado ${format(new Date(lastVerbalConsentAt), "dd/MM/yyyy HH:mm", { locale: es })}`
                            : "Pendiente de registrar"}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          El botón de inicio guarda evidencia del consentimiento en la base de datos.
                        </div>
                      </div>
                      <div className="rounded-lg border border-border/70 bg-background/70 p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Seguridad</div>
                        <div className="mt-1 text-sm font-medium text-foreground">HTTPS obligatorio o localhost</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          La captura de audio solo funciona en contexto seguro del navegador.
                        </div>
                      </div>
                    </div>
                  </div>

                  {isGenerating && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-lg border border-border bg-secondary/20 p-4"
                    >
                      <div className="flex items-center gap-3">
                        <Wand2 className="w-5 h-5 text-primary animate-pulse" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">
                            {generationStatus || "Analizando la conversación y estructurando los campos SOAP en español..."}
                          </p>
                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
                            <div
                              className="h-full rounded-full bg-primary transition-all"
                              style={{ width: `${Math.max(8, generationProgress)}%` }}
                            />
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">
                            La interfaz sigue disponible mientras OpenAI procesa el audio.
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                  <TextArea
                    label="Subjetivo (S)"
                    placeholder="Motivo de consulta, síntomas referidos, evolución temporal, antecedentes relevantes del episodio actual..."
                    value={noteData.subjective}
                    onChange={(e) => setNoteData({ ...noteData, subjective: e.target.value })}
                    rows={3}
                    className="bg-secondary/30 border-border/70 min-h-[88px]"
                  />
                  <TextArea
                    label="Objetivo (O)"
                    placeholder="Signos vitales (TA, FC, FR, T°, SpO2), exploración física por aparatos y sistemas, hallazgos relevantes..."
                    value={noteData.objective}
                    onChange={(e) => setNoteData({ ...noteData, objective: e.target.value })}
                    rows={3}
                    className="bg-secondary/30 border-border/70 min-h-[88px]"
                  />
                  <TextArea
                    label="Evaluación (A)"
                    placeholder="Diagnóstico principal (CIE-10), diagnósticos diferenciales, impresión clínica, correlación con hallazgos..."
                    value={noteData.assessment}
                    onChange={(e) => setNoteData({ ...noteData, assessment: e.target.value })}
                    rows={3}
                    className="bg-secondary/30 border-border/70 min-h-[88px]"
                  />
                  <TextArea
                    label="Plan (P)"
                    placeholder="Tratamiento indicado, medicamentos, dosis y duración, indicaciones al paciente, estudios solicitados, próxima revisión..."
                    value={noteData.plan}
                    onChange={(e) => setNoteData({ ...noteData, plan: e.target.value })}
                    rows={3}
                    className="bg-secondary/30 border-border/70 min-h-[88px]"
                  />
                  <TextArea
                    label="Notas privadas"
                    placeholder="Observaciones confidenciales no incluidas en el resumen clínico del paciente..."
                    value={noteData.privateNotes}
                    onChange={(e) => setNoteData({ ...noteData, privateNotes: e.target.value })}
                    rows={3}
                    className="bg-secondary/30 border-border/70 min-h-[88px]"
                  />

                  <div className="border-t border-border pt-5 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-semibold text-foreground">Medicamentos recetados</h3>
                      <div className="flex gap-2">
                        <Button 
                          variant="secondary" 
                          size="sm" 
                          onClick={handleValidatePrescription}
                          disabled={validatingPrescription || noteData.prescriptions.length === 0}
                        >
                          {validatingPrescription ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 mr-2" />
                          )}
                          Validar Receta con IA
                        </Button>
                        <Button variant="secondary" size="sm" onClick={addMedication}>
                          <Plus className="w-4 h-4 mr-2" />
                          Agregar
                        </Button>
                      </div>
                    </div>

                    <AnimatePresence>
                      {prescriptionAlerts.length > 0 && (
                        <motion.div 
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="space-y-2"
                        >
                          {prescriptionAlerts.map((alert, i) => (
                            <div 
                              key={i} 
                              className={`p-3 rounded-md border flex gap-3 ${
                                alert.severity === 'high' 
                                  ? 'bg-destructive/10 border-destructive/20 text-destructive' 
                                  : 'bg-warning/10 border-warning/20 text-warning-foreground'
                              }`}
                            >
                              <AlertCircle className="w-5 h-5 shrink-0" />
                              <div className="text-sm">
                                <p className="font-bold">Alerta de Seguridad IA: {alert.message}</p>
                                <p className="opacity-90">{alert.recommendation}</p>
                              </div>
                            </div>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {noteData.prescriptions.length > 0 ? (
                      <div className="space-y-3">
                        {noteData.prescriptions.map((p, i) => (
                          <div key={`${i}-${p.medication}`} className="rounded-lg border border-border bg-secondary/15 p-3 sm:p-4">
                            <div className="flex items-start gap-2">
                              <Input
                                placeholder="Medicamento"
                                value={p.medication ?? ""}
                                onChange={(e) => updateMedication(i, "medication", e.target.value)}
                                className="bg-secondary/30 border-border/70"
                              />
                              <button
                                type="button"
                                onClick={() => removeMedication(i)}
                                className="mt-2 text-destructive/80 hover:text-destructive transition-colors p-1"
                                aria-label="Eliminar medicamento"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                              <Input
                                placeholder="Dosis"
                                value={p.dosage ?? ""}
                                onChange={(e) => updateMedication(i, "dosage", e.target.value)}
                                className="bg-secondary/30 border-border/70"
                              />
                              <Input
                                placeholder="Frecuencia"
                                value={p.frequency ?? ""}
                                onChange={(e) => updateMedication(i, "frequency", e.target.value)}
                                className="bg-secondary/30 border-border/70"
                              />
                            </div>
                            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                              <Input
                                placeholder="Duración"
                                value={p.duration ?? ""}
                                onChange={(e) => updateMedication(i, "duration", e.target.value)}
                                className="bg-secondary/30 border-border/70"
                              />
                              <Input
                                placeholder="Indicaciones"
                                value={p.instructions ?? ""}
                                onChange={(e) => updateMedication(i, "instructions", e.target.value)}
                                className="bg-secondary/30 border-border/70"
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                        Aún no hay medicamentos recetados.
                      </div>
                    )}
                  </div>

                  <div className="border-t border-border pt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
                    {isDirtyNote && !savingNote && (
                      <p className="text-xs text-warning sm:order-last sm:ml-auto">Cambios sin guardar</p>
                    )}
                    <Button
                      size="sm"
                      onClick={handleSaveNote}
                      disabled={savingNote}
                      className="w-full sm:flex-1"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {savingNote ? "Guardando..." : "Guardar nota"}
                    </Button>
                    <Button
                      variant="secondary"
                          size="sm"
                          onClick={() => window.open(`/medico/citas/${params.id}/receta`, "_blank")}
                          className="w-full sm:w-auto"
                        >
                          <Printer className="w-4 h-4 mr-2" />
                          Imprimir Receta
                        </Button>
                      </div>
                    </div>
                  ) : clinicalTab === "questionnaire" ? (
                    <div className="p-5 sm:p-6 space-y-5">
                      {q && q.responses ? (
                        <>
                          <div>
                            <h3 className="text-2xl font-semibold text-foreground">Síntomas reportados</h3>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {questionnaireTags.length > 0 ? (
                                questionnaireTags.map((item) => (
                                  <span key={item} className="inline-flex px-3 py-1 rounded-full bg-secondary/60 text-sm text-foreground">
                                    {item}
                                  </span>
                                ))
                              ) : (
                                <span className="text-sm text-muted-foreground">Sin síntomas registrados.</span>
                              )}
                            </div>
                          </div>

                          <div className="border-t border-border pt-5">
                            <h3 className="text-2xl font-semibold text-foreground">Síntomas</h3>
                            <div className="mt-4 rounded-md bg-secondary/30 border border-border/70 p-4">
                              {uniqueQuestionnaireSymptoms.length > 0 ? (
                                <ul className="list-disc pl-5 space-y-1 text-foreground">
                                  {uniqueQuestionnaireSymptoms.map((symptom) => (
                                    <li key={symptom}>{symptom}</li>
                                  ))}
                                </ul>
                              ) : (
                                <div className="text-sm text-muted-foreground">
                                  El paciente no marcó síntomas específicos en esta sección.
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="border-t border-border pt-5">
                            <h3 className="text-3xl font-semibold text-foreground">Respuestas</h3>
                            <div className="mt-4 space-y-3">
                              {questionnaireEntries.length > 0 ? (
                                questionnaireEntries.map((entry, index) => (
                                  <div key={`${entry.label}-${index}`} className="rounded-md bg-secondary/30 border border-border/70 p-3">
                                    <div className="text-sm text-muted-foreground">{entry.label}</div>
                                    <div className="mt-1 text-lg font-medium text-foreground break-words">{entry.value}</div>
                                  </div>
                                ))
                              ) : (
                                <div className="rounded-md bg-secondary/30 border border-border/70 p-4 text-sm text-muted-foreground">
                                  No hay respuestas disponibles para esta cita.
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="text-xs text-muted-foreground text-right border-t border-border pt-3">
                            Respondido el {format(new Date(q.createdAt), "dd/MM/yyyy 'a las' HH:mm", { locale: es })}
                          </div>
                        </>
                      ) : (
                        <div className="rounded-md bg-secondary/30 border border-border/70 p-6 text-center text-muted-foreground">
                          El paciente no ha respondido el cuestionario.
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-5 sm:p-6 space-y-6">
                      {/* AI INSIGHTS TAB */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-primary/5 border border-primary/20 rounded-lg">
                        <div className="flex items-center gap-3">
                          <Brain className="w-6 h-6 text-primary" />
                          <div>
                            <h3 className="text-base font-bold text-foreground">Asistente Clínico IA</h3>
                            <p className="text-xs text-muted-foreground italic">
                              Analiza el historial maestro, cuestionario y nota actual para sugerir diagnósticos y planes.
                            </p>
                          </div>
                        </div>
                        <Button 
                          onClick={handleGenerateInsights} 
                          disabled={loadingInsights}
                          className="shrink-0"
                        >
                          {loadingInsights ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Wand2 className="w-4 h-4 mr-2" />
                          )}
                          Generar Sugerencias
                        </Button>
                      </div>

                      {aiInsights ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Diagnoses */}
                          <div className="space-y-4">
                            <div className="flex items-center gap-2 text-primary">
                              <Stethoscope className="w-5 h-5" />
                              <h4 className="font-bold">Diagnósticos Sugeridos</h4>
                            </div>
                            <div className="space-y-3">
                              {aiInsights.diagnoses?.map((d, i: number) => (
                                <div key={i} className="p-4 bg-secondary/20 border border-border rounded-md group relative">
                                  <p className="font-bold text-foreground pr-8">{d.diagnosis}</p>
                                  <p className="text-sm text-muted-foreground mt-1">{d.reasoning}</p>
                                  <button 
                                    onClick={() => applyDiagnosisToSoap(d.diagnosis)}
                                    className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-primary/10 rounded-lg text-primary"
                                    title="Añadir a Evaluación"
                                  >
                                    <Plus className="w-4 h-4" />
                                  </button>
                                </div>
                              ))}
                            </div>

                            <div className="flex items-center gap-2 text-primary pt-4">
                              <Pill className="w-5 h-5" />
                              <h4 className="font-bold">Tratamientos Sugeridos</h4>
                            </div>
                            <div className="space-y-3">
                              {aiInsights.treatments?.map((t, i: number) => (
                                <div key={i} className="p-4 bg-secondary/20 border border-border rounded-md group relative">
                                  <p className="font-bold text-foreground pr-8">{t.treatment}</p>
                                  <p className="text-sm text-muted-foreground mt-1">{t.instructions}</p>
                                  <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button 
                                      onClick={() => applyTreatmentToSoap(t.treatment)}
                                      className="p-1 hover:bg-primary/10 rounded-lg text-primary"
                                      title="Añadir a Plan"
                                    >
                                      <ChevronRight className="w-4 h-4" />
                                    </button>
                                    <button 
                                      onClick={() => applyMedicationToReceta(t)}
                                      className="p-1 hover:bg-primary/10 rounded-lg text-primary"
                                      title="Añadir a Receta"
                                    >
                                      <Plus className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Nutritional Plan */}
                          <div className="space-y-4">
                            <div className="flex items-center gap-2 text-success">
                              <Utensils className="w-5 h-5" />
                              <h4 className="font-bold">Plan Alimenticio (Permitidos/Prohibidos)</h4>
                            </div>
                            
                            <div className="grid grid-cols-1 gap-4">
                              <div className="p-4 bg-success/5 border border-success/20 rounded-md">
                                <p className="text-xs font-bold text-success uppercase mb-2">Permitidos / Recomendados</p>
                                <ul className="list-disc list-inside space-y-1">
                                  {aiInsights.allowedFoods?.map((f: string, i: number) => (
                                    <li key={i} className="text-sm text-foreground">{f}</li>
                                  ))}
                                </ul>
                              </div>

                              <div className="p-4 bg-destructive/5 border border-destructive/20 rounded-md">
                                <p className="text-xs font-bold text-destructive uppercase mb-2">Prohibidos / Evitar</p>
                                <ul className="list-disc list-inside space-y-1">
                                  {aiInsights.forbiddenFoods?.map((f: string, i: number) => (
                                    <li key={i} className="text-sm text-foreground">{f}</li>
                                  ))}
                                </ul>
                              </div>
                            </div>

                            <div className="p-4 bg-secondary/10 border border-border rounded-md">
                              <div className="flex items-center gap-2 mb-2">
                                <Info className="w-4 h-4 text-primary" />
                                <p className="text-xs font-bold text-foreground italic">Contexto detectado</p>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Este plan considera las alergias y padecimientos registrados en el expediente maestro del paciente.
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground text-center">
                          <Wand2 className="w-12 h-12 mb-4 opacity-20" />
                          <p className="max-w-xs">
                            Haz clic en el botón superior para generar sugerencias clínicas personalizadas para este paciente.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>

          <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Cancelar esta cita?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta acción marcará la cita como cancelada. El paciente no recibirá notificación automática desde aquí. Podrás revertirla cambiando el estado manualmente.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Mantener cita</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => setSelectedStatus("CANCELLED")}
                >
                  Confirmar cancelación
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DoctorLayout>
      );
    }
