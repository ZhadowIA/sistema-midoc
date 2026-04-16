"use client";

import { useState, useEffect, useCallback } from "react";
import { Calendar, Clock, CheckCircle, CheckCircle2, AlertCircle, UserRound } from "lucide-react";
import { DoctorLayout } from "@/components/DoctorLayout";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type DashboardAppointment = {
  id: string;
  patientId: string;
  patientName: string;
  date: string;
  dateLocal: string;
  time: string;
  startTime: string;
  endTime: string;
  consultType: string;
  status: string;
  hasQuestionnaire: boolean;
};

type DashboardSummaryResponse = {
  generatedAt: string;
  stats: {
    totalToday: number;
    pending: number;
    confirmed: number;
    completed: number;
    overduePending: number;
  };
  currentAppointment: DashboardAppointment | null;
  overduePendingAppointments: DashboardAppointment[];
  todayAppointments: DashboardAppointment[];
  upcomingAppointments: DashboardAppointment[];
  analytics?: {
    currentMonth: {
      monthKey: string;
      label: string;
      totalAppointments: number;
      completedAppointments: number;
      pendingAppointments: number;
      confirmedAppointments: number;
      cancelledAppointments: number;
      estimatedRevenueCompleted: number;
      estimatedRevenueScheduled: number;
    };
    lastSixMonths: Array<{
      monthKey: string;
      label: string;
      totalAppointments: number;
      completedAppointments: number;
      estimatedRevenueCompleted: number;
    }>;
    priceConfig: {
      normalConsultationPrice: number;
      extendedConsultationPrice: number;
    };
  };
  priorityThree?: {
    windowDays: number;
    metrics: {
      appointmentsConsidered: number;
      noShows: number;
      cancellations: number;
      confirmedAppointments: number;
      noShowRatePct: number;
      confirmationRatePct: number;
      cancellationRatePct: number;
      averageMinutesToConfirmation: number | null;
    };
    automationRules: {
      pendingEscalationMinutes: number;
      pendingOverdueMinutes: number;
      pendingAutoCloseHours: number;
    };
    automationExecution: {
      overduePendingNow: number;
      last7Days: {
        markedOverdue: number;
        escalatedReminders: number;
        autoClosedNoShow: number;
      };
    };
    recentAuditEvents: Array<{
      id: string;
      createdAt: string;
      action: string;
      actionLabel: string;
      source: string;
      actorType: string;
      appointmentId: string | null;
      appointmentStartTime: string | null;
      patientName: string | null;
      fromStatus: string | null;
      toStatus: string | null;
    }>;
  };
  setupChecklist?: {
    completed: number;
    total: number;
    progressPct: number;
    items: Array<{
      id: string;
      label: string;
      done: boolean;
      hint: string;
      actionLabel: string;
      actionHref: string;
    }>;
  };
};

const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: "Pendiente", color: "text-warning", bg: "bg-warning/10" },
  confirmed: { label: "Confirmada", color: "text-success", bg: "bg-success/10" },
  completed: { label: "Realizada", color: "text-primary", bg: "bg-primary/10" },
  cancelled: { label: "Cancelada", color: "text-destructive", bg: "bg-destructive/10" },
  rescheduled: { label: "Reagendada", color: "text-muted-foreground", bg: "bg-muted" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] || STATUS_MAP.pending;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${s.bg} ${s.color}`}>
      {s.label}
    </span>
  );
}

function formatTimeRange(apt: DashboardAppointment): string {
  return `${format(new Date(apt.startTime), "HH:mm")} - ${format(new Date(apt.endTime), "HH:mm")}`;
}

export default function DoctorDashboard() {
  const router = useRouter();
  const [dashboardData, setDashboardData] = useState<DashboardSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  const [loadingData, setLoadingData] = useState(false);

  const loadDashboard = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    else setLoadingData(true);

    try {
      const response = await fetch("/api/admin/dashboard/summary", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "No se pudo cargar el dashboard");
      }
      setDashboardData(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      toast.error(message);
    } finally {
      if (initial) setLoading(false);
      setLoadingData(false);
    }
  }, []);

  useEffect(() => {
    const timerId = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timerId);
  }, []);

  useEffect(() => {
    void loadDashboard(true);
    const refreshId = window.setInterval(() => {
      void loadDashboard(false);
    }, 30_000);

    return () => window.clearInterval(refreshId);
  }, [loadDashboard]);

  const updateAppointmentStatus = async (
    appointmentId: string,
    status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED"
  ) => {
    const key = `${appointmentId}:${status}`;
    setUpdatingKey(key);
    try {
      const response = await fetch(`/api/admin/appointments/${appointmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || payload.message || "No se pudo actualizar la cita");
      }

      toast.success("Cita actualizada");
      await loadDashboard(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      toast.error(message);
    } finally {
      setUpdatingKey(null);
    }
  };

  const currentAppointment = dashboardData?.currentAppointment ?? null;
  const overduePendingAppointments = dashboardData?.overduePendingAppointments ?? [];
  const todayAppointments = dashboardData?.todayAppointments ?? [];
  const upcomingAppointments = dashboardData?.upcomingAppointments ?? [];
  const analytics = dashboardData?.analytics;
  const priorityThree = dashboardData?.priorityThree;
  const setupChecklist = dashboardData?.setupChecklist;
  const currencyFormatter = new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  });

  const stats = [
    {
      label: "Total Hoy",
      value: dashboardData?.stats.totalToday ?? 0,
      icon: Calendar,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Pendientes",
      value: dashboardData?.stats.pending ?? 0,
      icon: AlertCircle,
      color: "text-warning",
      bg: "bg-warning/10",
    },
    {
      label: "Confirmadas",
      value: dashboardData?.stats.confirmed ?? 0,
      icon: CheckCircle,
      color: "text-success",
      bg: "bg-success/10",
    },
    {
      label: "Completadas",
      value: dashboardData?.stats.completed ?? 0,
      icon: CheckCircle2,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      label: "Vencidas",
      value: dashboardData?.stats.overduePending ?? 0,
      icon: AlertCircle,
      color: "text-destructive",
      bg: "bg-destructive/10",
    },
  ];

  return (
    <DoctorLayout>
      <div className="p-6 lg:p-8 w-full">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-muted-foreground text-sm capitalize">
              {format(now, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}
            </p>
            {loadingData && <span className="text-xs text-muted-foreground animate-pulse">Actualizando…</span>}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-card border border-border rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-3xl font-semibold text-foreground mt-1">{stat.value}</p>
                </div>
                <div className={`w-10 h-10 ${stat.bg} rounded-xl flex items-center justify-center`}>
                  <stat.icon className={`w-5 h-5 ${stat.color}`} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {analytics && (
          <div className="bg-card border border-border rounded-2xl shadow-sm mb-6">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">Analítica mensual</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Corte {analytics.currentMonth.label}
              </p>
            </div>
            <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-xl border border-border bg-secondary/20 p-3">
                <p className="text-xs text-muted-foreground">Citas del mes</p>
                <p className="text-xl font-semibold text-foreground">{analytics.currentMonth.totalAppointments}</p>
              </div>
              <div className="rounded-xl border border-border bg-secondary/20 p-3">
                <p className="text-xs text-muted-foreground">Completadas</p>
                <p className="text-xl font-semibold text-foreground">{analytics.currentMonth.completedAppointments}</p>
              </div>
              <div className="rounded-xl border border-border bg-secondary/20 p-3">
                <p className="text-xs text-muted-foreground">Ingreso realizado</p>
                <p className="text-xl font-semibold text-foreground">
                  {currencyFormatter.format(analytics.currentMonth.estimatedRevenueCompleted)}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-secondary/20 p-3">
                <p className="text-xs text-muted-foreground">Ingreso programado</p>
                <p className="text-xl font-semibold text-foreground">
                  {currencyFormatter.format(analytics.currentMonth.estimatedRevenueScheduled)}
                </p>
              </div>
            </div>
          </div>
        )}

        {priorityThree && (
          <div className="bg-card border border-border rounded-2xl shadow-sm mb-6">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">Prioridad 3: escala y negocio</h2>
              <p className="text-xs text-muted-foreground mt-1">
                KPIs operativos + reglas automáticas + auditoría
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-xl border border-border bg-secondary/20 p-3">
                  <p className="text-xs text-muted-foreground">No-show rate</p>
                  <p className="text-xl font-semibold text-foreground">{priorityThree.metrics.noShowRatePct}%</p>
                </div>
                <div className="rounded-xl border border-border bg-secondary/20 p-3">
                  <p className="text-xs text-muted-foreground">Tasa confirmación</p>
                  <p className="text-xl font-semibold text-foreground">{priorityThree.metrics.confirmationRatePct}%</p>
                </div>
                <div className="rounded-xl border border-border bg-secondary/20 p-3">
                  <p className="text-xs text-muted-foreground">Tasa cancelación</p>
                  <p className="text-xl font-semibold text-foreground">{priorityThree.metrics.cancellationRatePct}%</p>
                </div>
                <div className="rounded-xl border border-border bg-secondary/20 p-3">
                  <p className="text-xs text-muted-foreground">Min. a confirmación</p>
                  <p className="text-xl font-semibold text-foreground">
                    {priorityThree.metrics.averageMinutesToConfirmation ?? "—"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-xl border border-border bg-secondary/10 p-4">
                  <p className="text-sm font-medium text-foreground mb-2">Reglas automáticas</p>
                  <p className="text-xs text-muted-foreground">
                    Pendiente → vencida: {priorityThree.automationRules.pendingOverdueMinutes} min.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Escalado recordatorio: {priorityThree.automationRules.pendingEscalationMinutes} min antes.
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Cierre no-show: {priorityThree.automationRules.pendingAutoCloseHours} horas.
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-secondary/10 p-4">
                  <p className="text-sm font-medium text-foreground mb-2">Ejecución automática</p>
                  <p className="text-xs text-muted-foreground">
                    Vencidas actuales: {priorityThree.automationExecution.overduePendingNow}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Últimos 7 días · vencidas: {priorityThree.automationExecution.last7Days.markedOverdue}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Últimos 7 días · escalados: {priorityThree.automationExecution.last7Days.escalatedReminders}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Últimos 7 días · no-show cerradas: {priorityThree.automationExecution.last7Days.autoClosedNoShow}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-secondary/10 p-4">
                <p className="text-sm font-medium text-foreground mb-3">Auditoría reciente</p>
                {priorityThree.recentAuditEvents.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin eventos recientes.</p>
                ) : (
                  <div className="space-y-2">
                    {priorityThree.recentAuditEvents.slice(0, 8).map((event) => (
                      <div key={event.id} className="rounded-lg border border-border bg-card p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-foreground">{event.actionLabel}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(event.createdAt).toLocaleString("es-MX")}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {event.patientName || "Paciente"} · {event.source} · {event.actorType}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {setupChecklist && (
          <div className="bg-card border border-border rounded-2xl shadow-sm mb-6">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">Checklist de puesta en marcha</h2>
              <p className="text-xs text-muted-foreground mt-1">
                {setupChecklist.completed}/{setupChecklist.total} completados · {setupChecklist.progressPct}%
              </p>
            </div>
            <div className="p-6">
              <div className="h-2 rounded-full bg-secondary overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${setupChecklist.progressPct}%` }} />
              </div>
            </div>
          </div>
        )}


        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
          <div className="bg-card border border-border rounded-2xl shadow-sm">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">Cita en curso</h2>
            </div>
            <div className="p-6">
              {loading ? (
                <p className="text-sm text-muted-foreground text-center py-4 animate-pulse">Buscando cita en horario actual...</p>
              ) : !currentAppointment ? (
                <p className="text-sm text-muted-foreground text-center py-6">No hay una cita en curso en este momento.</p>
              ) : (
                <div className="rounded-xl border border-border bg-secondary/20 p-4 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Horario actual</p>
                      <p className="font-semibold text-foreground">{formatTimeRange(currentAppointment)}</p>
                    </div>
                    <StatusBadge status={currentAppointment.status} />
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">Paciente</p>
                    <p className="text-lg font-semibold text-foreground">{currentAppointment.patientName}</p>
                    <p className="text-sm text-muted-foreground capitalize">
                      {currentAppointment.consultType === "extended" ? "Consulta integral" : "Consulta normal"}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => router.push(`/medico/citas/${currentAppointment.id}`)}
                      className="px-3 py-2 text-sm font-medium rounded-lg border border-border hover:bg-secondary transition-colors"
                    >
                      Ir a la cita
                    </button>
                    <button
                      onClick={() => router.push(`/medico/pacientes/${currentAppointment.patientId}`)}
                      className="px-3 py-2 text-sm font-medium rounded-lg border border-border hover:bg-secondary transition-colors inline-flex items-center gap-2"
                    >
                      <UserRound className="w-4 h-4" />
                      Ver paciente
                    </button>
                    {currentAppointment.status === "pending" && (
                      <button
                        onClick={() => void updateAppointmentStatus(currentAppointment.id, "CONFIRMED")}
                        disabled={updatingKey !== null}
                        className="px-3 py-2 text-sm font-medium rounded-lg border border-primary/40 text-primary hover:bg-primary/10 transition-colors disabled:opacity-60"
                      >
                        {updatingKey === `${currentAppointment.id}:CONFIRMED` ? "Actualizando..." : "Confirmar"}
                      </button>
                    )}
                    <button
                      onClick={() => void updateAppointmentStatus(currentAppointment.id, "COMPLETED")}
                      disabled={updatingKey !== null}
                      className="px-3 py-2 text-sm font-medium rounded-lg border border-success/40 text-success hover:bg-success/10 transition-colors disabled:opacity-60"
                    >
                      {updatingKey === `${currentAppointment.id}:COMPLETED` ? "Actualizando..." : "Marcar realizada"}
                    </button>
                    <button
                      onClick={() => void updateAppointmentStatus(currentAppointment.id, "CANCELLED")}
                      disabled={updatingKey !== null}
                      className="px-3 py-2 text-sm font-medium rounded-lg border border-destructive/40 text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-60"
                    >
                      {updatingKey === `${currentAppointment.id}:CANCELLED` ? "Actualizando..." : "Cancelar"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl shadow-sm">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">Citas pasadas pendientes</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Se muestran citas pendientes cuyo horario de fin ya fue superado.
              </p>
            </div>
            <div className="p-6 space-y-3">
              {loading ? (
                <p className="text-sm text-muted-foreground text-center py-4 animate-pulse">Cargando pendientes...</p>
              ) : overduePendingAppointments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No hay citas pasadas en estado pendiente.
                </p>
              ) : (
                overduePendingAppointments.map((apt) => {
                  const minutesLate = Math.max(
                    1,
                    Math.floor((now.getTime() - new Date(apt.endTime).getTime()) / 60_000)
                  );
                  return (
                    <div
                      key={apt.id}
                      className="rounded-xl border border-border bg-secondary/20 p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-semibold text-foreground">{apt.patientName}</p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(apt.startTime), "EEE dd MMM", { locale: es })} · {formatTimeRange(apt)}
                          </p>
                          <p className="text-xs text-warning mt-1">Terminó hace {minutesLate} min</p>
                        </div>
                        <StatusBadge status={apt.status} />
                      </div>

                      <div className="flex flex-wrap gap-2 mt-3">
                        <button
                          onClick={() => updateAppointmentStatus(apt.id, "COMPLETED")}
                          disabled={updatingKey !== null}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-success/40 text-success hover:bg-success/10 transition-colors disabled:opacity-60"
                        >
                          {updatingKey === `${apt.id}:COMPLETED` ? "Actualizando..." : "Marcar realizada"}
                        </button>
                        <button
                          onClick={() => updateAppointmentStatus(apt.id, "CANCELLED")}
                          disabled={updatingKey !== null}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-destructive/40 text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-60"
                        >
                          {updatingKey === `${apt.id}:CANCELLED` ? "Actualizando..." : "Cancelar"}
                        </button>
                        <button
                          onClick={() => router.push(`/medico/citas/${apt.id}`)}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-secondary transition-colors"
                        >
                          Ver cita
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl shadow-sm">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="font-semibold text-foreground">Citas de Hoy</h2>
          </div>
          <div className="p-6 space-y-3">
            {loading ? (
              <p className="text-sm text-muted-foreground text-center py-6 animate-pulse">Cargando citas...</p>
            ) : todayAppointments.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No hay citas programadas para hoy</p>
            ) : (
              todayAppointments.map((apt) => (
                <div
                  key={apt.id}
                  onClick={() => router.push(`/medico/citas/${apt.id}`)}
                  className="flex items-center gap-4 p-4 rounded-xl border border-border hover:bg-secondary/50 transition-colors cursor-pointer"
                >
                  <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
                    <Clock className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">{formatTimeRange(apt)}</p>
                      <span className="text-muted-foreground">—</span>
                      <p className="text-foreground truncate">{apt.patientName}</p>
                    </div>
                    <p className="text-sm text-muted-foreground capitalize">
                      {apt.consultType === "extended" ? "Consulta Integral" : "Consulta Normal"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={apt.status} />
                    {apt.status === "pending" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void updateAppointmentStatus(apt.id, "CONFIRMED");
                        }}
                        disabled={updatingKey !== null}
                        className="px-3 py-1.5 text-xs font-medium border border-primary/40 text-primary rounded-lg hover:bg-primary/10 transition-colors disabled:opacity-60"
                      >
                        {updatingKey === `${apt.id}:CONFIRMED` ? "..." : "Confirmar"}
                      </button>
                    )}
                    {["pending", "confirmed", "rescheduled"].includes(apt.status) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void updateAppointmentStatus(apt.id, "COMPLETED");
                        }}
                        disabled={updatingKey !== null}
                        className="px-3 py-1.5 text-xs font-medium border border-success/40 text-success rounded-lg hover:bg-success/10 transition-colors disabled:opacity-60"
                      >
                        {updatingKey === `${apt.id}:COMPLETED` ? "..." : "Realizada"}
                      </button>
                    )}
                    {["pending", "confirmed", "rescheduled"].includes(apt.status) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void updateAppointmentStatus(apt.id, "CANCELLED");
                        }}
                        disabled={updatingKey !== null}
                        className="px-3 py-1.5 text-xs font-medium border border-destructive/40 text-destructive rounded-lg hover:bg-destructive/10 transition-colors disabled:opacity-60"
                      >
                        {updatingKey === `${apt.id}:CANCELLED` ? "..." : "Cancelar"}
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/medico/citas/${apt.id}`);
                      }}
                      className="px-3 py-1.5 text-xs font-medium border border-border rounded-lg hover:bg-secondary transition-colors"
                    >
                      Ver detalle
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {upcomingAppointments.length > 0 && (
          <div className="bg-card border border-border rounded-2xl shadow-sm mt-6">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">Próximas citas</h2>
            </div>
            <div className="p-6 space-y-3">
              {upcomingAppointments.map((apt) => (
                <div
                  key={apt.id}
                  onClick={() => router.push(`/medico/agenda?date=${apt.dateLocal}`)}
                  className="flex items-center gap-4 p-4 rounded-xl border border-border hover:bg-secondary/50 transition-colors cursor-pointer"
                >
                  <div className="w-10 h-10 bg-muted rounded-xl flex items-center justify-center shrink-0">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{apt.patientName}</p>
                    <p className="text-sm text-muted-foreground capitalize">
                      {format(new Date(apt.date), "EEE dd MMM", { locale: es })} · {format(new Date(apt.startTime), "HH:mm")}
                    </p>
                  </div>
                  <StatusBadge status={apt.status} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </DoctorLayout>
  );
}
