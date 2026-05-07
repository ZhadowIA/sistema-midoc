"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  FileText,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/Button";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";

type SetupStatusResponse = {
  error?: string;
  hasActiveSubscription?: boolean;
  onboardingCompleted?: boolean;
  nextStep?: "SUBSCRIPTION" | "ONBOARDING" | "DASHBOARD";
};

type SubscriptionRecord = {
  status: string;
  provider: string;
  planName: string;
  amount: string | number | null;
  currency: string;
  currentPeriodEnd: string | null;
  lastPaymentAt: string | null;
  cancelAtPeriodEnd: boolean;
  paymentMethodLast4?: string | null;
};

type CommercialPlanRecord = {
  basePlan: "AGENDA" | "CLINICAL" | "INTEGRAL";
  addOns: string[];
  displayName: string;
  monthlyPriceMx: number | null;
};

type BillingStatus = {
  label: string;
  severity: "success" | "warning" | "danger" | "neutral";
  message: string;
  gracePeriodEndsAt: string | null;
  commercialState:
    | "ACTIVE"
    | "ACTIVE_CANCEL_SCHEDULED"
    | "PAST_DUE_GRACE"
    | "PAST_DUE_SUSPENDED"
    | "PENDING"
    | "CANCELED"
    | "NO_SUBSCRIPTION";
  appAccess: boolean;
  aiAccess: boolean;
  actionLabel: string | null;
  actionHint: string | null;
};

type CatalogItem = {
  code: string;
  displayName: string;
  monthlyPriceMx: number | null;
  description: string;
};

type SubscriptionResponse = {
  subscription: SubscriptionRecord | null;
  commercialPlan?: CommercialPlanRecord | null;
  billingStatus?: BillingStatus;
  catalog?: {
    basePlans: CatalogItem[];
    addOns: CatalogItem[];
  };
};

type CheckoutResponse = {
  error?: string;
  provider?: string;
  checkoutUrl?: string;
};

type BillingInvoice = {
  id: string;
  number?: string | null;
  status?: string | null;
  amountPaid?: number;
  amountDue?: number;
  currency?: string;
  hostedInvoiceUrl?: string | null;
  invoicePdf?: string | null;
  created?: number;
};

const severityStyles: Record<BillingStatus["severity"], string> = {
  success: "border-success/25 bg-success/10 text-success",
  warning: "border-warning/35 bg-warning/10 text-warning",
  danger: "border-destructive/35 bg-destructive/10 text-destructive",
  neutral: "border-border bg-secondary/40 text-muted-foreground",
};

function formatMoney(amount: string | number | null | undefined, currency = "MXN") {
  if (amount === null || amount === undefined || amount === "") return "No definido";
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return "No definido";
  return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(numeric);
}

function formatMinorMoney(amount: number | undefined, currency = "mxn") {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "No definido";
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

function formatDate(value: string | number | null | undefined) {
  if (!value) return "No definido";
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return "No definido";
  return format(date, "dd MMM yyyy", { locale: es });
}

function isActiveSubscription(subscription: SubscriptionRecord | null) {
  if (!subscription) return false;
  return subscription.status !== "PENDING" && subscription.status !== "CANCELED";
}

export default function DoctorSubscriptionPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [processingAction, setProcessingAction] = useState<string | null>(null);
  const [setup, setSetup] = useState<SetupStatusResponse>({});
  const [subscription, setSubscription] = useState<SubscriptionRecord | null>(null);
  const [commercialPlan, setCommercialPlan] = useState<CommercialPlanRecord | null>(null);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [catalog, setCatalog] = useState<SubscriptionResponse["catalog"] | null>(null);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [error, setError] = useState("");
  const [selectedBasePlan, setSelectedBasePlan] = useState("INTEGRAL");
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([]);

  const loadSubscriptionContext = useCallback(async () => {
    const [setupResponse, subscriptionResponse, invoicesResponse] = await Promise.all([
      fetch("/api/auth/setup-status", { cache: "no-store" }).then((res) => res.json() as Promise<SetupStatusResponse>),
      fetch("/api/admin/subscription", { cache: "no-store" }).then((res) => res.json() as Promise<SubscriptionResponse>),
      fetch("/api/admin/billing/invoices", { cache: "no-store" }).then((res) => res.json() as Promise<{ invoices?: BillingInvoice[] }>).catch(() => ({ invoices: [] })),
    ]);

    if (setupResponse.error) {
      router.push("/medico/login");
      return;
    }

    setSetup(setupResponse);
    setSubscription(subscriptionResponse.subscription || null);
    setCommercialPlan(subscriptionResponse.commercialPlan || null);
    setBillingStatus(subscriptionResponse.billingStatus || null);
    setCatalog(subscriptionResponse.catalog || null);
    setInvoices(invoicesResponse.invoices || []);

    if (subscriptionResponse.commercialPlan) {
      setSelectedBasePlan(subscriptionResponse.commercialPlan.basePlan);
      setSelectedAddOns(subscriptionResponse.commercialPlan.addOns);
    }
  }, [router]);

  useEffect(() => {
    loadSubscriptionContext()
      .catch(() => router.push("/medico/login"))
      .finally(() => setLoading(false));
  }, [loadSubscriptionContext, router]);

  const selectedTotal = useMemo(() => {
    const base = catalog?.basePlans.find((plan) => plan.code === selectedBasePlan)?.monthlyPriceMx ?? 0;
    const addOns = selectedAddOns.reduce((sum, code) => {
      return sum + (catalog?.addOns.find((item) => item.code === code)?.monthlyPriceMx ?? 0);
    }, 0);
    return base + addOns;
  }, [catalog, selectedAddOns, selectedBasePlan]);

  const active = isActiveSubscription(subscription);

  const runAction = async (action: string, task: () => Promise<void>) => {
    setProcessingAction(action);
    setError("");
    try {
      await task();
    } catch (actionError) {
      const message = actionError instanceof Error ? actionError.message : "No se pudo completar la acción";
      setError(message);
    } finally {
      setProcessingAction(null);
    }
  };

  const handleCheckout = () => runAction("checkout", async () => {
    const response = await fetch("/api/payments/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ basePlan: selectedBasePlan, addOns: selectedAddOns }),
    });
    const data = await response.json() as CheckoutResponse;
    if (!response.ok) throw new Error(data.error || "No se pudo iniciar el checkout");

    if (data.provider === "STRIPE" && data.checkoutUrl) {
      window.location.assign(data.checkoutUrl);
      return;
    }

    const subscribeResponse = await fetch("/api/auth/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ basePlan: selectedBasePlan, addOns: selectedAddOns }),
    });
    const subscribeData = await subscribeResponse.json() as { error?: string; nextStep?: string };
    if (!subscribeResponse.ok) throw new Error(subscribeData.error || "No se pudo activar la suscripción");

    if (subscribeData.nextStep === "ONBOARDING") {
      router.push("/medico/onboarding");
      return;
    }
    await loadSubscriptionContext();
  });

  const handlePortal = () => runAction("portal", async () => {
    const response = await fetch("/api/admin/billing/portal", { method: "POST" });
    const data = await response.json() as { error?: string; url?: string };
    if (!response.ok) throw new Error(data.error || "No se pudo abrir el portal de facturación");
    if (data.url) window.location.assign(data.url);
  });

  const handleCancel = () => runAction("cancel", async () => {
    const response = await fetch("/api/admin/subscription/cancel", { method: "POST" });
    const data = await response.json() as { error?: string };
    if (!response.ok) throw new Error(data.error || "No se pudo programar la cancelación");
    await loadSubscriptionContext();
  });

  const handleReactivate = () => runAction("reactivate", async () => {
    const response = await fetch("/api/admin/subscription/reactivate", { method: "POST" });
    const data = await response.json() as { error?: string };
    if (!response.ok) throw new Error(data.error || "No se pudo reactivar la renovación");
    await loadSubscriptionContext();
  });

  const toggleAddOn = (code: string) => {
    setSelectedAddOns((prev) =>
      prev.includes(code) ? prev.filter((item) => item !== code) : [...prev, code],
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background px-6 py-10">
        <div className="mx-auto max-w-6xl space-y-4">
          <div className="h-9 w-64 animate-pulse rounded-md bg-secondary" />
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <div className="h-96 animate-pulse rounded-xl bg-secondary" />
            <div className="h-96 animate-pulse rounded-xl bg-secondary" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
      <main className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Facturación</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">Suscripción y cobro</h1>
            <p className="mt-2 max-w-[68ch] text-sm leading-6 text-muted-foreground">
              Controla el plan, los add-ons de IA, la renovación y los documentos de cobro desde un solo lugar.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {active && (
              <Button variant="secondary" onClick={handlePortal} loading={processingAction === "portal"}>
                <CreditCard className="h-4 w-4" />
                Gestionar método de pago
              </Button>
            )}
            {!setup.onboardingCompleted && active && (
              <Button variant="primary" onClick={() => router.push("/medico/onboarding")}>
                <CalendarClock className="h-4 w-4" />
                Continuar onboarding
              </Button>
            )}
          </div>
        </header>

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <div className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>{error}</p>
            </div>
          </div>
        )}

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Estado comercial</p>
                  <h2 className="mt-2 text-2xl font-bold text-foreground">
                    {commercialPlan?.displayName || subscription?.planName || "Sin plan activo"}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {subscription?.provider ? `Proveedor: ${subscription.provider}` : "Selecciona un plan para activar la cuenta."}
                  </p>
                </div>
                {billingStatus && (
                  <span className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${severityStyles[billingStatus.severity]}`}>
                    {billingStatus.severity === "success" ? <ShieldCheck className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                    {billingStatus.label}
                  </span>
                )}
              </div>

              {billingStatus && (
                <p className="mt-4 max-w-[75ch] rounded-lg bg-secondary/40 p-3 text-sm leading-6 text-muted-foreground">
                  {billingStatus.message}
                  {billingStatus.actionHint && (
                    <span className="mt-2 block text-foreground">{billingStatus.actionHint}</span>
                  )}
                </p>
              )}

              {billingStatus && (
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <ImpactChip
                    label="Acceso a la app"
                    enabled={billingStatus.appAccess}
                    enabledText="Disponible"
                    disabledText="Suspendido"
                  />
                  <ImpactChip
                    label="Funciones de IA"
                    enabled={billingStatus.aiAccess}
                    enabledText="Disponibles"
                    disabledText="Bloqueadas"
                  />
                  <div className="rounded-lg border border-border bg-background p-3">
                    <p className="text-xs font-medium text-muted-foreground">Siguiente acción</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">
                      {billingStatus.actionLabel || "Sin acción requerida"}
                    </p>
                  </div>
                </div>
              )}

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric label="Renovación" value={formatDate(subscription?.currentPeriodEnd)} />
                <Metric label="Último pago" value={formatDate(subscription?.lastPaymentAt)} />
                <Metric label="Método de pago" value={subscription?.paymentMethodLast4 ? `**** ${subscription.paymentMethodLast4}` : "No disponible"} />
                <Metric label="Monto actual" value={formatMoney(subscription?.amount, subscription?.currency)} />
              </div>

              {subscription?.cancelAtPeriodEnd && (
                <div className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
                  La suscripción seguirá activa hasta {formatDate(subscription.currentPeriodEnd)} y no renovará automáticamente.
                </div>
              )}
            </div>

            <PlanSelector
              catalog={catalog}
              selectedBasePlan={selectedBasePlan}
              selectedAddOns={selectedAddOns}
              onSelectBasePlan={setSelectedBasePlan}
              onToggleAddOn={toggleAddOn}
            />

            <InvoicesPanel invoices={invoices} />
          </div>

          <aside className="space-y-5">
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-sm font-semibold text-foreground">Resumen de compra</p>
              <div className="mt-4 space-y-3">
                <SummaryLine label="Plan base" value={catalog?.basePlans.find((plan) => plan.code === selectedBasePlan)?.displayName || selectedBasePlan} />
                <SummaryLine label="Add-ons" value={selectedAddOns.length > 0 ? selectedAddOns.join(", ") : "Sin add-ons"} />
                <div className="border-t border-border pt-3">
                  <SummaryLine label="Total mensual" value={formatMoney(selectedTotal, "MXN")} strong />
                </div>
              </div>
              <Button className="mt-5" fullWidth size="lg" onClick={handleCheckout} loading={processingAction === "checkout"}>
                {active ? "Cambiar plan en checkout" : "Comprar suscripción"}
              </Button>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                El cobro se confirma en Stripe. MiDoc actualiza capacidades desde el webhook de pago.
              </p>
            </div>

            {active && (
              <div className="rounded-xl border border-border bg-card p-5">
                <p className="text-sm font-semibold text-foreground">Renovación</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Programa la cancelación al final del periodo pagado o restaura la renovación automática antes del corte.
                </p>
                {subscription?.cancelAtPeriodEnd ? (
                  <Button className="mt-4" fullWidth variant="secondary" onClick={handleReactivate} loading={processingAction === "reactivate"}>
                    <RotateCcw className="h-4 w-4" />
                    Reactivar renovación
                  </Button>
                ) : (
                  <Button className="mt-4" fullWidth variant="destructive" onClick={handleCancel} loading={processingAction === "cancel"}>
                    Cancelar al final del periodo
                  </Button>
                )}
              </div>
            )}
          </aside>
        </section>
      </main>
    </div>
  );
}

function ImpactChip({
  label,
  enabled,
  enabledText,
  disabledText,
}: {
  label: string;
  enabled: boolean;
  enabledText: string;
  disabledText: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${enabled ? "text-success" : "text-destructive"}`}>
        {enabled ? enabledText : disabledText}
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function SummaryLine({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-right ${strong ? "text-base font-bold text-foreground" : "font-medium text-foreground"}`}>{value}</span>
    </div>
  );
}

function PlanSelector({
  catalog,
  selectedBasePlan,
  selectedAddOns,
  onSelectBasePlan,
  onToggleAddOn,
}: {
  catalog: SubscriptionResponse["catalog"] | null;
  selectedBasePlan: string;
  selectedAddOns: string[];
  onSelectBasePlan: (code: string) => void;
  onToggleAddOn: (code: string) => void;
}) {
  if (!catalog) {
    return (
      <div className="rounded-xl border border-border bg-card p-5">
        <p className="text-sm font-semibold text-foreground">Catálogo no disponible</p>
        <p className="mt-2 text-sm text-muted-foreground">No pudimos cargar planes comerciales. Recarga la página o revisa la configuración.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Plan y add-ons</p>
          <p className="mt-1 text-sm text-muted-foreground">Elige el contrato comercial que Stripe cobrará y MiDoc convertirá en capacidades.</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {catalog.basePlans.map((plan) => (
          <SelectablePlan
            key={plan.code}
            item={plan}
            selected={selectedBasePlan === plan.code}
            icon="base"
            onClick={() => onSelectBasePlan(plan.code)}
          />
        ))}
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Add-ons de IA</p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {catalog.addOns.map((addOn) => (
            <SelectablePlan
              key={addOn.code}
              item={addOn}
              selected={selectedAddOns.includes(addOn.code)}
              icon="ai"
              onClick={() => onToggleAddOn(addOn.code)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SelectablePlan({
  item,
  selected,
  icon,
  onClick,
}: {
  item: CatalogItem;
  selected: boolean;
  icon: "base" | "ai";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[160px] rounded-xl border p-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        selected
          ? "border-primary bg-primary/10 shadow-sm"
          : "border-border bg-background hover:border-primary/40 hover:bg-secondary/30"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${selected ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
          {icon === "ai" ? <Sparkles className="h-4 w-4" /> : <CreditCard className="h-4 w-4" />}
        </span>
        {selected && <CheckCircle2 className="h-5 w-5 text-primary" />}
      </div>
      <p className="mt-3 text-sm font-semibold text-foreground">{item.displayName}</p>
      <p className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">{item.description}</p>
      <p className="mt-3 text-sm font-bold text-foreground">{formatMoney(item.monthlyPriceMx, "MXN")} / mes</p>
    </button>
  );
}

function InvoicesPanel({ invoices }: { invoices: BillingInvoice[] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Facturas y recibos</p>
          <p className="mt-1 text-sm text-muted-foreground">Consulta los cobros sincronizados desde Stripe.</p>
        </div>
        <ReceiptText className="h-5 w-5 text-primary" />
      </div>

      {invoices.length === 0 ? (
        <div className="mt-5 rounded-lg border border-dashed border-border p-6 text-center">
          <FileText className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium text-foreground">Aún no hay facturas</p>
          <p className="mt-1 text-xs text-muted-foreground">Aparecerán aquí cuando Stripe confirme el primer cobro.</p>
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-lg border border-border">
          {invoices.map((invoice) => (
            <div key={invoice.id} className="flex flex-col gap-3 border-b border-border p-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">{invoice.number || invoice.id}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(invoice.created)} · {invoice.status || "Sin estado"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-sm font-semibold text-foreground">{formatMinorMoney(invoice.amountPaid ?? invoice.amountDue, invoice.currency)}</p>
                {(invoice.hostedInvoiceUrl || invoice.invoicePdf) && (
                  <a
                    href={invoice.hostedInvoiceUrl || invoice.invoicePdf || "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-border px-2.5 text-xs font-semibold text-foreground transition hover:bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    Ver
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
