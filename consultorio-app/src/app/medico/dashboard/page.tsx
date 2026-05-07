"use client";

import { useState, useEffect, useCallback } from "react";
import { Calendar, CheckCircle, CheckCircle2, AlertCircle, UserRound, ChevronDown } from "lucide-react";
import { DoctorLayout } from "@/components/DoctorLayout";
import { OnboardingBanner, OnboardingWizard } from "@/components/OnboardingWizard";
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
  clinicAggregates?: {
    mode: "SINGLE_DOCTOR" | "CLINIC";
    clinicId: string | null;
    doctorsCount: number;
    totals: {
      todayAppointments: number;
      upcomingAppointments: number;
      pending: number;
      confirmed: number;
      completed: number;
      cancelled: number;
      overduePending: number;
    };
    doctors: Array<{
      doctorId: string;
      doctorName: string;
      todayAppointments: number;
      pending: number;
      confirmed: number;
      completed: number;
      overduePending: number;
    }>;
  };
};

type FunnelSummaryResponse = {
  period: { days: number; since: string };
  summary: { visits: number; confirmed: number; overallConversion: number };
  funnel: Array<{ step: string; count: number; conversionFromVisit: number }>;
  byChannel: Array<{ channel: string; confirmed: number }>;
  appointmentsByChannel: Array<{ channel: string; count: number }>;
};

type AiUsageSummaryResponse = {
  totals: {
    jobs: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCostUsd: number;
  };
  byModule: Array<{
    module: string;
    jobs: number;
    totalTokens: number;
    estimatedCostUsd: number;
  }>;
  byModel: Array<{
    model: string;
    jobs: number;
    totalTokens: number;
    estimatedCostUsd: number;
  }>;
  dailySeries: Array<{
    date: string;
    jobs: number;
    totalTokens: number;
    estimatedCostUsd: number;
  }>;
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
  const [aiUsage, setAiUsage] = useState<AiUsageSummaryResponse | null>(null);
  const [aiUsageLoading, setAiUsageLoading] = useState(false);
  const [funnelData, setFunnelData] = useState<FunnelSummaryResponse | null>(null);
  const [funnelLoading, setFunnelLoading] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showFunnel, setShowFunnel] = useState(false);
  const [showAiUsage, setShowAiUsage] = useState(false);
  const [showPriorityThree, setShowPriorityThree] = useState(false);
  const [showClinic, setShowClinic] = useState(false);

  const loadDashboard = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    else setLoadingData(true);

    try {
      const response = await fetch("/api/agenda/admin/dashboard/summary", { cache: "no-store" });
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

    let refreshId: number | null = null;

    const start = () => {
      if (refreshId !== null) return;
      refreshId = window.setInterval(() => {
        void loadDashboard(false);
      }, 30_000);
    };

    const stop = () => {
      if (refreshId !== null) {
        window.clearInterval(refreshId);
        refreshId = null;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void loadDashboard(false);
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [loadDashboard]);

  useEffect(() => {
    const loadAiUsage = async () => {
      setAiUsageLoading(true);
      try {
        const to = new Date();
        const from = new Date();
        from.setDate(from.getDate() - 29);
        const params = new URLSearchParams({
          from: from.toISOString(),
          to: to.toISOString(),
        });
        const response = await fetch(`/api/admin/ai/usage/summary?${params.toString()}`, { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || "No se pudo cargar uso/costo de IA");
        }
        setAiUsage(data as AiUsageSummaryResponse);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Error inesperado";
        toast.error(message);
      } finally {
        setAiUsageLoading(false);
      }
    };

    void loadAiUsage();
  }, []);

  useEffect(() => {
    const loadFunnel = async () => {
      setFunnelLoading(true);
      try {
        const response = await fetch('/api/admin/funnel/summary?days=30', { cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        if (response.ok) setFunnelData(data as FunnelSummaryResponse);
      } catch {
        // no mostrar error — el funnel es secundario
      } finally {
        setFunnelLoading(false);
      }
    };
    void loadFunnel();
  }, []);

  const updateAppointmentStatus = async (
    appointmentId: string,
    status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED"
  ) => {
    const key = `${appointmentId}:${status}`;
    setUpdatingKey(key);
    try {
      const response = await fetch(`/api/agenda/admin/appointments/${appointmentId}`, {
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
  const clinicAggregates = dashboardData?.clinicAggregates;
  const currencyFormatter = new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  });
  const usdFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 4,
  });

  const todayStr = format(now, "yyyy-MM-dd");
  const stats: Array<{
    label: string;
    value: number;
    icon: typeof Calendar;
    color: string;
    bg: string;
    href: string;
  }> = [
    {
      label: "Total Hoy",
      value: dashboardData?.stats.totalToday ?? 0,
      icon: Calendar,
      color: "text-primary",
      bg: "bg-primary/10",
      href: `/medico/agenda?date=${todayStr}`,
    },
    {
      label: "Pendientes",
      value: dashboardData?.stats.pending ?? 0,
      icon: AlertCircle,
      color: "text-warning",
      bg: "bg-warning/10",
      href: `/medico/agenda?date=${todayStr}&status=pending`,
    },
    {
      label: "Confirmadas",
      value: dashboardData?.stats.confirmed ?? 0,
      icon: CheckCircle,
      color: "text-success",
      bg: "bg-success/10",
      href: `/medico/agenda?date=${todayStr}&status=confirmed`,
    },
    {
      label: "Completadas",
      value: dashboardData?.stats.completed ?? 0,
      icon: CheckCircle2,
      color: "text-primary",
      bg: "bg-primary/10",
      href: `/medico/agenda?date=${todayStr}&status=completed`,
    },
    {
      label: "Vencidas",
      value: dashboardData?.stats.overduePending ?? 0,
      icon: AlertCircle,
      color: "text-destructive",
      bg: "bg-destructive/10",
      href: `/medico/agenda?date=${todayStr}&status=overdue`,
    },
  ];

  return (
    <DoctorLayout>
      <div className="p-6 lg:p-8 w-full">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
            <p className="text-sm text-muted-foreground capitalize mt-0.5">
              {format(now, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es })}
            </p>
          </div>
          {loadingData && <span className="text-xs text-muted-foreground animate-pulse">Actualizando…</span>}
        </div>

        {/* Stats strip */}
        <div className="flex flex-wrap gap-2 mb-6">
          {stats.map((stat) => (
            <button
              key={stat.label}
              type="button"
              onClick={() => router.push(stat.href)}
              title={`Ver ${stat.label.toLowerCase()} en la agenda`}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg border bg-card text-left transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 hover:border-primary/40 ${
                stat.label === "Vencidas" && stat.value > 0 ? "border-destructive/40" : "border-border"
              }`}
            >
              <stat.icon className={`w-3.5 h-3.5 ${stat.color} shrink-0`} />
              <span className="text-xs text-muted-foreground">{stat.label}</span>
              <span className={`text-sm font-bold tabular-nums ${stat.label === "Vencidas" && stat.value > 0 ? "text-destructive" : "text-foreground"}`}>
                {stat.value}
              </span>
            </button>
          ))}
        </div>

        {/* Hero: current appointment + overdue */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
          {/* Current appointment */}
          <div className={`rounded-lg border p-5 ${currentAppointment ? "border-primary/30 bg-primary/[0.04]" : "border-border bg-card"}`}>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">Cita en curso</p>
            {loading ? (
              <p className="text-sm text-muted-foreground animate-pulse py-3">Buscando cita activa...</p>
            ) : !currentAppointment ? (
              <p className="text-sm text-muted-foreground py-3">Sin cita activa en este momento.</p>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-foreground">{currentAppointment.patientName}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {formatTimeRange(currentAppointment)} · {currentAppointment.consultType === "extended" ? "Consulta integral" : "Consulta normal"}
                    </p>
                  </div>
                  <StatusBadge status={currentAppointment.status} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => router.push(`/medico/citas/${currentAppointment.id}`)}
                    className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    Ir a la cita
                  </button>
                  <button
                    onClick={() => router.push(`/medico/pacientes/${currentAppointment.patientId}`)}
                    className="px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-secondary transition-colors inline-flex items-center gap-1.5"
                  >
                    <UserRound className="w-3.5 h-3.5" />
                    Ver paciente
                  </button>
                  {currentAppointment.status === "pending" && (
                    <button
                      onClick={() => void updateAppointmentStatus(currentAppointment.id, "CONFIRMED")}
                      disabled={updatingKey !== null}
                      className="px-3 py-1.5 text-xs font-medium rounded-md border border-success/40 text-success hover:bg-success/10 transition-colors disabled:opacity-60"
                    >
                      {updatingKey === `${currentAppointment.id}:CONFIRMED` ? "…" : "Confirmar"}
                    </button>
                  )}
                  <button
                    onClick={() => void updateAppointmentStatus(currentAppointment.id, "COMPLETED")}
                    disabled={updatingKey !== null}
                    className="px-3 py-1.5 text-xs font-medium rounded-md border border-success/40 text-success hover:bg-success/10 transition-colors disabled:opacity-60"
                  >
                    {updatingKey === `${currentAppointment.id}:COMPLETED` ? "…" : "Marcar realizada"}
                  </button>
                  <button
                    onClick={() => void updateAppointmentStatus(currentAppointment.id, "CANCELLED")}
                    disabled={updatingKey !== null}
                    className="px-3 py-1.5 text-xs font-medium rounded-md border border-destructive/40 text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-60"
                  >
                    {updatingKey === `${currentAppointment.id}:CANCELLED` ? "…" : "Cancelar"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Overdue pending */}
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pendientes vencidas</p>
              {overduePendingAppointments.length > 0 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive font-semibold tabular-nums">
                  {overduePendingAppointments.length}
                </span>
              )}
            </div>
            {loading ? (
              <p className="text-sm text-muted-foreground animate-pulse py-3">Cargando...</p>
            ) : overduePendingAppointments.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3">Sin pendientes vencidas.</p>
            ) : (
              <div className="space-y-2">
                {overduePendingAppointments.map((apt) => {
                  const minutesLate = Math.max(1, Math.floor((now.getTime() - new Date(apt.endTime).getTime()) / 60_000));
                  return (
                    <div key={apt.id} className="rounded-md border border-destructive/25 bg-destructive/5 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-foreground">{apt.patientName}</p>
                          <p className="text-xs text-destructive mt-0.5">Terminó hace {minutesLate} min · {formatTimeRange(apt)}</p>
                        </div>
                        <StatusBadge status={apt.status} />
                      </div>
                      <div className="flex gap-2 mt-2.5">
                        <button
                          onClick={() => updateAppointmentStatus(apt.id, "COMPLETED")}
                          disabled={updatingKey !== null}
                          className="px-2.5 py-1 text-xs font-medium rounded border border-success/40 text-success hover:bg-success/10 transition-colors disabled:opacity-60"
                        >
                          {updatingKey === `${apt.id}:COMPLETED` ? "…" : "Realizada"}
                        </button>
                        <button
                          onClick={() => updateAppointmentStatus(apt.id, "CANCELLED")}
                          disabled={updatingKey !== null}
                          className="px-2.5 py-1 text-xs font-medium rounded border border-destructive/40 text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-60"
                        >
                          {updatingKey === `${apt.id}:CANCELLED` ? "…" : "Cancelar"}
                        </button>
                        <button
                          onClick={() => router.push(`/medico/citas/${apt.id}`)}
                          className="px-2.5 py-1 text-xs font-medium rounded border border-border hover:bg-secondary transition-colors"
                        >
                          Ver
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Onboarding */}
        {setupChecklist && (
          <>
            <OnboardingBanner checklist={setupChecklist} onOpen={() => setWizardOpen(true)} />
            <OnboardingWizard checklist={setupChecklist} open={wizardOpen} onClose={() => setWizardOpen(false)} />
          </>
        )}

        {/* Today appointments — compact list */}
        <div className="bg-card border border-border rounded-lg mb-4">
          <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Citas de hoy</h2>
            <span className="text-xs text-muted-foreground tabular-nums">{todayAppointments.length} citas</span>
          </div>
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-6 animate-pulse">Cargando citas...</p>
          ) : todayAppointments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Sin citas programadas para hoy.</p>
          ) : (
            <div className="divide-y divide-border">
              {todayAppointments.map((apt) => (
                <div
                  key={apt.id}
                  onClick={() => router.push(`/medico/citas/${apt.id}`)}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-secondary/30 transition-colors cursor-pointer"
                >
                  <span className="w-[80px] shrink-0 text-sm font-medium text-foreground tabular-nums">
                    {format(new Date(apt.startTime), "HH:mm")}
                  </span>
                  <span className="flex-1 min-w-0 text-sm text-foreground truncate">{apt.patientName}</span>
                  <span className="text-xs text-muted-foreground shrink-0 hidden md:block capitalize">
                    {apt.consultType === "extended" ? "Integral" : "Normal"}
                  </span>
                  <StatusBadge status={apt.status} />
                  <div className="flex gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {apt.status === "pending" && (
                      <button
                        onClick={() => void updateAppointmentStatus(apt.id, "CONFIRMED")}
                        disabled={updatingKey !== null}
                        className="px-2.5 py-1 text-xs font-medium border border-primary/40 text-primary rounded hover:bg-primary/10 transition-colors disabled:opacity-60"
                      >
                        {updatingKey === `${apt.id}:CONFIRMED` ? "…" : "Confirmar"}
                      </button>
                    )}
                    {["pending", "confirmed", "rescheduled"].includes(apt.status) && (
                      <button
                        onClick={() => void updateAppointmentStatus(apt.id, "COMPLETED")}
                        disabled={updatingKey !== null}
                        className="px-2.5 py-1 text-xs font-medium border border-success/40 text-success rounded hover:bg-success/10 transition-colors disabled:opacity-60"
                      >
                        {updatingKey === `${apt.id}:COMPLETED` ? "…" : "Realizada"}
                      </button>
                    )}
                    {["pending", "confirmed", "rescheduled"].includes(apt.status) && (
                      <button
                        onClick={() => void updateAppointmentStatus(apt.id, "CANCELLED")}
                        disabled={updatingKey !== null}
                        className="px-2.5 py-1 text-xs font-medium border border-destructive/40 text-destructive rounded hover:bg-destructive/10 transition-colors disabled:opacity-60"
                      >
                        {updatingKey === `${apt.id}:CANCELLED` ? "…" : "Cancelar"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming appointments */}
        {upcomingAppointments.length > 0 && (
          <div className="bg-card border border-border rounded-lg mb-4">
            <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Próximas citas</h2>
              <span className="text-xs text-muted-foreground tabular-nums">{upcomingAppointments.length}</span>
            </div>
            <div className="divide-y divide-border">
              {upcomingAppointments.map((apt) => (
                <div
                  key={apt.id}
                  onClick={() => router.push(`/medico/agenda?date=${apt.dateLocal}`)}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-secondary/30 transition-colors cursor-pointer"
                >
                  <span className="w-[80px] shrink-0 text-sm text-muted-foreground tabular-nums">
                    {format(new Date(apt.startTime), "HH:mm")}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0 hidden sm:block w-20">
                    {format(new Date(apt.date), "EEE dd MMM", { locale: es })}
                  </span>
                  <span className="flex-1 min-w-0 text-sm text-foreground truncate">{apt.patientName}</span>
                  <StatusBadge status={apt.status} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Analytics — collapsed by default */}
        {analytics && (
          <div className="bg-card border border-border rounded-lg mb-4">
            <button
              type="button"
              onClick={() => setShowAnalytics((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-secondary/20 transition-colors rounded-lg"
            >
              <div>
                <span className="text-sm font-semibold text-foreground">Analítica mensual</span>
                <span className="text-xs text-muted-foreground ml-2">· {analytics.currentMonth.label}</span>
              </div>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showAnalytics ? "rotate-180" : ""}`} />
            </button>
            {showAnalytics && (
              <div className="border-t border-border p-5 grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-md border border-border bg-secondary/20 p-3">
                  <p className="text-xs text-muted-foreground">Citas del mes</p>
                  <p className="text-xl font-semibold text-foreground">{analytics.currentMonth.totalAppointments}</p>
                </div>
                <div className="rounded-md border border-border bg-secondary/20 p-3">
                  <p className="text-xs text-muted-foreground">Completadas</p>
                  <p className="text-xl font-semibold text-foreground">{analytics.currentMonth.completedAppointments}</p>
                </div>
                <div className="rounded-md border border-border bg-secondary/20 p-3">
                  <p className="text-xs text-muted-foreground">Ingreso realizado</p>
                  <p className="text-xl font-semibold text-foreground">{currencyFormatter.format(analytics.currentMonth.estimatedRevenueCompleted)}</p>
                </div>
                <div className="rounded-md border border-border bg-secondary/20 p-3">
                  <p className="text-xs text-muted-foreground">Ingreso programado</p>
                  <p className="text-xl font-semibold text-foreground">{currencyFormatter.format(analytics.currentMonth.estimatedRevenueScheduled)}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Funnel — collapsed */}
        <div className="bg-card border border-border rounded-lg mb-4">
          <button
            type="button"
            onClick={() => setShowFunnel((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-secondary/20 transition-colors rounded-lg"
          >
            <div>
              <span className="text-sm font-semibold text-foreground">Conversión por canal</span>
              <span className="text-xs text-muted-foreground ml-2">· últimos 30 días</span>
            </div>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showFunnel ? "rotate-180" : ""}`} />
          </button>
          {showFunnel && (
            <div className="border-t border-border p-5">
              {funnelLoading ? (
                <p className="text-sm text-muted-foreground animate-pulse">Cargando métricas de conversión...</p>
              ) : !funnelData || funnelData.summary.visits === 0 ? (
                <p className="text-sm text-muted-foreground">Sin datos de funnel todavía. Los eventos se registran en tiempo real desde la página de reserva.</p>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-md border border-border bg-secondary/20 p-3">
                      <p className="text-xs text-muted-foreground">Visitas</p>
                      <p className="text-xl font-semibold text-foreground">{funnelData.summary.visits}</p>
                    </div>
                    <div className="rounded-md border border-border bg-secondary/20 p-3">
                      <p className="text-xs text-muted-foreground">Confirmadas</p>
                      <p className="text-xl font-semibold text-foreground">{funnelData.summary.confirmed}</p>
                    </div>
                    <div className="rounded-md border border-border bg-secondary/20 p-3">
                      <p className="text-xs text-muted-foreground">Conversión</p>
                      <p className="text-xl font-semibold text-foreground">{funnelData.summary.overallConversion}%</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-md border border-border bg-secondary/10 p-4">
                      <p className="text-sm font-medium text-foreground mb-3">Pasos del funnel</p>
                      <div className="space-y-2">
                        {funnelData.funnel.map((item) => (
                          <div key={item.step} className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">{item.step.replace(/_/g, " ").toLowerCase()}</span>
                            <span className="font-medium text-foreground">
                              {item.count} <span className="text-muted-foreground">({item.conversionFromVisit}%)</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-md border border-border bg-secondary/10 p-4">
                      <p className="text-sm font-medium text-foreground mb-3">Citas por canal</p>
                      <div className="space-y-2">
                        {funnelData.appointmentsByChannel.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Sin citas con atribución de canal aún.</p>
                        ) : (
                          funnelData.appointmentsByChannel.map((item) => (
                            <div key={item.channel} className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">{item.channel.replace(/_/g, " ").toLowerCase()}</span>
                              <span className="font-medium text-foreground">{item.count}</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* AI usage — collapsed */}
        <div className="bg-card border border-border rounded-lg mb-4">
          <button
            type="button"
            onClick={() => setShowAiUsage((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-secondary/20 transition-colors rounded-lg"
          >
            <div>
              <span className="text-sm font-semibold text-foreground">IA · uso y costo</span>
              <span className="text-xs text-muted-foreground ml-2">· últimos 30 días</span>
            </div>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showAiUsage ? "rotate-180" : ""}`} />
          </button>
          {showAiUsage && (
            <div className="border-t border-border p-5">
              {aiUsageLoading ? (
                <p className="text-sm text-muted-foreground animate-pulse">Cargando métricas de IA...</p>
              ) : !aiUsage ? (
                <p className="text-sm text-muted-foreground">Sin datos de uso de IA para este periodo.</p>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="rounded-md border border-border bg-secondary/20 p-3">
                      <p className="text-xs text-muted-foreground">Eventos IA</p>
                      <p className="text-xl font-semibold text-foreground">{aiUsage.totals.jobs}</p>
                    </div>
                    <div className="rounded-md border border-border bg-secondary/20 p-3">
                      <p className="text-xs text-muted-foreground">Tokens totales</p>
                      <p className="text-xl font-semibold text-foreground">{aiUsage.totals.totalTokens}</p>
                    </div>
                    <div className="rounded-md border border-border bg-secondary/20 p-3 md:col-span-2">
                      <p className="text-xs text-muted-foreground">Costo estimado</p>
                      <p className="text-xl font-semibold text-foreground">{usdFormatter.format(aiUsage.totals.estimatedCostUsd)}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="rounded-md border border-border bg-secondary/10 p-4">
                      <p className="text-sm font-medium text-foreground mb-2">Top módulos</p>
                      <div className="space-y-2">
                        {aiUsage.byModule.slice(0, 5).map((item) => (
                          <div key={item.module} className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">{item.module}</span>
                            <span className="font-medium text-foreground">{usdFormatter.format(item.estimatedCostUsd)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-md border border-border bg-secondary/10 p-4">
                      <p className="text-sm font-medium text-foreground mb-2">Top modelos</p>
                      <div className="space-y-2">
                        {aiUsage.byModel.slice(0, 5).map((item) => (
                          <div key={item.model} className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">{item.model}</span>
                            <span className="font-medium text-foreground">{usdFormatter.format(item.estimatedCostUsd)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-md border border-border bg-secondary/10 p-4">
                    <p className="text-sm font-medium text-foreground mb-2">Serie diaria (últimas 2 semanas)</p>
                    <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                      {aiUsage.dailySeries.slice(-14).map((point) => (
                        <div key={point.date} className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">{point.date}</span>
                          <span className="text-foreground tabular-nums">
                            {point.jobs} jobs · {point.totalTokens} tokens · {usdFormatter.format(point.estimatedCostUsd)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Priority three — collapsed */}
        {priorityThree && (
          <div className="bg-card border border-border rounded-lg mb-4">
            <button
              type="button"
              onClick={() => setShowPriorityThree((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-secondary/20 transition-colors rounded-lg"
            >
              <span className="text-sm font-semibold text-foreground">Control de asistencia y automatización</span>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showPriorityThree ? "rotate-180" : ""}`} />
            </button>
            {showPriorityThree && (
              <div className="border-t border-border p-5 space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-md border border-border bg-secondary/20 p-3">
                    <p className="text-xs text-muted-foreground">No asistieron</p>
                    <p className="text-xl font-semibold text-foreground">{priorityThree.metrics.noShowRatePct}%</p>
                  </div>
                  <div className="rounded-md border border-border bg-secondary/20 p-3">
                    <p className="text-xs text-muted-foreground">Confirmación</p>
                    <p className="text-xl font-semibold text-foreground">{priorityThree.metrics.confirmationRatePct}%</p>
                  </div>
                  <div className="rounded-md border border-border bg-secondary/20 p-3">
                    <p className="text-xs text-muted-foreground">Cancelación</p>
                    <p className="text-xl font-semibold text-foreground">{priorityThree.metrics.cancellationRatePct}%</p>
                  </div>
                  <div className="rounded-md border border-border bg-secondary/20 p-3">
                    <p className="text-xs text-muted-foreground">Tiempo de respuesta</p>
                    <p className="text-xl font-semibold text-foreground">
                      {priorityThree.metrics.averageMinutesToConfirmation ?? "—"}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="rounded-md border border-border bg-secondary/10 p-4">
                    <p className="text-sm font-medium text-foreground mb-2">Reglas del asistente automático</p>
                    <p className="text-xs text-muted-foreground">Vencida tras: {priorityThree.automationRules.pendingOverdueMinutes} min.</p>
                    <p className="text-xs text-muted-foreground mt-1">Escalado urgente: {priorityThree.automationRules.pendingEscalationMinutes} min antes.</p>
                    <p className="text-xs text-muted-foreground mt-1">Cierre por inasistencia: {priorityThree.automationRules.pendingAutoCloseHours} h.</p>
                  </div>
                  <div className="rounded-md border border-border bg-secondary/10 p-4">
                    <p className="text-sm font-medium text-foreground mb-2">Tareas ejecutadas</p>
                    <p className="text-xs text-muted-foreground">Vencidas ahora: {priorityThree.automationExecution.overduePendingNow}</p>
                    <p className="text-xs text-muted-foreground mt-1">Vencidas (7d): {priorityThree.automationExecution.last7Days.markedOverdue}</p>
                    <p className="text-xs text-muted-foreground mt-1">Recordatorios (7d): {priorityThree.automationExecution.last7Days.escalatedReminders}</p>
                    <p className="text-xs text-muted-foreground mt-1">Cerradas por inasistencia (7d): {priorityThree.automationExecution.last7Days.autoClosedNoShow}</p>
                  </div>
                </div>
                <div className="rounded-md border border-border bg-secondary/10 p-4">
                  <p className="text-sm font-medium text-foreground mb-3">Últimos movimientos</p>
                  {priorityThree.recentAuditEvents.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sin eventos recientes.</p>
                  ) : (
                    <div className="space-y-2">
                      {priorityThree.recentAuditEvents.slice(0, 8).map((event) => (
                        <div key={event.id} className="rounded border border-border bg-card p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-medium text-foreground">{event.actionLabel}</p>
                            <p className="text-xs text-muted-foreground tabular-nums">
                              {new Date(event.createdAt).toLocaleString("es-MX")}
                            </p>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {event.patientName || "Paciente"} · {event.source} · {event.actorType}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Clinic aggregates — collapsed */}
        {clinicAggregates?.mode === "CLINIC" && (
          <div className="bg-card border border-border rounded-lg mb-4">
            <button
              type="button"
              onClick={() => setShowClinic((v) => !v)}
              className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-secondary/20 transition-colors rounded-lg"
            >
              <div>
                <span className="text-sm font-semibold text-foreground">Reporte de clínica</span>
                <span className="text-xs text-muted-foreground ml-2">· {clinicAggregates.doctorsCount} médicos</span>
              </div>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showClinic ? "rotate-180" : ""}`} />
            </button>
            {showClinic && (
              <div className="border-t border-border p-5">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="rounded-md border border-border bg-secondary/20 p-3">
                    <p className="text-xs text-muted-foreground">Citas hoy</p>
                    <p className="text-xl font-semibold text-foreground">{clinicAggregates.totals.todayAppointments}</p>
                  </div>
                  <div className="rounded-md border border-border bg-secondary/20 p-3">
                    <p className="text-xs text-muted-foreground">Pendientes</p>
                    <p className="text-xl font-semibold text-foreground">{clinicAggregates.totals.pending}</p>
                  </div>
                  <div className="rounded-md border border-border bg-secondary/20 p-3">
                    <p className="text-xs text-muted-foreground">Confirmadas</p>
                    <p className="text-xl font-semibold text-foreground">{clinicAggregates.totals.confirmed}</p>
                  </div>
                  <div className="rounded-md border border-border bg-secondary/20 p-3">
                    <p className="text-xs text-muted-foreground">Completadas</p>
                    <p className="text-xl font-semibold text-foreground">{clinicAggregates.totals.completed}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {clinicAggregates.doctors.map((doctor) => (
                    <div key={doctor.doctorId} className="rounded border border-border p-3 bg-secondary/10">
                      <p className="text-sm font-semibold text-foreground">{doctor.doctorName}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Hoy: {doctor.todayAppointments} · Pendientes: {doctor.pending} · Confirmadas: {doctor.confirmed} · Completadas: {doctor.completed} · Vencidas: {doctor.overduePending}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </DoctorLayout>
  );
}

