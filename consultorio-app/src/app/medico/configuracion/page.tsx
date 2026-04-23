"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { Clock, LogOut, BellRing, RefreshCw, AlertTriangle, CheckCircle2, AlertCircle } from "lucide-react";
import { DoctorLayout } from "@/components/DoctorLayout";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import { toast } from "sonner";
import { useSearchParams, useRouter } from "next/navigation";
import { formatPatientName } from "@/lib/patientName";

type Tab = "perfil" | "parametros" | "disponibilidad" | "whatsapp" | "equipo";

type AvailabilityBlock = {
  dateLocal: string;
  startTime: string;
  endTime: string;
};

type WeeklyScheduleDay = {
  dayOfWeek: number;
  name: string;
  active: boolean;
  start: string;
  end: string;
  hasBreak: boolean;
  breakStart: string;
  breakEnd: string;
};

type WhatsAppHistoryItem = {
  id: string;
  phone: string;
  direction: "INBOUND" | "OUTBOUND";
  intent: string | null;
  action: string | null;
  message: string;
  createdAt: string;
  patient: {
    id: string;
    firstName?: string | null;
    lastNamePaternal?: string | null;
    lastNameMaternal?: string | null;
  } | null;
  appointment: { id: string; startTime: string; status: string } | null;
};

type Secretary = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  createdAt: string;
};

type SetupChecklistItem = {
  id: string;
  label: string;
  hint: string;
  done: boolean;
  actionHref: string;
  actionLabel: string;
};

type SetupChecklist = {
  completed: number;
  total: number;
  progressPct: number;
  items: SetupChecklistItem[];
};

type WhatsAppTemplateType = "booking" | "questionnaire" | "reminder_pending" | "reminder_confirmed";

const WHATSAPP_TEMPLATE_OPTIONS: Array<{ value: WhatsAppTemplateType; label: string }> = [
  { value: "booking", label: "Alta de cita" },
  { value: "questionnaire", label: "Invitación a cuestionario" },
  { value: "reminder_pending", label: "Recordatorio (pendiente)" },
  { value: "reminder_confirmed", label: "Recordatorio (confirmada)" },
];

const WEEK_DAYS: Array<{ dayOfWeek: number; name: string }> = [
  { dayOfWeek: 1, name: "Lunes" },
  { dayOfWeek: 2, name: "Martes" },
  { dayOfWeek: 3, name: "Miércoles" },
  { dayOfWeek: 4, name: "Jueves" },
  { dayOfWeek: 5, name: "Viernes" },
  { dayOfWeek: 6, name: "Sábado" },
  { dayOfWeek: 0, name: "Domingo" },
];

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Error inesperado";
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function toDateOnlyString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toMinutes(hhmm: string): number {
  const [hour, minute] = hhmm.split(":").map(Number);
  return hour * 60 + minute;
}

function dayOfWeekFromDateKey(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00`).getDay();
}

function createDefaultWeeklySchedule(): WeeklyScheduleDay[] {
  return WEEK_DAYS.map((day) => ({
    dayOfWeek: day.dayOfWeek,
    name: day.name,
    active: day.dayOfWeek >= 1 && day.dayOfWeek <= 5,
    start: "09:00",
    end: "17:00",
    hasBreak: true,
    breakStart: "14:00",
    breakEnd: "15:00",
  }));
}

function deriveWeeklyScheduleFromBlocks(blocks: AvailabilityBlock[]): WeeklyScheduleDay[] {
  const defaults = createDefaultWeeklySchedule();
  const grouped = new Map<number, Array<{ start: string; end: string }>>();

  for (const block of blocks) {
    const dayOfWeek = dayOfWeekFromDateKey(block.dateLocal);
    const start = formatTime(block.startTime);
    const end = formatTime(block.endTime);
    const existing = grouped.get(dayOfWeek) ?? [];
    existing.push({ start, end });
    grouped.set(dayOfWeek, existing);
  }

  return defaults.map((day) => {
    const dayBlocks = (grouped.get(day.dayOfWeek) ?? []).sort(
      (a, b) => toMinutes(a.start) - toMinutes(b.start)
    );
    if (dayBlocks.length === 0) {
      return { ...day, active: false };
    }

    const first = dayBlocks[0];
    const last = dayBlocks[dayBlocks.length - 1];
    const withBreak = dayBlocks.length > 1;
    let breakStart = day.breakStart;
    let breakEnd = day.breakEnd;

    if (withBreak) {
      const foundGap = dayBlocks.find((block, index) => {
        if (index === dayBlocks.length - 1) return false;
        const next = dayBlocks[index + 1];
        return toMinutes(block.end) < toMinutes(next.start);
      });

      if (foundGap) {
        const gapIndex = dayBlocks.indexOf(foundGap);
        breakStart = dayBlocks[gapIndex].end;
        breakEnd = dayBlocks[gapIndex + 1].start;
      } else {
        breakStart = dayBlocks[0].end;
        breakEnd = dayBlocks[1].start;
      }
    }

    return {
      ...day,
      active: true,
      start: first.start,
      end: last.end,
      hasBreak: withBreak,
      breakStart,
      breakEnd,
    };
  });
}

// Toggle switch component
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${checked ? "bg-primary" : "bg-muted"
        }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? "translate-x-6" : "translate-x-1"
          }`}
      />
    </button>
  );
}

function NotificationStatusPanel() {
  const [status, setStatus] = useState<{
    summary: { total: number; pending: number; sent: number; failed: number };
    failedRecent: { id: string; appointmentId: string; type: string; patientName: string; appointmentStartTime: string; reason: string | null }[];
    retryStats: { retriesCreated: number };
    pendingOldestAt: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [retryingAll, setRetryingAll] = useState(false);
  const [retryingOne, setRetryingOne] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch("/api/admin/notifications/status?windowDays=7&failedLimit=5")
      .then(r => r.ok ? r.json() : null)
      .then(data => setStatus(data?.summary ? data : null))
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let active = true;
    const initialLoad = async () => {
      try {
        const response = await fetch("/api/admin/notifications/status?windowDays=7&failedLimit=5");
        const data = response.ok ? await response.json() : null;
        if (!active) return;
        setStatus(data?.summary ? data : null);
      } catch {
        if (!active) return;
        setStatus(null);
      } finally {
        if (active) setLoading(false);
      }
    };

    void initialLoad();
    const pollId = window.setInterval(() => {
      if (!active) return;
      fetch("/api/admin/notifications/status?windowDays=7&failedLimit=5")
        .then(r => r.ok ? r.json() : null)
        .then((data) => {
          if (!active) return;
          setStatus(data?.summary ? data : null);
        })
        .catch(() => undefined);
    }, 30_000);

    return () => {
      active = false;
      window.clearInterval(pollId);
    };
  }, []);

  const process = async () => {
    setProcessing(true);
    await fetch("/api/admin/notifications/process?retryFailed=true", { method: "POST" })
      .then((res) => {
        if (!res.ok) throw new Error("No se pudo procesar la cola");
        toast.success("Cola procesada.");
      })
      .catch(() => toast.error("No se pudo procesar la cola."));
    load();
    setProcessing(false);
  };

  const retryAllFailed = async () => {
    setRetryingAll(true);
    try {
      const response = await fetch("/api/admin/notifications/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "No se pudieron reintentar notificaciones.");
      }
      toast.success("Notificaciones fallidas reintentadas.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      toast.error(message);
    } finally {
      setRetryingAll(false);
      load();
    }
  };

  const retryOneFailed = async (notificationId: string) => {
    setRetryingOne(notificationId);
    try {
      const response = await fetch("/api/admin/notifications/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "No se pudo reintentar la notificación.");
      }
      if (data.single?.created === false) {
        const reasonMap: Record<string, string> = {
          NOT_FOUND: "La notificación ya no está disponible.",
          ALREADY_PENDING: "Ya existe un reintento pendiente para este mensaje.",
          MAX_ATTEMPTS_REACHED: "Se alcanzó el máximo de intentos para este mensaje.",
        };
        toast.error(reasonMap[data.single?.reason] || "No se pudo reintentar esta notificación.");
      } else {
        toast.success("Reintento en cola.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      toast.error(message);
    } finally {
      setRetryingOne(null);
      load();
    }
  };

  return (
    <div className="border-t border-border pt-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BellRing className="w-4 h-4 text-primary" />
          <p className="text-sm font-medium text-foreground">Estado de notificaciones</p>
        </div>
        <button
          onClick={process}
          disabled={processing || retryingAll}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-medium text-foreground hover:bg-secondary transition-colors disabled:opacity-60"
        >
          <RefreshCw className={`w-3 h-3 ${processing ? "animate-spin" : ""}`} />
          {processing ? "Procesando..." : "Procesar cola"}
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground animate-pulse">Cargando estado...</p>
      ) : !status ? (
        <p className="text-xs text-muted-foreground">No se pudo cargar el estado de notificaciones.</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: "Pendientes", value: status.summary.pending },
              { label: "Enviadas", value: status.summary.sent },
              { label: "Fallidas", value: status.summary.failed },
              { label: "Reintentos", value: status.retryStats.retriesCreated },
            ].map(item => (
              <div key={item.label} className="p-3 bg-secondary/30 rounded-xl border border-border">
                <p className="text-xs text-muted-foreground">{item.label}</p>
                <p className="text-lg font-semibold text-foreground">{item.value}</p>
              </div>
            ))}
          </div>

          {status.pendingOldestAt && (
            <p className="text-xs text-muted-foreground">
              Pendiente más antiguo: {new Date(status.pendingOldestAt).toLocaleString("es-MX")}
            </p>
          )}

          {status.failedRecent.length > 0 && (
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-warning" />
                  <p className="text-xs font-medium text-foreground">Fallos recientes</p>
                </div>
                <button
                  onClick={retryAllFailed}
                  disabled={retryingAll || processing}
                  className="px-2.5 py-1 text-[11px] border border-border rounded-md hover:bg-secondary transition-colors disabled:opacity-60"
                >
                  {retryingAll ? "Reintentando..." : "Reintentar fallidas"}
                </button>
              </div>
              <div className="space-y-2">
                {status.failedRecent.map(f => (
                  <div key={f.id} className="p-2.5 bg-secondary/20 rounded-lg border border-border text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-foreground">{f.patientName}</p>
                        <p className="text-muted-foreground mt-0.5">{f.reason || "Sin detalle"}</p>
                      </div>
                      <button
                        onClick={() => void retryOneFailed(f.id)}
                        disabled={retryingOne === f.id || retryingAll || processing}
                        className="px-2 py-1 text-[11px] border border-border rounded-md hover:bg-secondary transition-colors disabled:opacity-60"
                      >
                        {retryingOne === f.id ? "..." : "Reintentar"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SecretaryManager() {
  const [secretaries, setSecretaries] = useState<Secretary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSecretary, setNewSecretary] = useState({ name: "", email: "", password: "" });

  const loadSecretaries = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/medico/secretaries");
      const data = await res.json();
      if (res.ok) setSecretaries(data);
    } catch (error) {
      console.error(error);
      toast.error("No se pudieron cargar las secretarias");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSecretaries();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await fetch("/api/medico/secretaries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSecretary),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al crear");
      toast.success("Secretaria creada correctamente");
      setShowCreateModal(false);
      setNewSecretary({ name: "", email: "", password: "" });
      void loadSecretaries();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar esta cuenta?")) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/medico/secretaries/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("No se pudo eliminar");
      toast.success("Cuenta eliminada");
      void loadSecretaries();
    } catch (error) {
      toast.error(getErrorMessage(error));
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Equipo de Trabajo</h2>
        <Button onClick={() => setShowCreateModal(true)} size="sm">
          Alta de Secretaria/o
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground animate-pulse">Cargando equipo...</p>
      ) : secretaries.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-border rounded-2xl">
          <p className="text-sm text-muted-foreground">No tienes personal registrado todavía.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {secretaries.map((s) => (
            <div key={s.id} className="p-4 bg-secondary/20 rounded-xl border border-border flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">{s.name}</p>
                <p className="text-xs text-muted-foreground">{s.email}</p>
              </div>
              <button
                onClick={() => void handleDelete(s.id)}
                disabled={deleting === s.id}
                className="text-xs text-destructive hover:underline font-medium disabled:opacity-50"
              >
                {deleting === s.id ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        title="Nueva Secretaria/o"
        description="Crea una cuenta para tu personal de apoyo. Tendrán acceso exclusivo a la agenda."
      >
        <form onSubmit={handleCreate} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Nombre completo</label>
            <input
              required
              className="w-full px-3 py-2 bg-input-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              value={newSecretary.name}
              onChange={(e) => setNewSecretary({ ...newSecretary, name: e.target.value })}
              placeholder="Ej. Juan Pérez"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Correo electrónico</label>
            <input
              required
              type="email"
              className="w-full px-3 py-2 bg-input-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              value={newSecretary.email}
              onChange={(e) => setNewSecretary({ ...newSecretary, email: e.target.value })}
              placeholder="ejemplo@correo.com"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Contraseña provisional</label>
            <input
              required
              type="password"
              minLength={6}
              className="w-full px-3 py-2 bg-input-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              value={newSecretary.password}
              onChange={(e) => setNewSecretary({ ...newSecretary, password: e.target.value })}
              placeholder="••••••••"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowCreateModal(false)} className="flex-1" type="button">
              Cancelar
            </Button>
            <Button loading={creating} className="flex-1" type="submit">
              Crear Cuenta
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function DoctorConfigurationContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("perfil");
  const [origin, setOrigin] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingParams, setSavingParams] = useState(false);
  const [savingWaRules, setSavingWaRules] = useState(false);
  const [profileMsg, setProfileMsg] = useState("");
  const [paramsMsg, setParamsMsg] = useState("");
  const [waRulesMsg, setWaRulesMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Profile
  const [profileData, setProfileData] = useState({
    name: "",
    specialty: "",
    bio: "",
    slug: "",
    profileImage: "",
    professionalLicense: "",
    clinicAddress: "",
    logoImage: "",
  });

  // Params
  const [formData, setFormData] = useState({
    baseDuration: 30 as number | string,
    priceNormal: 800 as number | string,
    priceExtended: 1200 as number | string,
    extendedEnabled: true,
    reminderLeadHours: "24,3,1",
    reminderWindowMinutes: 15 as number | string,
    whatsappAutoReplyEnabled: true,
    whatsappAutoConfirmEnabled: true,
    whatsappAutoCancelEnabled: true,
    whatsappBookingMessageTemplate: "",
    whatsappQuestionnaireTemplate: "",
    whatsappReminderPendingTemplate: "",
    whatsappReminderConfirmedTemplate: "",
  });

  // Availability
  const [weeklySchedule, setWeeklySchedule] = useState<WeeklyScheduleDay[]>(createDefaultWeeklySchedule);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleMsg, setScheduleMsg] = useState("");

  // WhatsApp
  const [waConnected, setWaConnected] = useState(false);
  const [waStatus, setWaStatus] = useState("disconnected");
  const [waQr, setWaQr] = useState<string | null>(null);
  const [waDoctorId, setWaDoctorId] = useState("");
  const [waError, setWaError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [disconnectConfirmOpen, setDisconnectConfirmOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [waLastCheckedAt, setWaLastCheckedAt] = useState<string | null>(null);
  const [waHistory, setWaHistory] = useState<WhatsAppHistoryItem[]>([]);
  const [waHistoryLoading, setWaHistoryLoading] = useState(false);
  const [waPreviewType, setWaPreviewType] = useState<WhatsAppTemplateType>("booking");
  const [waPreviewText, setWaPreviewText] = useState("");
  const [waPreviewSource, setWaPreviewSource] = useState<string>("");
  const [waPreviewLoading, setWaPreviewLoading] = useState(false);
  const [waPreviewMsg, setWaPreviewMsg] = useState("");
  const [waTestPhone, setWaTestPhone] = useState("");
  const [waSendingTest, setWaSendingTest] = useState(false);
  const [waTestMsg, setWaTestMsg] = useState("");
  const [setupChecklist, setSetupChecklist] = useState<SetupChecklist | null>(null);

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (!tabParam) return;
    if (tabParam === "perfil" || tabParam === "parametros" || tabParam === "disponibilidad" || tabParam === "whatsapp") {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  useEffect(() => {
    setOrigin(window.location.origin);

    fetch("/api/admin/profile")
      .then(r => r.json())
      .then(data => {
        if (data && !data.error) {
          setProfileData({
            name: data.name || "",
            specialty: data.specialty || "",
            bio: data.bio || "",
            slug: data.slug || "",
            profileImage: data.profileImage || "",
            professionalLicense: data.professionalLicense || "",
            clinicAddress: data.clinicAddress || "",
            logoImage: data.logoImage || "",
          });
          if (data.id) setWaDoctorId(data.id);
        }
      }).catch(console.error);

    fetch("/api/admin/config")
      .then(r => r.json())
      .then(data => {
        if (data?.doctorId) setWaDoctorId(data.doctorId);
        if (data?.whatsappConnected !== undefined) {
          setWaConnected(!!data.whatsappConnected);
        }
        setFormData((prev) => ({
          baseDuration: Number(data?.consultationDurationMin) || prev.baseDuration,
          priceNormal: Number(data?.normalConsultationPrice) || prev.priceNormal,
          priceExtended: Number(data?.extendedConsultationPrice) || prev.priceExtended,
          extendedEnabled:
            data?.extendedConsultationEnabled !== undefined
              ? !!data.extendedConsultationEnabled
              : prev.extendedEnabled,
          reminderLeadHours:
            typeof data?.reminderLeadHours === "string" && data.reminderLeadHours.trim()
              ? data.reminderLeadHours
              : prev.reminderLeadHours,
          reminderWindowMinutes:
            typeof data?.reminderWindowMinutes === "number" && data.reminderWindowMinutes > 0
              ? data.reminderWindowMinutes
              : prev.reminderWindowMinutes,
          whatsappAutoReplyEnabled:
            data?.whatsappAutoReplyEnabled !== undefined
              ? !!data.whatsappAutoReplyEnabled
              : prev.whatsappAutoReplyEnabled,
          whatsappAutoConfirmEnabled:
            data?.whatsappAutoConfirmEnabled !== undefined
              ? !!data.whatsappAutoConfirmEnabled
              : prev.whatsappAutoConfirmEnabled,
          whatsappAutoCancelEnabled:
            data?.whatsappAutoCancelEnabled !== undefined
              ? !!data.whatsappAutoCancelEnabled
              : prev.whatsappAutoCancelEnabled,
          whatsappBookingMessageTemplate:
            typeof data?.whatsappBookingMessageTemplate === "string"
              ? data.whatsappBookingMessageTemplate
              : prev.whatsappBookingMessageTemplate,
          whatsappQuestionnaireTemplate:
            typeof data?.whatsappQuestionnaireTemplate === "string"
              ? data.whatsappQuestionnaireTemplate
              : prev.whatsappQuestionnaireTemplate,
          whatsappReminderPendingTemplate:
            typeof data?.whatsappReminderPendingTemplate === "string"
              ? data.whatsappReminderPendingTemplate
              : prev.whatsappReminderPendingTemplate,
          whatsappReminderConfirmedTemplate:
            typeof data?.whatsappReminderConfirmedTemplate === "string"
              ? data.whatsappReminderConfirmedTemplate
              : prev.whatsappReminderConfirmedTemplate,
        }));
      }).catch(console.error);

    fetch("/api/agenda/admin/dashboard/summary", { cache: "no-store" })
      .then(r => r.json())
      .then(data => {
        if (data?.setupChecklist) {
          setSetupChecklist(data.setupChecklist);
        }
      }).catch(console.error);
  }, []);

  // Load weekly template based on upcoming blocks when tab is active
  useEffect(() => {
    if (activeTab !== "disponibilidad") return;
    setLoadingSchedule(true);
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 14);

    fetch(`/api/agenda/admin/availability?active=true&isPublic=true&from=${toDateOnlyString(from)}&to=${toDateOnlyString(to)}`)
      .then(r => r.json())
      .then((data) => {
        if (Array.isArray(data.blocks)) {
          setWeeklySchedule(deriveWeeklyScheduleFromBlocks(data.blocks));
        } else {
          setWeeklySchedule(createDefaultWeeklySchedule());
        }
      })
      .catch(console.error)
      .finally(() => setLoadingSchedule(false));
  }, [activeTab]);

  // WhatsApp polling
  useEffect(() => {
    let interval: NodeJS.Timeout;
    const shouldPoll = waDoctorId && !waConnected && (waStatus === "disconnected" || waStatus === "qr_ready" || waStatus === "initializing");
    if (shouldPoll) {
      const pollQrStatus = async () => {
        try {
          const res = await fetch(`/api/admin/whatsapp/qr/${waDoctorId}`);
          if (!res.ok) {
            throw new Error("El motor de WhatsApp respondió con error.");
          }
          const data = await res.json();
          setWaStatus(data.status || "disconnected");
          if (data.qrBase64) setWaQr(data.qrBase64);
          setWaLastCheckedAt(new Date().toISOString());
          setWaError("");

          if (data.status === "connected") {
            setWaConnected(true);
            setWaQr(null);
            await fetch("/api/admin/config", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...formData, whatsappConnected: true })
            });
          }
        } catch (err) {
          setWaError("No se pudo obtener el QR. Verifica que el servicio WhatsApp esté activo.");
          console.error("Error WA QR polling:", err);
        }
      };

      void pollQrStatus();
      interval = setInterval(() => {
        void pollQrStatus();
      }, 4000);
    }
    return () => clearInterval(interval);
  }, [waDoctorId, waConnected, waStatus, formData]);

  const uploadImageToCloudinary = async (file: File): Promise<string> => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("upload_preset", process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET || "");
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: "POST",
      body: fd,
    });
    const data = await res.json();
    if (!data.secure_url) {
      throw new Error("No fue posible obtener la URL de la imagen.");
    }
    return data.secure_url;
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setProfileMsg("");
    try {
      const res = await fetch("/api/admin/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileData)
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setProfileMsg("Perfil guardado correctamente.");
    } catch (err) {
      setProfileMsg("Error: " + getErrorMessage(err));
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveParams = async () => {
    setSavingParams(true);
    setParamsMsg("");
    try {
      const res = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          baseDuration: Number(formData.baseDuration) || 30,
          priceNormal: Number(formData.priceNormal) || 0,
          priceExtended: Number(formData.priceExtended) || 0,
          reminderWindowMinutes: Number(formData.reminderWindowMinutes) || 15
        })
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setParamsMsg("Parámetros guardados correctamente.");
    } catch (err) {
      setParamsMsg("Error: " + getErrorMessage(err));
    } finally {
      setSavingParams(false);
    }
  };

  const handleWeeklyScheduleChange = (
    dayOfWeek: number,
    patch: Partial<WeeklyScheduleDay>
  ) => {
    setWeeklySchedule((prev) =>
      prev.map((day) => (day.dayOfWeek === dayOfWeek ? { ...day, ...patch } : day))
    );
  };

  const handleSaveSchedule = async () => {
    setSavingSchedule(true);
    setScheduleMsg("");
    try {
      const payload = {
        schedule: weeklySchedule.map((day) => ({
          dayOfWeek: day.dayOfWeek,
          active: day.active,
          start: day.start,
          end: day.end,
          hasBreak: day.hasBreak,
          breakStart: day.hasBreak ? day.breakStart : undefined,
          breakEnd: day.hasBreak ? day.breakEnd : undefined,
        })),
        horizonDays: 365,
      };

      const res = await fetch("/api/agenda/admin/schedule/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setScheduleMsg(
        `Horario semanal guardado. Bloques regenerados: ${data.generatedBlocks}. Días protegidos por citas: ${data.skippedDaysWithAppointments}.`
      );
    } catch (err) {
      setScheduleMsg("Error: " + getErrorMessage(err));
    } finally {
      setSavingSchedule(false);
    }
  };

  const disconnectWhatsapp = async () => {
    if (!waDoctorId) return;
    setDisconnecting(true);
    try {
      await fetch(`/api/admin/whatsapp/logout/${waDoctorId}`, { method: "DELETE" });
      setWaConnected(false);
      setWaStatus("disconnected");
      setWaQr(null);
      await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, whatsappConnected: false })
      }).catch(console.error);
      toast.success("WhatsApp desvinculado correctamente.");
    } catch {
      toast.error("No se pudo desvincular WhatsApp.");
    } finally {
      setDisconnecting(false);
      setDisconnectConfirmOpen(false);
    }
  };

  const verifyConnection = async () => {
    if (!waDoctorId) {
      setWaError("No se encontró el identificador del doctor para generar el QR.");
      return;
    }
    setVerifying(true);
    try {
      const res = await fetch(`/api/admin/whatsapp/qr/${waDoctorId}`);
      if (!res.ok) throw new Error("El motor de WhatsApp no respondió correctamente.");
      const data = await res.json();
      setWaStatus(data.status);
      if (data.qrBase64) setWaQr(data.qrBase64);
      if (data.status === "connected") setWaConnected(true);
      setWaLastCheckedAt(new Date().toISOString());
      setWaError("");
    } catch (err) {
      setWaError("No se pudo conectar con el servicio de WhatsApp. Asegúrate de que esté iniciado.");
      console.error("Error WA verify:", err);
    }
    setVerifying(false);
  };

  const loadWhatsAppHistory = async () => {
    setWaHistoryLoading(true);
    try {
      const res = await fetch("/api/admin/whatsapp/history?limit=30");
      const data = await res.json();
      if (!res.ok || !Array.isArray(data?.history)) {
        throw new Error(data?.error || "No se pudo cargar historial");
      }
      setWaHistory(data.history);
    } catch (err) {
      console.error("Error cargando historial WhatsApp:", err);
      setWaHistory([]);
    } finally {
      setWaHistoryLoading(false);
    }
  };

  const getTemplateTextByType = (type: WhatsAppTemplateType) => {
    if (type === "booking") return formData.whatsappBookingMessageTemplate;
    if (type === "questionnaire") return formData.whatsappQuestionnaireTemplate;
    if (type === "reminder_pending") return formData.whatsappReminderPendingTemplate;
    return formData.whatsappReminderConfirmedTemplate;
  };

  const loadTemplatePreview = async (type: WhatsAppTemplateType = waPreviewType) => {
    setWaPreviewLoading(true);
    setWaPreviewMsg("");
    try {
      const res = await fetch("/api/admin/whatsapp/templates/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateType: type,
          template: getTemplateTextByType(type),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No se pudo generar la vista previa.");
      setWaPreviewText(data.preview || "");
      setWaPreviewSource(data.source || "");
    } catch (err) {
      setWaPreviewText("");
      setWaPreviewSource("");
      setWaPreviewMsg(`Error: ${getErrorMessage(err)}`);
    } finally {
      setWaPreviewLoading(false);
    }
  };

  const sendWhatsAppTest = async () => {
    setWaTestMsg("");
    const phone = waTestPhone.trim();
    if (!phone) {
      setWaTestMsg("Error: captura un teléfono para enviar la prueba.");
      return;
    }

    setWaSendingTest(true);
    try {
      const res = await fetch("/api/admin/whatsapp/templates/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          templateType: waPreviewType,
          template: getTemplateTextByType(waPreviewType),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No se pudo enviar el mensaje de prueba.");
      setWaTestMsg("Mensaje de prueba enviado correctamente.");
      setWaPreviewText(data.preview || waPreviewText);
      setWaPreviewSource(data.source || waPreviewSource);
    } catch (err) {
      setWaTestMsg(`Error: ${getErrorMessage(err)}`);
    } finally {
      setWaSendingTest(false);
    }
  };

  const saveWhatsappRules = async () => {
    setSavingWaRules(true);
    setWaRulesMsg("");
    try {
      const payload = {
        reminderLeadHours: formData.reminderLeadHours,
        reminderWindowMinutes: Number(formData.reminderWindowMinutes) || 15,
        whatsappAutoReplyEnabled: formData.whatsappAutoReplyEnabled,
        whatsappAutoConfirmEnabled: formData.whatsappAutoConfirmEnabled,
        whatsappAutoCancelEnabled: formData.whatsappAutoCancelEnabled,
        whatsappBookingMessageTemplate: formData.whatsappBookingMessageTemplate,
        whatsappQuestionnaireTemplate: formData.whatsappQuestionnaireTemplate,
        whatsappReminderPendingTemplate: formData.whatsappReminderPendingTemplate,
        whatsappReminderConfirmedTemplate: formData.whatsappReminderConfirmedTemplate,
      };
      const res = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "No se pudo guardar la configuración");
      setWaRulesMsg("Reglas de WhatsApp guardadas correctamente.");
    } catch (err) {
      setWaRulesMsg(`Error: ${getErrorMessage(err)}`);
    } finally {
      setSavingWaRules(false);
    }
  };

  useEffect(() => {
    if (activeTab !== "whatsapp") return;
    void loadWhatsAppHistory();
  }, [activeTab]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "perfil", label: "Perfil Público" },
    { id: "parametros", label: "Parámetros" },
    { id: "disponibilidad", label: "Disponibilidad" },
    { id: "whatsapp", label: "WhatsApp" },
    { id: "equipo", label: "Equipo" },
  ];

  return (
    <DoctorLayout>
      <div className="p-6 lg:p-8 w-full">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground">Configuración</h1>
          <p className="text-muted-foreground text-sm mt-1">Gestiona tu perfil y disponibilidad</p>
        </div>

        {setupChecklist && (
          <div className="bg-card border border-border rounded-2xl shadow-sm mb-6">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">Checklist de puesta en marcha</h2>
              <p className="text-xs text-muted-foreground mt-1">
                {setupChecklist.completed}/{setupChecklist.total} completados · {setupChecklist.progressPct}% listo
              </p>
            </div>
            <div className="p-6 space-y-3">
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${setupChecklist.progressPct}%` }}
                />
              </div>

              <div className="space-y-2">
                {setupChecklist.items.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-border bg-secondary/20 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground flex items-center gap-2">
                        {item.done ? (
                          <CheckCircle2 className="w-4 h-4 text-success" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-warning" />
                        )}
                        {item.label}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{item.hint}</p>
                    </div>
                    {!item.done && (
                      <button
                        onClick={() => router.push(item.actionHref)}
                        className="px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-secondary transition-colors"
                      >
                        {item.actionLabel}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Tab Bar */}
        <div className="flex gap-1 mb-6 flex-wrap">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab.id
                  ? "bg-secondary text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Card wrapper */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">

          {/* ═══════════════════════════════════════
              TAB: PERFIL PÚBLICO
          ═══════════════════════════════════════ */}
          {activeTab === "perfil" && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-foreground">Información Pública</h2>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-primary mb-1.5 block">Nombre completo</label>
                  <input
                    className="w-full px-3 py-2 bg-input-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    value={profileData.name}
                    onChange={e => setProfileData({ ...profileData, name: e.target.value })}
                    placeholder="Dra. María González"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-primary mb-1.5 block">Especialidad</label>
                  <input
                    className="w-full px-3 py-2 bg-input-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    value={profileData.specialty}
                    onChange={e => setProfileData({ ...profileData, specialty: e.target.value })}
                    placeholder="Medicina General"
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-primary mb-1.5 block">Cédula profesional</label>
                  <input
                    className="w-full px-3 py-2 bg-input-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    value={profileData.professionalLicense}
                    onChange={e => setProfileData({ ...profileData, professionalLicense: e.target.value })}
                    placeholder="12345678"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-primary mb-1.5 block">Dirección del consultorio</label>
                  <input
                    className="w-full px-3 py-2 bg-input-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    value={profileData.clinicAddress}
                    onChange={e => setProfileData({ ...profileData, clinicAddress: e.target.value })}
                    placeholder="Av. Principal 123, Col. Centro"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-primary mb-1.5 block">Biografía</label>
                <textarea
                  rows={3}
                  className="w-full px-3 py-2 bg-input-background border border-border rounded-lg text-sm text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                  value={profileData.bio}
                  onChange={e => setProfileData({ ...profileData, bio: e.target.value })}
                  placeholder="Breve descripción para tus pacientes..."
                />
              </div>

              <div>
                <label className="text-sm font-medium text-primary mb-1.5 block">URL personalizada</label>
                <div className="flex items-center bg-input-background border border-border rounded-lg overflow-hidden">
                  <span className="px-3 text-sm text-muted-foreground border-r border-border py-2 shrink-0">
                    {origin ? `${origin.replace(/^https?:\/\//, "")}/` : "midoc.com/"}
                  </span>
                  <input
                    className="flex-1 px-3 py-2 bg-transparent text-sm text-foreground focus:outline-none"
                    value={profileData.slug}
                    onChange={e => setProfileData({ ...profileData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
                    placeholder="dra-maria-gonzalez"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-primary mb-1.5 block">Foto de perfil</label>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUploadingImage(true);
                    try {
                      const imageUrl = await uploadImageToCloudinary(file);
                      setProfileData(prev => ({ ...prev, profileImage: imageUrl }));
                    } catch (err) {
                      toast.error(getErrorMessage(err));
                    } finally {
                      setUploadingImage(false);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }
                  }}
                />
                <div
                  className="flex items-center gap-3 px-3 py-2 bg-input-background border border-border rounded-lg cursor-pointer hover:bg-secondary/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <span className="text-sm font-medium text-foreground">Seleccionar archivo</span>
                  <span className="text-sm text-muted-foreground">{uploadingImage ? "Subiendo..." : profileData.profileImage ? "Imagen cargada" : "Sin archivos seleccionados"}</span>
                </div>
                {profileData.profileImage && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profileData.profileImage}
                    alt="Vista previa de foto de perfil"
                    className="mt-3 w-20 h-20 object-cover rounded-full border border-border"
                  />
                )}
              </div>

              <div>
                <label className="text-sm font-medium text-primary mb-1.5 block">Logo del consultorio</label>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  ref={logoInputRef}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUploadingLogo(true);
                    try {
                      const imageUrl = await uploadImageToCloudinary(file);
                      setProfileData(prev => ({ ...prev, logoImage: imageUrl }));
                    } catch (err) {
                      toast.error(getErrorMessage(err));
                    } finally {
                      setUploadingLogo(false);
                      if (logoInputRef.current) logoInputRef.current.value = "";
                    }
                  }}
                />
                <div
                  className="flex items-center gap-3 px-3 py-2 bg-input-background border border-border rounded-lg cursor-pointer hover:bg-secondary/50 transition-colors"
                  onClick={() => logoInputRef.current?.click()}
                >
                  <span className="text-sm font-medium text-foreground">Seleccionar logo</span>
                  <span className="text-sm text-muted-foreground">{uploadingLogo ? "Subiendo..." : profileData.logoImage ? "Logo cargado" : "Sin archivos seleccionados"}</span>
                </div>
                {profileData.logoImage && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profileData.logoImage}
                    alt="Vista previa de logo"
                    className="mt-3 w-28 h-20 object-contain rounded-lg border border-border bg-white"
                  />
                )}
              </div>

              {profileMsg && (
                <p className={`text-sm ${profileMsg.startsWith("Error") ? "text-destructive" : "text-success"}`}>{profileMsg}</p>
              )}

              <Button onClick={handleSaveProfile} disabled={savingProfile} className="w-full h-11">
                {savingProfile ? "Guardando..." : "Guardar perfil"}
              </Button>
            </div>
          )}

          {/* ═══════════════════════════════════════
              TAB: PARÁMETROS
          ═══════════════════════════════════════ */}
          {activeTab === "parametros" && (
            <div className="space-y-8">
              <h2 className="text-lg font-semibold text-foreground">Parámetros del Consultorio</h2>

              {/* Consulta Normal */}
              <div className="space-y-3">
                <h3 className="font-medium text-foreground">Consulta Normal</h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-primary mb-1.5 block">Duración (minutos)</label>
                    <input
                      type="text" inputMode="numeric"
                      className="w-full px-3 py-2 bg-input-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                      value={formData.baseDuration}
                      onChange={e => setFormData({ ...formData, baseDuration: e.target.value.replace(/^0+(?=\d)/, "") })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-primary mb-1.5 block">Precio</label>
                    <input
                      type="text" inputMode="numeric"
                      className="w-full px-3 py-2 bg-input-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                      value={formData.priceNormal}
                      onChange={e => setFormData({ ...formData, priceNormal: e.target.value.replace(/^0+(?=\d)/, "") })}
                    />
                  </div>
                </div>
              </div>

              {/* Consulta Extendida */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-foreground">Consulta Extendida / Integral</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Habilitada</span>
                    <Toggle checked={formData.extendedEnabled} onChange={v => setFormData({ ...formData, extendedEnabled: v })} />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-primary mb-1.5 block">Duración (minutos)</label>
                    <input
                      type="text" inputMode="numeric"
                      disabled={!formData.extendedEnabled}
                      className="w-full px-3 py-2 bg-input-background border border-border rounded-lg text-sm text-foreground focus:outline-none disabled:opacity-50"
                      value={formData.baseDuration === '' ? '' : Number(formData.baseDuration) * 2}
                      readOnly
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-primary mb-1.5 block">Precio</label>
                    <input
                      type="text" inputMode="numeric"
                      disabled={!formData.extendedEnabled}
                      className="w-full px-3 py-2 bg-input-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
                      value={formData.priceExtended}
                      onChange={e => setFormData({ ...formData, priceExtended: e.target.value.replace(/^0+(?=\d)/, "") })}
                    />
                  </div>
                </div>
              </div>

              {paramsMsg && (
                <p className={`text-sm ${paramsMsg.startsWith("Error") ? "text-destructive" : "text-success"}`}>{paramsMsg}</p>
              )}

              <Button onClick={handleSaveParams} disabled={savingParams} className="w-full h-11">
                {savingParams ? "Guardando..." : "Guardar parámetros"}
              </Button>
            </div>
          )}

          {/* ═══════════════════════════════════════
              TAB: DISPONIBILIDAD
          ═══════════════════════════════════════ */}
          {activeTab === "disponibilidad" && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Horario Semanal (7 días)</h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Aquí defines una sola plantilla semanal. El sistema la replica para disponibilidad futura.
                  </p>
                </div>
                <Button onClick={handleSaveSchedule} disabled={savingSchedule || loadingSchedule} className="h-9 text-sm">
                  {savingSchedule ? "Guardando..." : "Guardar horario semanal"}
                </Button>
              </div>

              {loadingSchedule ? (
                <div className="py-8 text-center text-sm text-muted-foreground animate-pulse">Cargando horario semanal...</div>
              ) : (
                <div className="space-y-3">
                  {weeklySchedule.map((day) => (
                    <div key={day.dayOfWeek} className="border border-border rounded-xl p-4 bg-card">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-primary" />
                          <p className="font-medium text-foreground">{day.name}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Activo</span>
                          <Toggle
                            checked={day.active}
                            onChange={(active) => handleWeeklyScheduleChange(day.dayOfWeek, { active })}
                          />
                        </div>
                      </div>

                      {day.active && (
                        <div className="space-y-3">
                          <div className="grid sm:grid-cols-2 gap-3">
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">Inicio</label>
                              <input
                                type="time"
                                className="w-full px-3 py-2 bg-input-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                                value={day.start}
                                onChange={(e) => handleWeeklyScheduleChange(day.dayOfWeek, { start: e.target.value })}
                              />
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground mb-1 block">Fin</label>
                              <input
                                type="time"
                                className="w-full px-3 py-2 bg-input-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                                value={day.end}
                                onChange={(e) => handleWeeklyScheduleChange(day.dayOfWeek, { end: e.target.value })}
                              />
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Con receso</span>
                            <Toggle
                              checked={day.hasBreak}
                              onChange={(hasBreak) => handleWeeklyScheduleChange(day.dayOfWeek, { hasBreak })}
                            />
                          </div>

                          {day.hasBreak && (
                            <div className="grid sm:grid-cols-2 gap-3">
                              <div>
                                <label className="text-xs font-medium text-muted-foreground mb-1 block">Inicio receso</label>
                                <input
                                  type="time"
                                  className="w-full px-3 py-2 bg-input-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                                  value={day.breakStart}
                                  onChange={(e) => handleWeeklyScheduleChange(day.dayOfWeek, { breakStart: e.target.value })}
                                />
                              </div>
                              <div>
                                <label className="text-xs font-medium text-muted-foreground mb-1 block">Fin receso</label>
                                <input
                                  type="time"
                                  className="w-full px-3 py-2 bg-input-background border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                                  value={day.breakEnd}
                                  onChange={(e) => handleWeeklyScheduleChange(day.dayOfWeek, { breakEnd: e.target.value })}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {scheduleMsg && (
                <p className={`text-sm ${scheduleMsg.startsWith("Error") ? "text-destructive" : "text-success"}`}>
                  {scheduleMsg}
                </p>
              )}
            </div>
          )}

          {/* ═══════════════════════════════════════
              TAB: WHATSAPP
          ═══════════════════════════════════════ */}
          {activeTab === "whatsapp" && (
            <div className="space-y-5">
              <h2 className="text-lg font-semibold text-foreground">Integración WhatsApp</h2>

              {/* Status */}
              <div className="flex items-center justify-between gap-2 px-4 py-3 bg-secondary/40 rounded-xl border border-border">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${waConnected ? "bg-success" : "bg-muted-foreground"}`} />
                  <span className="text-sm font-medium text-foreground">
                    {waConnected ? "Conectado" : "Desconectado"}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">Estado: {waStatus}</span>
              </div>
              {waLastCheckedAt && (
                <p className="text-xs text-muted-foreground">
                  Última verificación: {new Date(waLastCheckedAt).toLocaleString("es-MX")}
                </p>
              )}

              {waError && (
                <p className="text-sm text-destructive">{waError}</p>
              )}

              {!waDoctorId && (
                <p className="text-sm text-warning">
                  No se detectó el ID del doctor. Guarda tu perfil y vuelve a intentar.
                </p>
              )}

              {!waConnected && !waQr && (waStatus === "initializing" || waStatus === "qr_ready") && (
                <p className="text-sm text-muted-foreground">
                  Generando código QR...
                </p>
              )}

              {/* Instructions box */}
              <div className="px-4 py-4 bg-secondary/30 rounded-xl border border-border space-y-2">
                <p className="text-sm font-medium text-foreground">Instrucciones para conectar:</p>
                <ol className="space-y-1">
                  {[
                    "Instala el microservicio de WhatsApp en tu servidor",
                    "Escanea el código QR con WhatsApp Business",
                    "Verifica la conexión haciendo clic en el botón inferior"
                  ].map((step, i) => (
                    <li key={i} className="text-sm text-primary flex items-start gap-2">
                      <span className="shrink-0">{i + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* QR if not connected */}
              {!waConnected && waQr && (
                <div className="flex justify-center">
                  <div className="w-56 h-56 bg-white border border-border rounded-2xl p-2 overflow-hidden shadow-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={waQr} alt="WhatsApp QR" className="w-full h-full object-contain" />
                  </div>
                </div>
              )}

              {/* Action buttons */}
              {waConnected ? (
                <button
                  onClick={() => setDisconnectConfirmOpen(true)}
                  disabled={disconnecting}
                  className="w-full px-4 py-2.5 border border-border rounded-xl text-sm font-medium text-foreground hover:bg-secondary transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <LogOut className="w-4 h-4" /> {disconnecting ? "Desvinculando..." : "Desvincular WhatsApp"}
                </button>
              ) : (
                <button
                  onClick={verifyConnection}
                  disabled={verifying}
                  className="w-full px-4 py-2.5 border border-border rounded-xl text-sm font-medium text-foreground hover:bg-secondary transition-colors disabled:opacity-60"
                >
                  {verifying ? "Verificando..." : "Generar / Verificar QR"}
                </button>
              )}

              <div className="space-y-3 p-4 bg-secondary/20 rounded-xl border border-border">
                <p className="text-sm font-medium text-foreground">Reglas automáticas del bot</p>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      Horas de recordatorio (separadas por coma)
                    </label>
                    <input
                      className="w-full px-3 py-2 bg-input-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                      value={formData.reminderLeadHours}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, reminderLeadHours: e.target.value }))
                      }
                      placeholder="24,3,1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      Ventana de envío (minutos)
                    </label>
                    <input
                      type="text" inputMode="numeric"
                      min={1}
                      max={240}
                      className="w-full px-3 py-2 bg-input-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                      value={formData.reminderWindowMinutes}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          reminderWindowMinutes: e.target.value.replace(/^0+(?=\d)/, ""),
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between px-3 py-2 bg-card rounded-lg border border-border">
                    <span className="text-sm text-foreground">Respuesta automática general</span>
                    <Toggle
                      checked={formData.whatsappAutoReplyEnabled}
                      onChange={(value) =>
                        setFormData((prev) => ({ ...prev, whatsappAutoReplyEnabled: value }))
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 bg-card rounded-lg border border-border">
                    <span className="text-sm text-foreground">Confirmación automática por mensaje</span>
                    <Toggle
                      checked={formData.whatsappAutoConfirmEnabled}
                      onChange={(value) =>
                        setFormData((prev) => ({ ...prev, whatsappAutoConfirmEnabled: value }))
                      }
                    />
                  </div>
                  <div className="flex items-center justify-between px-3 py-2 bg-card rounded-lg border border-border">
                    <span className="text-sm text-foreground">Cancelación automática por mensaje</span>
                    <Toggle
                      checked={formData.whatsappAutoCancelEnabled}
                      onChange={(value) =>
                        setFormData((prev) => ({ ...prev, whatsappAutoCancelEnabled: value }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Puedes personalizar mensajes con variables:{" "}
                    <span className="font-mono text-foreground">
                      {"{paciente} {fecha_hora} {fecha} {hora} {tipo_cita} {tiempo_restante} {link_cuestionario} {estado_cita}"}
                    </span>
                  </p>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      Mensaje al crear cita
                    </label>
                    <textarea
                      rows={3}
                      value={formData.whatsappBookingMessageTemplate}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          whatsappBookingMessageTemplate: e.target.value,
                        }))
                      }
                      placeholder='Hola {paciente}, tu cita ({tipo_cita}) quedó agendada para el {fecha_hora}. Para confirmar responde "CONFIRMO".'
                      className="w-full px-3 py-2 bg-input-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      Mensaje de cuestionario
                    </label>
                    <textarea
                      rows={3}
                      value={formData.whatsappQuestionnaireTemplate}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          whatsappQuestionnaireTemplate: e.target.value,
                        }))
                      }
                      placeholder="Hola {paciente}, completa tu preconsulta aquí: {link_cuestionario}"
                      className="w-full px-3 py-2 bg-input-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      Recordatorio para cita pendiente (debe pedir confirmación)
                    </label>
                    <textarea
                      rows={3}
                      value={formData.whatsappReminderPendingTemplate}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          whatsappReminderPendingTemplate: e.target.value,
                        }))
                      }
                      placeholder='Hola {paciente}, te recordamos tu cita {fecha_hora}. Faltan {tiempo_restante}. Responde "CONFIRMO" para confirmar.'
                      className="w-full px-3 py-2 bg-input-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      Recordatorio para cita confirmada (solo recordatorio + cancelación)
                    </label>
                    <textarea
                      rows={3}
                      value={formData.whatsappReminderConfirmedTemplate}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          whatsappReminderConfirmedTemplate: e.target.value,
                        }))
                      }
                      placeholder='Hola {paciente}, recordatorio de tu cita {fecha_hora}. Si deseas cancelarla responde "CANCELAR".'
                      className="w-full px-3 py-2 bg-input-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                </div>

                <div className="space-y-3 rounded-xl border border-border bg-card/60 p-4">
                  <p className="text-sm font-medium text-foreground">Vista previa y prueba de plantillas</p>

                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">
                        Plantilla a previsualizar
                      </label>
                      <select
                        className="w-full px-3 py-2 bg-input-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                        value={waPreviewType}
                        onChange={(e) => {
                          const nextType = e.target.value as WhatsAppTemplateType;
                          setWaPreviewType(nextType);
                          void loadTemplatePreview(nextType);
                        }}
                      >
                        {WHATSAPP_TEMPLATE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">
                        Teléfono para prueba
                      </label>
                      <input
                        className="w-full px-3 py-2 bg-input-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
                        value={waTestPhone}
                        onChange={(e) => setWaTestPhone(e.target.value)}
                        placeholder="Ej. 6241234567"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => void loadTemplatePreview(waPreviewType)}
                      disabled={waPreviewLoading}
                    >
                      {waPreviewLoading ? "Generando..." : "Actualizar vista previa"}
                    </Button>
                    <Button onClick={sendWhatsAppTest} disabled={waSendingTest || !waConnected}>
                      {waSendingTest ? "Enviando..." : "Enviar mensaje de prueba"}
                    </Button>
                  </div>

                  {(waPreviewMsg || waTestMsg) && (
                    <div className="space-y-1">
                      {waPreviewMsg && (
                        <p className={`text-sm ${waPreviewMsg.startsWith("Error") ? "text-destructive" : "text-success"}`}>
                          {waPreviewMsg}
                        </p>
                      )}
                      {waTestMsg && (
                        <p className={`text-sm ${waTestMsg.startsWith("Error") ? "text-destructive" : "text-success"}`}>
                          {waTestMsg}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="rounded-lg border border-border bg-secondary/20 p-3">
                    <p className="text-xs text-muted-foreground mb-1">
                      Preview {waPreviewSource ? `(${waPreviewSource})` : ""}
                    </p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">
                      {waPreviewText || "Genera la vista previa para revisar el mensaje final."}
                    </p>
                  </div>
                </div>

                {waRulesMsg && (
                  <p className={`text-sm ${waRulesMsg.startsWith("Error") ? "text-destructive" : "text-success"}`}>
                    {waRulesMsg}
                  </p>
                )}

                <Button onClick={saveWhatsappRules} disabled={savingWaRules} className="h-10 w-full sm:w-auto">
                  {savingWaRules ? "Guardando..." : "Guardar reglas de WhatsApp"}
                </Button>
              </div>

              {/* Active features */}
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Funciones activas:</p>
                {[
                  "Envío automático de confirmaciones de cita",
                  "Envío de cuestionario pre-clínico",
                  "Recordatorios de cita en múltiples horas configurables",
                  "Plantillas personalizadas de mensajes por médico",
                  "Confirmación por WhatsApp respondiendo CONFIRMO",
                  "Cancelación por WhatsApp respondiendo CANCELAR",
                  "Respuesta automática inteligente a mensajes entrantes",
                ].map((feature, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-primary">
                    <span>•</span>
                    <span>{feature}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">Historial reciente del bot</p>
                  <button
                    onClick={() => void loadWhatsAppHistory()}
                    className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-secondary transition-colors"
                  >
                    Recargar
                  </button>
                </div>

                {waHistoryLoading ? (
                  <p className="text-xs text-muted-foreground animate-pulse">Cargando historial...</p>
                ) : waHistory.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No hay interacciones registradas todavía.</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {waHistory.map((item) => (
                      <div key={item.id} className="p-3 rounded-xl border border-border bg-secondary/20">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium text-foreground">
                            {item.direction === "INBOUND" ? "Paciente → Bot" : "Bot → Paciente"}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {new Date(item.createdAt).toLocaleString("es-MX")}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {item.patient ? formatPatientName(item.patient) : item.phone} · {item.intent || "SIN_INTENCION"} · {item.action || "SIN_ACCION"}
                        </p>
                        <p className="text-sm text-foreground mt-2 whitespace-pre-wrap">{item.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Notification Status Panel */}
              <NotificationStatusPanel />
            </div>
          )}

          {/* ═══════════════════════════════════════
              TAB: EQUIPO
          ═══════════════════════════════════════ */}
          {activeTab === "equipo" && <SecretaryManager />}
        </div>
      </div>

      <Modal
        open={disconnectConfirmOpen}
        onOpenChange={setDisconnectConfirmOpen}
        title="Desvincular WhatsApp"
        description="Se cerrará la sesión del bot para este médico y dejarán de enviarse notificaciones automáticas."
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Puedes volver a vincularlo después escaneando un nuevo QR.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setDisconnectConfirmOpen(false)} disabled={disconnecting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={disconnectWhatsapp} disabled={disconnecting}>
              {disconnecting ? "Desvinculando..." : "Confirmar"}
            </Button>
          </div>
        </div>
      </Modal>
    </DoctorLayout>
  );
}

export default function DoctorConfiguration() {
  return (
    <Suspense
      fallback={
        <DoctorLayout>
          <div className="p-6 lg:p-8 w-full">
            <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
              Cargando configuración...
            </div>
          </div>
        </DoctorLayout>
      }
    >
      <DoctorConfigurationContent />
    </Suspense>
  );
}

