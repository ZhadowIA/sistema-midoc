"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { CreditCard, CheckCircle2, CalendarClock, ShieldCheck } from "lucide-react";
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
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  paymentMethodLast4?: string | null;
};

type SubscriptionResponse = {
  subscription: SubscriptionRecord | null;
  scope?: {
    mode: "DOCTOR" | "CLINIC";
    clinicId: string | null;
    billingDoctorId: string;
  };
  seats?: {
    included: number;
    used: number;
    available: number;
    overLimit: boolean;
  } | null;
};

export default function DoctorSubscriptionPage() {
  const router = useRouter();
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [subscription, setSubscription] = useState<SubscriptionRecord | null>(null);
  const [setup, setSetup] = useState<SetupStatusResponse>({});
  const [error, setError] = useState("");
  const [subscriptionScope, setSubscriptionScope] = useState<SubscriptionResponse["scope"] | null>(null);
  const [seats, setSeats] = useState<SubscriptionResponse["seats"]>(null);

  const loadSubscriptionContext = useCallback(async () => {
    const [setupResponse, subscriptionResponse] = await Promise.all([
      fetch("/api/auth/setup-status").then((res) => res.json() as Promise<SetupStatusResponse>),
      fetch("/api/admin/subscription").then((res) => res.json() as Promise<SubscriptionResponse>),
    ]);

    if (setupResponse.error) {
      router.push("/medico/login");
      return;
    }

    setSetup(setupResponse);
    setSubscription(subscriptionResponse.subscription || null);
    setSubscriptionScope(subscriptionResponse.scope || null);
    setSeats(subscriptionResponse.seats || null);
  }, [router]);

  useEffect(() => {
    loadSubscriptionContext()
      .catch(() => router.push("/medico/login"))
      .finally(() => setLoadingStatus(false));
  }, [loadSubscriptionContext, router]);

  const handleSubscribe = async () => {
    setProcessing(true);
    setError("");
    try {
      const checkoutResponse = await fetch("/api/payments/checkout", { method: "POST" });
      const checkoutData = await checkoutResponse.json() as { error?: string };
      if (!checkoutResponse.ok) {
        setError(checkoutData.error || "No se pudo iniciar el checkout");
        return;
      }

      const response = await fetch("/api/auth/subscribe", { method: "POST" });
      const data = await response.json() as { error?: string; nextStep?: "SUBSCRIPTION" | "ONBOARDING" | "DASHBOARD" };
      if (!response.ok) {
        setError(data.error || "No se pudo procesar la suscripción");
        return;
      }

      if (data.nextStep === "ONBOARDING") {
        router.push("/medico/onboarding");
        return;
      }
      await loadSubscriptionContext();
    } catch {
      setError("Error interno");
    } finally {
      setProcessing(false);
    }
  };

  const handleCancelAtPeriodEnd = async (cancelAtPeriodEnd: boolean) => {
    setProcessing(true);
    setError("");
    try {
      const response = await fetch("/api/admin/subscription", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancelAtPeriodEnd }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) {
        setError(data.error || "No se pudo actualizar la suscripción");
        return;
      }
      await loadSubscriptionContext();
    } catch {
      setError("Error interno");
    } finally {
      setProcessing(false);
    }
  };

  if (loadingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Cargando suscripción...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-secondary/30 via-background to-primary/5 flex items-center justify-center px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-xl bg-card border border-border rounded-2xl shadow-lg p-8"
      >
        <div className="text-center mb-6">
          <div className="inline-flex w-14 h-14 bg-primary/10 rounded-2xl items-center justify-center mb-3">
            <CreditCard className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">
            {setup.hasActiveSubscription ? "Mi Suscripción" : "Activa tu Suscripción"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {setup.hasActiveSubscription
              ? "Gestiona tu plan mensual y estado de renovación."
              : "Para continuar, activa tu plan mensual y habilita tu panel médico."}
          </p>
        </div>

        {setup.hasActiveSubscription && subscription ? (
          <div className="rounded-2xl border border-border bg-secondary/20 p-5 space-y-3">
            <p className="text-lg font-semibold text-foreground">{subscription.planName || "Plan Mensual MiDoc"}</p>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-success/10 text-success">
                <ShieldCheck className="w-3.5 h-3.5 mr-1" />
                {subscription.status}
              </span>
              <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-primary/10 text-primary">
                Proveedor: {subscription.provider}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Próxima renovación:{" "}
              <span className="font-medium text-foreground">
                {subscription.currentPeriodEnd
                  ? format(new Date(subscription.currentPeriodEnd), "dd MMM yyyy", { locale: es })
                  : "No definida"}
              </span>
            </p>
            <p className="text-sm text-muted-foreground">
              Método: {subscription.paymentMethodLast4 ? `**** ${subscription.paymentMethodLast4}` : "No disponible"}
            </p>
            {subscriptionScope?.mode === "CLINIC" && seats && (
              <div className="rounded-lg border border-border p-3 bg-background/70">
                <p className="text-sm text-foreground font-medium">Seats de clínica</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Usados: {seats.used} / Incluidos: {seats.included} · Disponibles: {seats.available}
                </p>
                {seats.overLimit && (
                  <p className="text-xs text-destructive mt-1">
                    La clínica está por encima de seats incluidos.
                  </p>
                )}
              </div>
            )}
            {subscription.cancelAtPeriodEnd && (
              <div className="rounded-lg bg-warning/10 border border-warning/30 text-warning text-sm p-3">
                Tu suscripción está programada para cancelarse al final del periodo actual.
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-secondary/20 p-5 space-y-3">
            <p className="text-lg font-semibold text-foreground">Plan Mensual MiDoc</p>
            <p className="text-3xl font-bold text-foreground">$899 <span className="text-base font-medium text-muted-foreground">MXN / mes</span></p>
            <ul className="space-y-2 text-sm text-foreground">
              <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-success" /> Agenda médica y gestión de pacientes</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-success" /> Cuestionarios pre-consulta y notas SOAP</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-success" /> Recordatorios y flujo administrativo</li>
            </ul>
          </div>
        )}

        {error && <div className="mt-4 p-3 bg-red-100/10 border border-red-500 rounded-md text-red-500 text-sm">{error}</div>}

        <div className="mt-6 space-y-2">
          {!setup.hasActiveSubscription ? (
            <Button fullWidth size="lg" onClick={handleSubscribe} disabled={processing}>
              {processing ? "Procesando compra..." : "Comprar Suscripción en Línea"}
            </Button>
          ) : (
            <>
              <Button
                fullWidth
                size="lg"
                variant={subscription?.cancelAtPeriodEnd ? "secondary" : "destructive"}
                onClick={() => handleCancelAtPeriodEnd(!subscription?.cancelAtPeriodEnd)}
                disabled={processing}
              >
                {processing
                  ? "Actualizando..."
                  : subscription?.cancelAtPeriodEnd
                    ? "Reactivar renovación automática"
                    : "Cancelar al final del periodo"}
              </Button>
              {!setup.onboardingCompleted && (
                <Button fullWidth variant="secondary" onClick={() => router.push("/medico/onboarding")}>
                  <CalendarClock className="w-4 h-4 mr-2" />
                  Continuar onboarding
                </Button>
              )}
              {setup.onboardingCompleted && (
                <Button fullWidth variant="secondary" onClick={() => router.push("/medico/dashboard")}>
                  Ir al dashboard
                </Button>
              )}
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
