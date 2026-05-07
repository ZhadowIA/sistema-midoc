"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  BrainCircuit,
  Building2,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Gauge,
  Loader2,
  Search,
  ShieldAlert,
  Sparkles,
  Users2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ClientSummary = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  tenantName: string;
  tenantSlug: string | null;
  subscriptionStatus: string;
  basePlan: "AGENDA" | "CLINICAL" | "INTEGRAL";
  addOn: "AI_30" | "AI_60" | "AI_100" | null;
  commercialPlanName: string;
  amount: number;
  currency: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  paymentRisk: "LOW" | "MEDIUM" | "HIGH";
  hasAiAddOn: boolean;
  lowAiAdoption: boolean;
  aiUsage30d: {
    jobs: number;
    totalTokens: number;
    estimatedCostUsd: number;
    lastUsedAt: string | null;
  };
  appointments30d: number;
  lastAppointmentAt: string | null;
  notificationsFailed7d: number;
  lastActivityAt: string | null;
  lowRecentActivity: boolean;
  upgradeCandidate: boolean;
  aiFailures7d: number;
  aiAdoptionPct30d: number;
};

type DashboardPayload = {
  totals: {
    clients: number;
    activeClients: number;
    estimatedMrr: number;
    paymentRiskCount: number;
    withAi: number;
    withoutAi: number;
    estimatedAiCost30d: number;
    lowActivityCount: number;
  };
  topAiClients: ClientSummary[];
  underusedAiClients: ClientSummary[];
  upgradeCandidates: ClientSummary[];
  churnRiskClients: ClientSummary[];
};

type ListResponse = {
  clients: ClientSummary[];
  pagination?: { page: number; pageSize: number; total: number; totalPages: number };
  dashboard: DashboardPayload;
};
type TwoFactorOverview = {
  totals: {
    totalAdmins: number;
    enabledAdmins: number;
    missingSetupAdmins: number;
    withoutRecoveryCodes: number;
    failed2faAttempts30d: number;
    recoveryCodeUsage30d: number;
    enabledChanges30d: number;
    disabledChanges30d: number;
  };
};

type OpsOverview = {
  health: "HEALTHY" | "DEGRADED" | "CRITICAL";
  counters: {
    paymentWebhookFailed1h: number;
    paymentWebhookEvents1h: number;
    notificationsFailed1h: number;
    aiJobsFailed1h: number;
    estimatedAiCostUsd30d: number;
    aiUsageEvents30d: number;
  };
};

type DetailResponse = {
  client: {
    id: string;
    name: string;
    email: string;
    role: string;
    specialty: string | null;
    active: boolean;
    createdAt: string;
    updatedAt: string;
    tenantName: string;
    basePlan: "AGENDA" | "CLINICAL" | "INTEGRAL";
    addOn: "AI_30" | "AI_60" | "AI_100" | null;
    enabledFeatures: string[];
    aiOverrides: Record<"ai.dictation" | "ai.insights" | "ai.questionnaire.text" | "ai.questionnaire.audio", boolean>;
  };
  subscriptionOverview: {
    subscription: {
      status: string;
      planName: string;
      amount: number | null;
      currentPeriodStart: string | null;
      currentPeriodEnd: string | null;
      cancelAtPeriodEnd: boolean;
      paymentMethodLast4: string | null;
    } | null;
    billingStatus: {
      label: string;
      severity: "success" | "warning" | "danger" | "neutral";
      message: string;
    };
    paymentHistory: Array<{
      id: string;
      eventType: string;
      status: string;
      amount: number | null;
      currency: string;
      createdAt: string;
    }>;
  } | null;
  aiUsage: {
    totals: {
      jobs: number;
      estimatedCostUsd30d: number;
      totalTokens30d: number;
      appointments30d: number;
    };
    byModule: Array<{
      module: string;
      jobs: number;
      estimatedCostUsd: number;
      totalTokens: number;
    }>;
  };
  latestAppointments: Array<{
    id: string;
    createdAt: string;
    status: string;
    patientName: string;
  }>;
};

type UpdateResponse = {
  detail: DetailResponse | null;
  diff: {
    planChanged: boolean;
    addOnChanged: boolean;
    enabledFeatures: string[];
    disabledFeatures: string[];
  };
};

const ADMIN_TABS = [
  { key: "clientes", label: "Clientes", icon: Users2 },
  { key: "planes", label: "Planes y add-ons", icon: ArrowRightLeft },
  { key: "salud", label: "Salud comercial", icon: Gauge },
] as const;

const AI_ADD_ON_OPTIONS = [
  { value: "none", label: "Sin add-on IA" },
  { value: "AI_30", label: "AI 30%" },
  { value: "AI_60", label: "AI 60%" },
  { value: "AI_100", label: "AI ilimitado" },
] as const;

const AI_FEATURE_OPTIONS = [
  { key: "ai.dictation", label: "Dictado clínico" },
  { key: "ai.insights", label: "Insights diagnósticos" },
  { key: "ai.questionnaire.text", label: "Cuestionarios por texto" },
  { key: "ai.questionnaire.audio", label: "Cuestionarios por audio" },
] as const;

function formatMoney(amount: number, currency = "MXN") {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount);
}

function formatUsd(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 4,
  }).format(amount);
}

function formatDateTime(value: string | null) {
  if (!value) return "Sin actividad";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin actividad";
  return date.toLocaleString("es-MX");
}

function statusTone(status: ClientSummary["subscriptionStatus"]) {
  if (status === "ACTIVE") return "success";
  if (status === "PAST_DUE") return "warning";
  if (status === "CANCELED") return "destructive";
  if (status === "NO_SUBSCRIPTION") return "secondary";
  return "outline";
}

export function AdminClientsConsole() {
  const [payload, setPayload] = useState<ListResponse | null>(null);
  const [security, setSecurity] = useState<TwoFactorOverview | null>(null);
  const [ops, setOps] = useState<OpsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<(typeof ADMIN_TABS)[number]["key"]>("clientes");
  const [planFilter, setPlanFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [aiFilter, setAiFilter] = useState("ALL");
  const [activeFilter, setActiveFilter] = useState("ALL");
  const [riskFilter, setRiskFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [diff, setDiff] = useState<UpdateResponse["diff"] | null>(null);
  const [draft, setDraft] = useState<{
    active: boolean;
    basePlan: "AGENDA" | "CLINICAL" | "INTEGRAL";
    addOn: "AI_30" | "AI_60" | "AI_100" | null;
    aiOverrides: DetailResponse["client"]["aiOverrides"];
  } | null>(null);

  async function loadClients() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        search,
        plan: planFilter,
        status: statusFilter,
        ai: aiFilter,
        active: activeFilter,
        risk: riskFilter,
        page: String(page),
        pageSize: String(pageSize),
      });
      const response = await fetch(`/api/internal-admin/clients?${params.toString()}`, { cache: "no-store" });
      const data = await response.json() as ListResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || "No se pudo cargar el panel interno");
      setPayload(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }
  async function loadSecurityOverview() {
    try {
      const response = await fetch("/api/internal-admin/security/2fa/overview", { cache: "no-store" });
      const data = await response.json() as TwoFactorOverview & { error?: string };
      if (!response.ok) throw new Error(data.error || "No se pudo cargar overview de 2FA");
      setSecurity(data);
    } catch {
      setSecurity(null);
    }
  }


  async function loadOpsOverview() {
    try {
      const response = await fetch("/api/internal-admin/ops/overview", { cache: "no-store" });
      const data = await response.json() as OpsOverview & { error?: string };
      if (!response.ok) throw new Error(data.error || "No se pudo cargar overview operativo");
      setOps(data);
    } catch {
      setOps(null);
    }
  }

  async function loadDetail(id: string) {
    setSelectedId(id);
    setDetailLoading(true);
    setMessage(null);
    setDiff(null);
    try {
      const response = await fetch(`/api/internal-admin/clients/${id}`, { cache: "no-store" });
      const data = await response.json() as DetailResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || "No se pudo cargar el detalle");
      setDetail(data);
      setDraft({
        active: data.client.active,
        basePlan: data.client.basePlan,
        addOn: data.client.addOn,
        aiOverrides: data.client.aiOverrides,
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    void loadSecurityOverview();
    void loadOpsOverview();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadClients();
    }, 250);
    return () => clearTimeout(timer);
  }, [search, planFilter, statusFilter, aiFilter, activeFilter, riskFilter, page, pageSize]);

  const filteredClients = payload?.clients ?? [];

  const canSave = useMemo(() => {
    if (!detail || !draft) return false;
    if (draft.basePlan === "AGENDA" && draft.addOn) return false;
    return true;
  }, [detail, draft]);

  async function saveDetail() {
    if (!selectedId || !draft) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/internal-admin/clients/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await response.json() as UpdateResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || "No se pudo guardar");
      setDiff(data.diff);
      if (data.detail) {
        setDetail(data.detail);
        setDraft({
          active: data.detail.client.active,
          basePlan: data.detail.client.basePlan,
          addOn: data.detail.client.addOn,
          aiOverrides: data.detail.client.aiOverrides,
        });
      }
      setMessage("Cambios guardados");
      await loadClients();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,rgba(37,99,235,0.05),transparent_24%),var(--background)]">
      <main className="mx-auto flex max-w-[1500px] flex-col gap-6 px-4 py-6 lg:px-8">
        <header className="rounded-2xl border border-border/70 bg-card/95 p-5 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Panel interno</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
                Clientes, planes y salud comercial
              </h1>
              <p className="mt-2 max-w-[70ch] text-sm leading-6 text-muted-foreground">
                Opera el catálogo real de MiDoc, controla acceso por cliente y detecta riesgo comercial o baja adopción de IA sin mezclar este flujo con el panel médico.
              </p>
            </div>
            <div className="w-full max-w-md">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => { setPage(1); setSearch(event.target.value); }}
                  placeholder="Buscar por cliente, email o tenant"
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {ADMIN_TABS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm font-medium transition ${
                  tab === item.key
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-foreground hover:border-primary/35"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            ))}
          </div>
        </header>

        {message && (
          <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground">
            {message}
          </div>
        )}

        {loading || !payload ? (
          <div className="grid gap-4 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-28 animate-pulse rounded-2xl bg-secondary" />
            ))}
          </div>
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard icon={Users2} label="Clientes activos" value={payload.dashboard.totals.activeClients.toString()} helper={`${payload.dashboard.totals.clients} totales`} />
              <StatCard icon={CreditCard} label="MRR estimado" value={formatMoney(payload.dashboard.totals.estimatedMrr)} helper="Monto actual agregado" />
              <StatCard icon={Sparkles} label="Clientes con IA" value={payload.dashboard.totals.withAi.toString()} helper={`${payload.dashboard.totals.withoutAi} sin IA`} />
              <StatCard icon={ShieldAlert} label="Riesgo comercial" value={payload.dashboard.totals.paymentRiskCount.toString()} helper={`${payload.dashboard.totals.lowActivityCount} con baja actividad`} />
            </section>
            {security && (
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard icon={ShieldAlert} label="Admins con 2FA" value={`${security.totals.enabledAdmins}/${security.totals.totalAdmins}`} helper={`${security.totals.missingSetupAdmins} sin setup`} />
                <StatCard icon={AlertTriangle} label="Sin recovery codes" value={security.totals.withoutRecoveryCodes.toString()} helper="Cuentas administrativas expuestas" />
                <StatCard icon={ShieldAlert} label="Fallos 2FA 30d" value={security.totals.failed2faAttempts30d.toString()} helper={`${security.totals.recoveryCodeUsage30d} usos de recovery`} />
                <StatCard icon={CheckCircle2} label="Cambios 2FA 30d" value={(security.totals.enabledChanges30d + security.totals.disabledChanges30d).toString()} helper={`+${security.totals.enabledChanges30d} / -${security.totals.disabledChanges30d}`} />

                <div className="flex items-center justify-between border-t border-border px-5 py-3">
                  <p className="text-xs text-muted-foreground">
                    Página {payload?.pagination?.page ?? 1} de {payload?.pagination?.totalPages ?? 1}
                  </p>
                  <div className="flex items-center gap-2">
                    <Select value={String(pageSize)} onValueChange={(v) => { setPage(1); setPageSize(Number(v)); }}>
                      <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={(payload?.pagination?.page ?? 1) <= 1}>Anterior</Button>
                    <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={(payload?.pagination?.page ?? 1) >= (payload?.pagination?.totalPages ?? 1)}>Siguiente</Button>
                  </div>
                </div>
              </section>
            )}
            {ops && (
              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatCard icon={ShieldAlert} label="Salud operativa" value={ops.health} helper="Resumen de alertas mínimas" />
                <StatCard icon={AlertTriangle} label="Webhook pagos (1h)" value={ops.counters.paymentWebhookFailed1h.toString()} helper={`${ops.counters.paymentWebhookEvents1h} eventos totales`} />
                <StatCard icon={AlertTriangle} label="Notifs fallidas (1h)" value={ops.counters.notificationsFailed1h.toString()} helper="Umbral crítico >= 5" />
                <StatCard icon={BrainCircuit} label="Fallos IA jobs (1h)" value={ops.counters.aiJobsFailed1h.toString()} helper={`Costo IA 30d ${formatUsd(ops.counters.estimatedAiCostUsd30d)}`} />

                <div className="flex items-center justify-between border-t border-border px-5 py-3">
                  <p className="text-xs text-muted-foreground">
                    Página {payload?.pagination?.page ?? 1} de {payload?.pagination?.totalPages ?? 1}
                  </p>
                  <div className="flex items-center gap-2">
                    <Select value={String(pageSize)} onValueChange={(v) => { setPage(1); setPageSize(Number(v)); }}>
                      <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={(payload?.pagination?.page ?? 1) <= 1}>Anterior</Button>
                    <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={(payload?.pagination?.page ?? 1) >= (payload?.pagination?.totalPages ?? 1)}>Siguiente</Button>
                  </div>
                </div>
              </section>
            )}

            {tab !== "salud" && (
              <section className="rounded-2xl border border-border bg-card p-4">
                <div className="grid gap-3 md:grid-cols-5">
                  <Select value={planFilter} onValueChange={(v) => { setPage(1); setPlanFilter(v); }}>
                    <SelectTrigger><SelectValue placeholder="Plan" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Todos los planes</SelectItem>
                      <SelectItem value="AGENDA">Agenda</SelectItem>
                      <SelectItem value="CLINICAL">Clínico</SelectItem>
                      <SelectItem value="INTEGRAL">Integral</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={(v) => { setPage(1); setStatusFilter(v); }}>
                    <SelectTrigger><SelectValue placeholder="Estado" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Todos los estados</SelectItem>
                      <SelectItem value="ACTIVE">Activa</SelectItem>
                      <SelectItem value="PAST_DUE">Pago pendiente</SelectItem>
                      <SelectItem value="PENDING">Pendiente</SelectItem>
                      <SelectItem value="CANCELED">Cancelada</SelectItem>
                      <SelectItem value="NO_SUBSCRIPTION">Sin suscripción</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={aiFilter} onValueChange={(v) => { setPage(1); setAiFilter(v); }}>
                    <SelectTrigger><SelectValue placeholder="IA" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Con y sin IA</SelectItem>
                      <SelectItem value="WITH_AI">Con IA</SelectItem>
                      <SelectItem value="WITHOUT_AI">Sin IA</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={activeFilter} onValueChange={(v) => { setPage(1); setActiveFilter(v); }}>
                    <SelectTrigger><SelectValue placeholder="Cuenta" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Activos e inactivos</SelectItem>
                      <SelectItem value="ACTIVE">Activos</SelectItem>
                      <SelectItem value="INACTIVE">Inactivos</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={riskFilter} onValueChange={(v) => { setPage(1); setRiskFilter(v); }}>
                    <SelectTrigger><SelectValue placeholder="Riesgo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Todos los riesgos</SelectItem>
                      <SelectItem value="HIGH">Alto</SelectItem>
                      <SelectItem value="MEDIUM">Medio</SelectItem>
                      <SelectItem value="LOW">Bajo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between border-t border-border px-5 py-3">
                  <p className="text-xs text-muted-foreground">
                    Página {payload?.pagination?.page ?? 1} de {payload?.pagination?.totalPages ?? 1}
                  </p>
                  <div className="flex items-center gap-2">
                    <Select value={String(pageSize)} onValueChange={(v) => { setPage(1); setPageSize(Number(v)); }}>
                      <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={(payload?.pagination?.page ?? 1) <= 1}>Anterior</Button>
                    <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={(payload?.pagination?.page ?? 1) >= (payload?.pagination?.totalPages ?? 1)}>Siguiente</Button>
                  </div>
                </div>
              </section>
            )}

            {tab === "salud" ? (
              <HealthDashboard dashboard={payload.dashboard} onOpenClient={(id) => void loadDetail(id)} />
            ) : (
              <section className="rounded-2xl border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border px-5 py-4">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">
                      {tab === "clientes" ? "Clientes administrables" : "Distribución comercial"}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {payload?.pagination ? `${payload.pagination.total} resultados` : `${filteredClients.length} resultados`}
                    </p>
                  </div>
                  <Badge variant="secondary">ADMIN only</Badge>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Tenant</TableHead>
                      <TableHead>Plan</TableHead>
                      <TableHead>IA</TableHead>
                      <TableHead>Riesgo</TableHead>
                      <TableHead>Actividad</TableHead>
                      <TableHead className="text-right">Acción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredClients.map((client) => (
                      <TableRow key={client.id}>
                        <TableCell className="align-top">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-foreground">{client.name}</span>
                              {!client.active && <Badge variant="outline">Inactivo</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground">{client.email}</p>
                            <div className="flex items-center gap-2">
                              <Badge variant={statusTone(client.subscriptionStatus) as "secondary"}>
                                {client.subscriptionStatus}
                              </Badge>
                              {client.cancelAtPeriodEnd && <Badge variant="outline">No renovará</Badge>}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="flex items-start gap-2">
                            <Building2 className="mt-0.5 h-4 w-4 text-muted-foreground" />
                            <div>
                              <p className="text-sm font-medium text-foreground">{client.tenantName}</p>
                              <p className="text-xs text-muted-foreground">{client.role}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-foreground">{client.basePlan}</p>
                            <p className="text-xs text-muted-foreground">{formatMoney(client.amount, client.currency)}</p>
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-foreground">{client.addOn ?? "Sin add-on"}</p>
                            <p className="text-xs text-muted-foreground">
                              {client.aiUsage30d.jobs} jobs · {formatUsd(client.aiUsage30d.estimatedCostUsd)}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="space-y-1">
                            <RiskPill risk={client.paymentRisk} />
                            {client.lowAiAdoption && <p className="text-xs text-warning">IA contratada con baja adopción</p>}
                            {client.upgradeCandidate && <p className="text-xs text-primary">Candidato a upgrade</p>}
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          <p className="text-sm text-foreground">{client.aiAdoptionPct30d}%</p>
                          <p className="text-xs text-muted-foreground">{client.aiFailures7d} fallos IA · 7d</p>
                        </TableCell>
                        <TableCell className="align-top">
                          <p className="text-sm text-foreground">{client.appointments30d} citas · 30d</p>
                          <p className="text-xs text-muted-foreground">
                            {client.notificationsFailed7d > 0
                              ? `${client.notificationsFailed7d} notif. fallidas · 7d`
                              : "Sin notif. fallidas · 7d"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {client.lastAppointmentAt
                              ? `Última cita: ${formatDateTime(client.lastAppointmentAt)}`
                              : "Sin citas recientes"}
                          </p>
                        </TableCell>
                        <TableCell className="text-right align-top">
                          <Button variant="outline" size="sm" onClick={() => void loadDetail(client.id)}>
                            Abrir
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <div className="flex items-center justify-between border-t border-border px-5 py-3">
                  <p className="text-xs text-muted-foreground">
                    Página {payload?.pagination?.page ?? 1} de {payload?.pagination?.totalPages ?? 1}
                  </p>
                  <div className="flex items-center gap-2">
                    <Select value={String(pageSize)} onValueChange={(v) => { setPage(1); setPageSize(Number(v)); }}>
                      <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={(payload?.pagination?.page ?? 1) <= 1}>Anterior</Button>
                    <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={(payload?.pagination?.page ?? 1) >= (payload?.pagination?.totalPages ?? 1)}>Siguiente</Button>
                  </div>
                </div>
              </section>
            )}
          </>
        )}
      </main>

      <Sheet open={Boolean(selectedId)} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent side="right" className="w-full gap-0 sm:max-w-2xl">
          <SheetHeader className="border-b border-border">
            <SheetTitle>Control comercial del cliente</SheetTitle>
            <SheetDescription>
              Ajusta plan, add-on IA y capacidades derivadas sin salir del panel interno.
            </SheetDescription>
          </SheetHeader>

          {detailLoading || !detail || !draft ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-5">
              <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                <section className="space-y-4">
                  <div className="rounded-2xl border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-lg font-semibold text-foreground">{detail.client.name}</p>
                        <p className="text-sm text-muted-foreground">{detail.client.email}</p>
                        <p className="mt-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                          {detail.client.tenantName}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <RiskPill risk={payload?.clients.find((client) => client.id === detail.client.id)?.paymentRisk ?? "LOW"} />
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-xs text-muted-foreground">Cuenta activa</span>
                          <Switch
                            checked={draft.active}
                            onCheckedChange={(checked) => setDraft((current) => current ? { ...current, active: checked } : current)}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <MiniMetric label="Periodo actual" value={detail.subscriptionOverview?.subscription?.currentPeriodEnd ? formatDateTime(detail.subscriptionOverview.subscription.currentPeriodEnd) : "Sin corte"} />
                      <MiniMetric label="Pago" value={detail.subscriptionOverview?.billingStatus.label ?? "Sin estado"} />
                      <MiniMetric label="Uso IA 30d" value={`${detail.aiUsage.totals.jobs} jobs`} />
                      <MiniMetric label="Costo IA 30d" value={formatUsd(detail.aiUsage.totals.estimatedCostUsd30d)} />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-primary" />
                      <h3 className="text-sm font-semibold text-foreground">Plan base y add-on</h3>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <Select
                        value={draft.basePlan}
                        onValueChange={(value: "AGENDA" | "CLINICAL" | "INTEGRAL") =>
                          setDraft((current) =>
                            current
                              ? {
                                ...current,
                                basePlan: value,
                                addOn: value === "AGENDA" ? null : current.addOn,
                              }
                              : current,
                          )
                        }
                      >
                        <SelectTrigger><SelectValue placeholder="Plan base" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="AGENDA">AGENDA</SelectItem>
                          <SelectItem value="CLINICAL">CLINICAL</SelectItem>
                          <SelectItem value="INTEGRAL">INTEGRAL</SelectItem>
                        </SelectContent>
                      </Select>

                      <Select
                        value={draft.addOn ?? "none"}
                        onValueChange={(value) =>
                          setDraft((current) =>
                            current
                              ? {
                                ...current,
                                addOn: value === "none" ? null : (value as "AI_30" | "AI_60" | "AI_100"),
                              }
                              : current,
                          )
                        }
                        disabled={draft.basePlan === "AGENDA"}
                      >
                        <SelectTrigger><SelectValue placeholder="Add-on IA" /></SelectTrigger>
                        <SelectContent>
                          {AI_ADD_ON_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {draft.basePlan === "AGENDA" && (
                      <p className="mt-3 text-xs text-warning">
                        La IA clínica no puede quedar activa sobre el plan Agenda.
                      </p>
                    )}
                  </div>

                  <div className="rounded-2xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2">
                      <BrainCircuit className="h-4 w-4 text-primary" />
                      <h3 className="text-sm font-semibold text-foreground">Capacidades IA derivadas</h3>
                    </div>
                    <div className="mt-4 space-y-3">
                      {AI_FEATURE_OPTIONS.map((feature) => (
                        <div key={feature.key} className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2.5">
                          <div>
                            <p className="text-sm font-medium text-foreground">{feature.label}</p>
                            <p className="text-xs text-muted-foreground">{feature.key}</p>
                          </div>
                          <Switch
                            checked={draft.aiOverrides[feature.key]}
                            disabled={!draft.addOn}
                            onCheckedChange={(checked) =>
                              setDraft((current) =>
                                current
                                  ? {
                                    ...current,
                                    aiOverrides: {
                                      ...current.aiOverrides,
                                      [feature.key]: checked,
                                    },
                                  }
                                  : current,
                              )
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      <h3 className="text-sm font-semibold text-foreground">Features activas</h3>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {detail.client.enabledFeatures.map((feature) => (
                        <Badge key={feature} variant="outline">{feature}</Badge>
                      ))}
                    </div>
                  </div>
                </section>

                <section className="space-y-4">
                  <div className="rounded-2xl border border-border bg-card p-4">
                    <h3 className="text-sm font-semibold text-foreground">Impacto del cambio</h3>
                    {diff ? (
                      <div className="mt-4 space-y-3">
                        <DiffLine label="Plan" ok={diff.planChanged} />
                        <DiffLine label="Add-on" ok={diff.addOnChanged} />
                        <div>
                          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Features habilitadas</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {diff.enabledFeatures.length === 0 ? <Badge variant="secondary">Sin cambios</Badge> : diff.enabledFeatures.map((feature) => <Badge key={feature}>{feature}</Badge>)}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Features deshabilitadas</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {diff.disabledFeatures.length === 0 ? <Badge variant="secondary">Sin cambios</Badge> : diff.disabledFeatures.map((feature) => <Badge key={feature} variant="outline">{feature}</Badge>)}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-3 text-sm text-muted-foreground">
                        Guarda para ver el diff persistido entre el estado anterior y el nuevo.
                      </p>
                    )}
                  </div>

                  <div className="rounded-2xl border border-border bg-card p-4">
                    <h3 className="text-sm font-semibold text-foreground">Historial de cobro</h3>
                    <div className="mt-3 space-y-2">
                      {(detail.subscriptionOverview?.paymentHistory ?? []).slice(0, 5).map((event) => (
                        <div key={event.id} className="rounded-xl border border-border bg-background px-3 py-2">
                          <p className="text-sm font-medium text-foreground">{event.eventType}</p>
                          <p className="text-xs text-muted-foreground">
                            {event.status} · {event.amount ? formatMoney(event.amount / 100, event.currency) : "Sin monto"} · {formatDateTime(event.createdAt)}
                          </p>
                        </div>
                      ))}
                      {(detail.subscriptionOverview?.paymentHistory ?? []).length === 0 && (
                        <p className="text-sm text-muted-foreground">Sin eventos recientes.</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border bg-card p-4">
                    <h3 className="text-sm font-semibold text-foreground">Top módulos IA del cliente</h3>
                    <div className="mt-3 space-y-2">
                      {detail.aiUsage.byModule.slice(0, 4).map((module) => (
                        <div key={module.module} className="rounded-xl border border-border bg-background px-3 py-2">
                          <p className="text-sm font-medium text-foreground">{module.module}</p>
                          <p className="text-xs text-muted-foreground">
                            {module.jobs} jobs · {module.totalTokens} tokens · {formatUsd(module.estimatedCostUsd)}
                          </p>
                        </div>
                      ))}
                      {detail.aiUsage.byModule.length === 0 && (
                        <p className="text-sm text-muted-foreground">Sin uso IA en los últimos 30 días.</p>
                      )}
                    </div>
                  </div>
                </section>
              </div>
            </div>
          )}

          <SheetFooter className="border-t border-border">
            <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                {canSave ? "El cambio reescribe planName y features usando el catálogo comercial real." : "Corrige el estado comercial antes de guardar."}
              </p>
              <Button onClick={() => void saveDetail()} disabled={!canSave || saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Guardar cambios
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: typeof Users2;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
        </div>
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function RiskPill({ risk }: { risk: "LOW" | "MEDIUM" | "HIGH" }) {
  const className =
    risk === "HIGH"
      ? "bg-destructive/10 text-destructive border-destructive/30"
      : risk === "MEDIUM"
        ? "bg-warning/10 text-warning border-warning/30"
        : "bg-success/10 text-success border-success/30";

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}>
      {risk === "HIGH" ? "Alto" : risk === "MEDIUM" ? "Medio" : "Bajo"}
    </span>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function DiffLine({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-background px-3 py-2">
      <span className="text-sm text-foreground">{label}</span>
      <Badge variant={ok ? "default" : "secondary"}>{ok ? "Cambiado" : "Sin cambio"}</Badge>
    </div>
  );
}

function HealthDashboard({
  dashboard,
  onOpenClient,
}: {
  dashboard: DashboardPayload;
  onOpenClient: (id: string) => void;
}) {
  return (
    <section className="grid gap-4 xl:grid-cols-2">
      <InsightCard
        title="Top clientes por uso IA"
        subtitle="Costo estimado y volumen de actividad"
        icon={Sparkles}
        items={dashboard.topAiClients}
        onOpenClient={onOpenClient}
        renderMeta={(client) => `${formatUsd(client.aiUsage30d.estimatedCostUsd)} · ${client.aiUsage30d.jobs} jobs`}
      />
      <InsightCard
        title="IA contratada con baja adopción"
        subtitle="Clientes con add-on activo y poco uso reciente"
        icon={AlertTriangle}
        items={dashboard.underusedAiClients}
        onOpenClient={onOpenClient}
        renderMeta={(client) => `${client.addOn ?? "Sin add-on"} · ${client.aiUsage30d.jobs} jobs`}
      />
      <InsightCard
        title="Candidatos a upgrade"
        subtitle="Operan con plan básico y carga suficiente para subir de nivel"
        icon={ChevronRight}
        items={dashboard.upgradeCandidates}
        onOpenClient={onOpenClient}
        renderMeta={(client) => `${client.basePlan} · ${client.appointments30d} citas / 30d`}
      />
      <InsightCard
        title="Riesgo de churn"
        subtitle="Pago pendiente o cancelación programada"
        icon={ShieldAlert}
        items={dashboard.churnRiskClients}
        onOpenClient={onOpenClient}
        renderMeta={(client) => `${client.subscriptionStatus} · riesgo ${client.paymentRisk.toLowerCase()}`}
      />
    </section>
  );
}

function InsightCard({
  title,
  subtitle,
  icon: Icon,
  items,
  onOpenClient,
  renderMeta,
}: {
  title: string;
  subtitle: string;
  icon: typeof Sparkles;
  items: ClientSummary[];
  onOpenClient: (id: string) => void;
  renderMeta: (client: ClientSummary) => string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
            Sin elementos para este bloque.
          </p>
        ) : items.map((client) => (
          <button
            key={client.id}
            type="button"
            onClick={() => onOpenClient(client.id)}
            className="flex w-full items-center justify-between rounded-xl border border-border bg-background px-3 py-2.5 text-left transition hover:border-primary/35"
          >
            <div>
              <p className="text-sm font-medium text-foreground">{client.name}</p>
              <p className="text-xs text-muted-foreground">{renderMeta(client)}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}

