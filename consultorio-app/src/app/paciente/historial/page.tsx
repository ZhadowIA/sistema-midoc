"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowLeft, CalendarClock, CheckCircle2, Download, LogOut, RefreshCcw, Settings2, XCircle } from "lucide-react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Modal } from "@/components/Modal";
import { toast } from "sonner";

type HistoryAppointment = {
  id: string;
  status: string;
  source: string;
  appointmentType: string;
  durationMin: number;
  startTime: string;
  endTime: string;
  doctor: {
    id: string;
    name: string;
    specialty: string | null;
    slug: string | null;
    profileImage: string | null;
  };
  patient: {
    id: string;
    firstName?: string | null;
    lastNamePaternal?: string | null;
    lastNameMaternal?: string | null;
  };
};

type HistoryResponse = {
  appointments: HistoryAppointment[];
  summary: {
    total: number;
    completed: number;
    upcoming: number;
    cancelled: number;
  };
  billing?: {
    pendingCount: number;
    pendingTotal: number;
  };
  error?: string;
};

type AvailabilitySlot = {
  start: string;
  end: string;
  type: "normal" | "extended";
};

type DownloadHistoryItem = {
  appointmentId: string;
  doctorName: string;
  downloadedAt: string;
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmada",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
  RESCHEDULED: "Reagendada",
};

const MANAGEABLE_STATUSES = new Set(["PENDING", "CONFIRMED", "RESCHEDULED"]);

export default function PatientHistoryPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [appointments, setAppointments] = useState<HistoryAppointment[]>([]);
  const [summary, setSummary] = useState({ total: 0, completed: 0, upcoming: 0, cancelled: 0 });
  const [billing, setBilling] = useState({ pendingCount: 0, pendingTotal: 0 });
  const [actingAppointmentId, setActingAppointmentId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<HistoryAppointment | null>(null);

  const [rescheduleAppointmentId, setRescheduleAppointmentId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleSlots, setRescheduleSlots] = useState<AvailabilitySlot[]>([]);
  const [loadingRescheduleSlots, setLoadingRescheduleSlots] = useState(false);
  const [selectedRescheduleSlot, setSelectedRescheduleSlot] = useState("");
  const [downloadHistory, setDownloadHistory] = useState<DownloadHistoryItem[]>([]);

  const loadHistory = useCallback(async () => {
    const res = await fetch("/api/auth/patient/history", { cache: "no-store" });
    const data = await res.json() as HistoryResponse;
    if (!res.ok) throw new Error(data.error || "No se pudo cargar tu historial");
    setAppointments(data.appointments || []);
    setSummary(data.summary || { total: 0, completed: 0, upcoming: 0, cancelled: 0 });
    setBilling(data.billing || { pendingCount: 0, pendingTotal: 0 });
  }, []);

  useEffect(() => {
    loadHistory()
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : "Error interno";
        setError(message);
      })
      .finally(() => setLoading(false));
  }, [loadHistory]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("patient_download_history");
      if (!raw) return;
      const parsed = JSON.parse(raw) as DownloadHistoryItem[];
      if (Array.isArray(parsed)) setDownloadHistory(parsed.slice(0, 8));
    } catch {
      // ignore corrupt local cache
    }
  }, []);

  const selectedAppointment = appointments.find((item) => item.id === rescheduleAppointmentId) || null;

  useEffect(() => {
    if (!selectedAppointment || !rescheduleDate) {
      setRescheduleSlots([]);
      setSelectedRescheduleSlot("");
      return;
    }

    const type = selectedAppointment.appointmentType === "EXTENDED" ? "extended" : "normal";
    setLoadingRescheduleSlots(true);
    fetch(
      `/api/agenda/public/availability?date=${rescheduleDate}&type=${type}&doctorId=${selectedAppointment.doctor.id}`
    )
      .then((res) => res.json())
      .then((data) => {
        const slots = Array.isArray(data?.slots) ? (data.slots as AvailabilitySlot[]) : [];
        setRescheduleSlots(slots);
      })
      .catch(() => setRescheduleSlots([]))
      .finally(() => setLoadingRescheduleSlots(false));
  }, [selectedAppointment, rescheduleDate]);

  const canManageAppointment = (appointment: HistoryAppointment) => {
    return MANAGEABLE_STATUSES.has(appointment.status) && new Date(appointment.startTime).getTime() > Date.now();
  };

  const runAction = async (appointmentId: string, payload: { action: "CONFIRM" | "CANCEL" | "RESCHEDULE"; newStartTime?: string }) => {
    setActingAppointmentId(appointmentId);
    try {
      const res = await fetch(`/api/auth/patient/appointments/${appointmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "No se pudo actualizar la cita.");
      }

      await loadHistory();
      if (payload.action === "CONFIRM") toast.success("Cita confirmada.");
      if (payload.action === "CANCEL") toast.success("Cita cancelada.");
      if (payload.action === "RESCHEDULE") toast.success("Cita reagendada.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error inesperado";
      toast.error(message);
    } finally {
      setActingAppointmentId(null);
    }
  };

  const downloadSummary = async (appointmentId: string) => {
    setActingAppointmentId(appointmentId);
    try {
      const res = await fetch(`/api/auth/patient/appointments/${appointmentId}/download?format=pdf`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo generar la descarga.");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      a.href = url;
      a.download = match?.[1] ?? "resumen-consulta.txt";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      const doctorName = appointments.find((item) => item.id === appointmentId)?.doctor.name ?? "Médico";
      const nextHistory: DownloadHistoryItem[] = [
        { appointmentId, doctorName, downloadedAt: new Date().toISOString() },
        ...downloadHistory.filter((item) => item.appointmentId !== appointmentId),
      ].slice(0, 8);
      setDownloadHistory(nextHistory);
      window.localStorage.setItem("patient_download_history", JSON.stringify(nextHistory));
      toast.success("Descarga iniciada.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error inesperado";
      toast.error(message);
    } finally {
      setActingAppointmentId(null);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.push("/agendar");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => router.push("/agendar")}
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver
          </button>
          <h1 className="font-semibold">Mi historial de citas</h1>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="tertiary" onClick={() => router.push("/paciente/cuenta")}>
              <Settings2 className="w-4 h-4 mr-2" />
              Mi cuenta
            </Button>
            <Button size="sm" variant="secondary" onClick={handleLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Cerrar sesión
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid gap-3 sm:grid-cols-4 mb-8">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-2xl font-semibold">{summary.total}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Completadas</p>
            <p className="text-2xl font-semibold">{summary.completed}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Próximas</p>
            <p className="text-2xl font-semibold">{summary.upcoming}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Canceladas</p>
            <p className="text-2xl font-semibold">{summary.cancelled}</p>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Centro de pagos pendientes</p>
            <p className="text-sm">
              {billing.pendingCount} cita(s) · Total estimado{" "}
              <strong>${billing.pendingTotal.toFixed(2)} MXN</strong>
            </p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => router.push("/paciente/pre-checkin")}>
            Ir a pre-check-in
          </Button>
        </div>

        {loading ? (
          <div className="text-center text-muted-foreground py-12">Cargando historial...</div>
        ) : error ? (
          <div className="rounded-xl border border-red-500 text-red-400 p-4">{error}</div>
        ) : appointments.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
            Aún no tienes citas vinculadas a tu cuenta.
          </div>
        ) : (
          <div className="space-y-4">
            {downloadHistory.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-sm font-semibold text-foreground">Descargas recientes</h3>
                <ul className="mt-3 space-y-2">
                  {downloadHistory.map((item) => (
                    <li
                      key={item.appointmentId}
                      className="text-xs text-muted-foreground flex items-center justify-between gap-2"
                    >
                      <span>{item.doctorName} · cita {item.appointmentId.slice(0, 8)}</span>
                      <span>{new Date(item.downloadedAt).toLocaleString("es-MX")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {appointments.map((appointment) => (
              <div key={appointment.id} className="rounded-xl border border-border bg-card p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <p className="text-sm text-muted-foreground">Médico</p>
                    <p className="font-semibold">{appointment.doctor.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {appointment.doctor.specialty || "Especialidad no definida"}
                    </p>
                  </div>
                  <span className="text-sm px-2 py-1 rounded-md bg-secondary text-foreground w-fit">
                    {STATUS_LABELS[appointment.status] || appointment.status}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="w-4 h-4" />
                    {format(new Date(appointment.startTime), "EEEE dd MMM yyyy, HH:mm", { locale: es })}
                  </span>
                  <span>{appointment.durationMin} min</span>
                  <span>{appointment.appointmentType === "EXTENDED" ? "Consulta extendida" : "Consulta normal"}</span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {appointment.status === "PENDING" && canManageAppointment(appointment) && (
                    <Button
                      size="sm"
                      onClick={() => void runAction(appointment.id, { action: "CONFIRM" })}
                      disabled={actingAppointmentId === appointment.id}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Confirmar asistencia
                    </Button>
                  )}

                  {canManageAppointment(appointment) && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        const currentDate = format(new Date(appointment.startTime), "yyyy-MM-dd");
                        if (rescheduleAppointmentId === appointment.id) {
                          setRescheduleAppointmentId(null);
                          setRescheduleDate("");
                          setRescheduleSlots([]);
                          setSelectedRescheduleSlot("");
                          return;
                        }
                        setRescheduleAppointmentId(appointment.id);
                        setRescheduleDate(currentDate);
                        setSelectedRescheduleSlot("");
                      }}
                      disabled={actingAppointmentId === appointment.id}
                    >
                      <RefreshCcw className="w-4 h-4 mr-2" />
                      Reagendar
                    </Button>
                  )}

                  {canManageAppointment(appointment) && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setCancelTarget(appointment)}
                      disabled={actingAppointmentId === appointment.id}
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Cancelar
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="tertiary"
                    onClick={() =>
                      router.push(`/agendar${appointment.doctor.slug ? `?doctor=${appointment.doctor.slug}` : ""}`)
                    }
                  >
                    Agendar de nuevo
                  </Button>

                  {appointment.status === "COMPLETED" && (
                    <Button
                      size="sm"
                      variant="tertiary"
                      onClick={() => void downloadSummary(appointment.id)}
                      disabled={actingAppointmentId === appointment.id}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Descargar resumen
                    </Button>
                  )}
                </div>

                {rescheduleAppointmentId === appointment.id && (
                  <div className="mt-4 rounded-xl border border-border bg-secondary/20 p-4 space-y-3">
                    <Input
                      label="Nueva fecha"
                      type="date"
                      value={rescheduleDate}
                      onChange={(e) => {
                        setRescheduleDate(e.target.value);
                        setSelectedRescheduleSlot("");
                      }}
                    />

                    {loadingRescheduleSlots ? (
                      <p className="text-sm text-muted-foreground">Cargando horarios disponibles...</p>
                    ) : rescheduleSlots.length > 0 ? (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {rescheduleSlots.map((slot) => (
                          <button
                            key={slot.start}
                            type="button"
                            onClick={() => setSelectedRescheduleSlot(slot.start)}
                            className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                              selectedRescheduleSlot === slot.start
                                ? "border-primary bg-primary/10"
                                : "border-border hover:bg-secondary"
                            }`}
                          >
                            {format(new Date(slot.start), "HH:mm")} - {format(new Date(slot.end), "HH:mm")}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No hay horarios disponibles para esa fecha.</p>
                    )}

                    <Button
                      size="sm"
                      onClick={() => {
                        if (!selectedRescheduleSlot) {
                          toast.error("Selecciona un horario para reagendar.");
                          return;
                        }
                        void runAction(appointment.id, {
                          action: "RESCHEDULE",
                          newStartTime: selectedRescheduleSlot,
                        });
                      }}
                      disabled={actingAppointmentId === appointment.id || !selectedRescheduleSlot}
                    >
                      Confirmar nueva fecha
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={Boolean(cancelTarget)}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
        title="Cancelar cita"
        description={
          cancelTarget
            ? `Se cancelará tu cita del ${format(new Date(cancelTarget.startTime), "dd/MM/yyyy 'a las' HH:mm", { locale: es })}.`
            : "Confirma esta acción."
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Podrás volver a agendar cuando gustes desde este mismo historial.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setCancelTarget(null)} disabled={!cancelTarget}>
              Mantener cita
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!cancelTarget) return;
                const target = cancelTarget;
                setCancelTarget(null);
                void runAction(target.id, { action: "CANCEL" });
              }}
              disabled={Boolean(cancelTarget && actingAppointmentId === cancelTarget.id)}
            >
              {cancelTarget && actingAppointmentId === cancelTarget.id ? "Cancelando..." : "Confirmar cancelación"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

