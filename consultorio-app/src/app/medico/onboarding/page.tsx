"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CreditCard,
  MapPin,
  ShieldCheck,
  Sparkles,
  Stethoscope,
} from "lucide-react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Select } from "@/components/Select";
import { SPECIALTY_TRANSLATIONS } from "@/lib/specialtyTemplates";

type SetupStatusResponse = {
  error?: string;
  hasActiveSubscription?: boolean;
  onboardingCompleted?: boolean;
};

type OnboardingForm = {
  name: string;
  phone: string;
  specialty: string;
  professionalLicense: string;
  clinicAddress: string;
  baseDuration: number | string;
  extendedEnabled: boolean;
  priceNormal: number | string;
  priceExtended: number | string;
  depositEnabled: boolean;
  depositAmount: number | string;
  depositExpiresInMinutes: number | string;
  cancellationWindowHours: number | string;
  cancellationRefundMode: "FULL" | "PARTIAL" | "CREDIT" | "FORFEIT";
  cancellationPartialRefundPct: number | string;
  reminderLeadHours: string;
};

type DoctorService = {
  id: string;
  name: string;
};

const STEPS = [
  { key: "profile", label: "Perfil", icon: Stethoscope },
  { key: "services", label: "Servicios", icon: ClipboardList },
  { key: "schedule", label: "Agenda", icon: CalendarClock },
  { key: "payments", label: "Pagos", icon: CreditCard },
  { key: "review", label: "Revisión", icon: ShieldCheck },
] as const;

const SPECIALTY_SERVICE_PRESETS: Record<string, Array<{ name: string; price: number; description: string }>> = {
  DENTISTRY: [
    { name: "Consulta dental inicial", price: 500, description: "Valoración, odontograma y plan inicial." },
    { name: "Limpieza dental", price: 800, description: "Profilaxis y orientación de higiene." },
    { name: "Urgencia dental", price: 900, description: "Dolor, fractura, absceso o sangrado." },
  ],
  PEDIATRICS: [
    { name: "Consulta pediátrica", price: 600, description: "Valoración general y seguimiento." },
    { name: "Control niño sano", price: 650, description: "Crecimiento, desarrollo y prevención." },
    { name: "Urgencia pediátrica", price: 850, description: "Atención prioritaria pediátrica." },
  ],
  CARDIOLOGY: [
    { name: "Consulta cardiológica", price: 900, description: "Valoración cardiovascular completa." },
    { name: "Seguimiento cardiológico", price: 750, description: "Control de tratamiento y evolución." },
    { name: "Evaluación preoperatoria", price: 950, description: "Riesgo cardiovascular quirúrgico." },
  ],
  GYNECOLOGY_OBSTETRICS: [
    { name: "Consulta ginecológica", price: 800, description: "Valoración ginecológica integral." },
    { name: "Control prenatal", price: 850, description: "Seguimiento de embarazo." },
    { name: "Ultrasonido de seguimiento", price: 950, description: "Estudio y revisión obstétrica." },
  ],
  DERMATOLOGY: [
    { name: "Consulta dermatológica", price: 800, description: "Valoración clínica de piel, pelo y uñas." },
    { name: "Procedimiento dermatológico", price: 1200, description: "Biopsia, retiro o tratamiento local." },
    { name: "Seguimiento dermatológico", price: 650, description: "Control terapéutico." },
  ],
  OPHTHALMOLOGY: [
    { name: "Consulta oftalmológica", price: 850, description: "Valoración visual y ocular." },
    { name: "Revisión de presión ocular", price: 450, description: "Seguimiento breve de PIO." },
    { name: "Estudio de refracción", price: 650, description: "Medición y ajuste óptico." },
  ],
  MENTAL_HEALTH: [
    { name: "Consulta de salud mental", price: 800, description: "Valoración clínica inicial." },
    { name: "Seguimiento terapéutico", price: 700, description: "Control y ajuste de plan." },
    { name: "Valoración de riesgo", price: 900, description: "Evaluación prioritaria." },
  ],
  FAMILY_MEDICINE: [
    { name: "Consulta médica general", price: 500, description: "Atención médica integral." },
    { name: "Consulta de seguimiento", price: 450, description: "Revisión de evolución y tratamiento." },
    { name: "Control preventivo", price: 550, description: "Tamizaje y medicina preventiva." },
  ],
};

const DEFAULT_FORM: OnboardingForm = {
  name: "",
  phone: "",
  specialty: "",
  professionalLicense: "",
  clinicAddress: "",
  baseDuration: 30,
  extendedEnabled: true,
  priceNormal: 500,
  priceExtended: 900,
  depositEnabled: false,
  depositAmount: 150,
  depositExpiresInMinutes: 30,
  cancellationWindowHours: 24,
  cancellationRefundMode: "FULL",
  cancellationPartialRefundPct: 50,
  reminderLeadHours: "24",
};

function numericInput(value: string) {
  return value.replace(/[^\d.]/g, "").replace(/^0+(?=\d)/, "");
}

export default function DoctorOnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [existingServices, setExistingServices] = useState<DoctorService[]>([]);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [form, setForm] = useState<OnboardingForm>(DEFAULT_FORM);

  const servicePresets = useMemo(() => {
    return SPECIALTY_SERVICE_PRESETS[form.specialty] ?? SPECIALTY_SERVICE_PRESETS.FAMILY_MEDICINE;
  }, [form.specialty]);

  useEffect(() => {
    if (selectedServices.length === 0) {
      setSelectedServices(servicePresets.map((service) => service.name));
    }
  }, [selectedServices.length, servicePresets]);

  useEffect(() => {
    Promise.all([
      fetch("/api/auth/setup-status", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/admin/profile", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/admin/config", { cache: "no-store" }).then((r) => r.json()).catch(() => ({})),
      fetch("/api/admin/services", { cache: "no-store" }).then((r) => r.ok ? r.json() : { services: [] }).catch(() => ({ services: [] })),
    ])
      .then(([setupData, profileData, configData, servicesData]: [SetupStatusResponse, Record<string, unknown>, Record<string, unknown>, { services?: DoctorService[] }]) => {
        if (setupData.error) {
          router.push("/medico/login");
          return;
        }
        if (!setupData.hasActiveSubscription) {
          router.push("/medico/suscripcion");
          return;
        }
        if (setupData.onboardingCompleted) {
          router.push("/medico/dashboard");
          return;
        }

        setExistingServices(Array.isArray(servicesData.services) ? servicesData.services : []);
        setForm((prev) => ({
          ...prev,
          name: typeof profileData.name === "string" ? profileData.name : prev.name,
          phone: typeof profileData.phone === "string" ? profileData.phone : prev.phone,
          specialty: typeof profileData.specialty === "string" ? profileData.specialty : prev.specialty || "FAMILY_MEDICINE",
          professionalLicense: typeof profileData.professionalLicense === "string" ? profileData.professionalLicense : prev.professionalLicense,
          clinicAddress: typeof profileData.clinicAddress === "string" ? profileData.clinicAddress : prev.clinicAddress,
          baseDuration: typeof configData.consultationDurationMin === "number" ? configData.consultationDurationMin : prev.baseDuration,
          extendedEnabled: typeof configData.extendedConsultationEnabled === "boolean" ? configData.extendedConsultationEnabled : prev.extendedEnabled,
          priceNormal: typeof configData.normalConsultationPrice === "number" ? configData.normalConsultationPrice : prev.priceNormal,
          priceExtended: typeof configData.extendedConsultationPrice === "number" ? configData.extendedConsultationPrice : prev.priceExtended,
          depositEnabled: typeof configData.depositEnabled === "boolean" ? configData.depositEnabled : prev.depositEnabled,
          depositAmount: typeof configData.depositAmount === "number" ? configData.depositAmount : prev.depositAmount,
          depositExpiresInMinutes: typeof configData.depositExpiresInMinutes === "number" ? configData.depositExpiresInMinutes : prev.depositExpiresInMinutes,
          cancellationWindowHours: typeof configData.cancellationWindowHours === "number" ? configData.cancellationWindowHours : prev.cancellationWindowHours,
          cancellationRefundMode: typeof configData.cancellationRefundMode === "string" ? configData.cancellationRefundMode as OnboardingForm["cancellationRefundMode"] : prev.cancellationRefundMode,
          cancellationPartialRefundPct: typeof configData.cancellationPartialRefundPct === "number" ? configData.cancellationPartialRefundPct : prev.cancellationPartialRefundPct,
          reminderLeadHours: typeof configData.reminderLeadHours === "string" ? configData.reminderLeadHours : prev.reminderLeadHours,
        }));
      })
      .catch(() => router.push("/medico/login"))
      .finally(() => setLoading(false));
  }, [router]);

  const canContinue = useMemo(() => {
    if (step === 0) {
      return Boolean(form.name.trim() && form.phone.trim() && form.specialty && form.professionalLicense.trim() && form.clinicAddress.trim());
    }
    if (step === 1) return selectedServices.length > 0;
    return true;
  }, [form, selectedServices.length, step]);

  const updateForm = (patch: Partial<OnboardingForm>) => setForm((prev) => ({ ...prev, ...patch }));

  const createSelectedServicesIfNeeded = async () => {
    if (existingServices.length > 0) return;
    const selected = servicePresets.filter((service) => selectedServices.includes(service.name));
    await Promise.all(selected.map((service, index) =>
      fetch("/api/admin/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: service.name,
          description: service.description,
          price: service.price,
          sortOrder: index,
        }),
      }),
    ));
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError("");

    try {
      const profileRes = await fetch("/api/admin/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          phone: form.phone,
          specialty: form.specialty,
          professionalLicense: form.professionalLicense,
          clinicAddress: form.clinicAddress,
        }),
      });
      if (!profileRes.ok) {
        const payload = await profileRes.json().catch(() => ({}));
        throw new Error(payload.error || "No se pudo guardar el perfil profesional");
      }

      const configRes = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseDuration: Number(form.baseDuration) || 30,
          extendedEnabled: form.extendedEnabled,
          priceNormal: Number(form.priceNormal) || 0,
          priceExtended: form.extendedEnabled ? Number(form.priceExtended) || 0 : undefined,
          depositEnabled: form.depositEnabled,
          depositAmount: form.depositEnabled ? Number(form.depositAmount) || 0 : undefined,
          depositExpiresInMinutes: Number(form.depositExpiresInMinutes) || 30,
          cancellationWindowHours: Number(form.cancellationWindowHours) || 24,
          cancellationRefundMode: form.cancellationRefundMode,
          cancellationPartialRefundPct: Number(form.cancellationPartialRefundPct) || 0,
          reminderLeadHours: form.reminderLeadHours,
        }),
      });
      if (!configRes.ok) {
        const payload = await configRes.json().catch(() => ({}));
        throw new Error(payload.error || "No se pudo guardar la operación inicial");
      }

      await createSelectedServicesIfNeeded();

      const completeRes = await fetch("/api/auth/onboarding/complete", { method: "POST" });
      if (!completeRes.ok) {
        const payload = await completeRes.json().catch(() => ({}));
        throw new Error(payload.error || "No se pudo completar el onboarding");
      }

      router.push("/medico/dashboard");
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Error inesperado";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background px-6 py-10">
        <div className="mx-auto max-w-5xl space-y-4">
          <div className="h-8 w-72 animate-pulse rounded-md bg-secondary" />
          <div className="h-[560px] animate-pulse rounded-xl bg-secondary" />
        </div>
      </div>
    );
  }

  const CurrentIcon = STEPS[step].icon;

  return (
    <div className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
      <main className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="rounded-xl border border-border bg-card p-5 lg:sticky lg:top-8 lg:h-fit">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CurrentIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Activación</p>
              <h1 className="text-lg font-bold text-foreground">Configura MiDoc</h1>
            </div>
          </div>

          <nav className="mt-6 space-y-2" aria-label="Pasos de onboarding">
            {STEPS.map((item, index) => {
              const Icon = item.icon;
              const isCurrent = index === step;
              const isDone = index < step;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setStep(index)}
                  className={`flex min-h-[44px] w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    isCurrent
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  <span className={`flex h-7 w-7 items-center justify-center rounded-md ${isDone ? "bg-success/15 text-success" : isCurrent ? "bg-primary-foreground/15" : "bg-secondary"}`}>
                    {isDone ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </span>
                  {item.label}
                </button>
              );
            })}
          </nav>

          <p className="mt-6 rounded-lg bg-secondary/40 p-3 text-xs leading-5 text-muted-foreground">
            Un buen SaaS no empieza en el dashboard. Empieza con datos operativos correctos.
          </p>
        </aside>

        <section className="rounded-xl border border-border bg-card p-5 sm:p-7">
          <header className="border-b border-border pb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Paso {step + 1} de {STEPS.length}</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{stepTitle(step)}</h2>
            <p className="mt-2 max-w-[70ch] text-sm leading-6 text-muted-foreground">{stepDescription(step)}</p>
          </header>

          {error && (
            <div className="mt-5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="mt-6">
            {step === 0 && (
              <div className="grid gap-4 md:grid-cols-2">
                <Input label="Nombre completo" value={form.name} onChange={(e) => updateForm({ name: e.target.value })} required />
                <Input label="Teléfono" value={form.phone} onChange={(e) => updateForm({ phone: e.target.value })} required />
                <Select
                  label="Especialidad"
                  options={Object.entries(SPECIALTY_TRANSLATIONS).map(([value, label]) => ({ value, label }))}
                  value={form.specialty}
                  onValueChange={(value) => {
                    updateForm({ specialty: value });
                    setSelectedServices(SPECIALTY_SERVICE_PRESETS[value]?.map((service) => service.name) ?? []);
                  }}
                  placeholder="Seleccionar especialidad"
                />
                <Input label="Cédula profesional" value={form.professionalLicense} onChange={(e) => updateForm({ professionalLicense: e.target.value })} required />
                <div className="md:col-span-2">
                  <Input label="Dirección del consultorio" value={form.clinicAddress} onChange={(e) => updateForm({ clinicAddress: e.target.value })} required />
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                {existingServices.length > 0 ? (
                  <div className="rounded-lg border border-success/25 bg-success/10 p-4 text-sm text-success">
                    Ya tienes {existingServices.length} servicio{existingServices.length !== 1 ? "s" : ""} configurado{existingServices.length !== 1 ? "s" : ""}. No crearé duplicados.
                  </div>
                ) : (
                  <div className="grid gap-3 md:grid-cols-3">
                    {servicePresets.map((service) => {
                      const selected = selectedServices.includes(service.name);
                      return (
                        <button
                          key={service.name}
                          type="button"
                          onClick={() => setSelectedServices((prev) => selected ? prev.filter((item) => item !== service.name) : [...prev, service.name])}
                          className={`min-h-[170px] rounded-xl border p-4 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                            selected ? "border-primary bg-primary/10" : "border-border bg-background hover:border-primary/40"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <ClipboardList className="h-5 w-5 text-primary" />
                            {selected && <CheckCircle2 className="h-5 w-5 text-primary" />}
                          </div>
                          <p className="mt-3 text-sm font-semibold text-foreground">{service.name}</p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">{service.description}</p>
                          <p className="mt-3 text-sm font-bold text-foreground">${service.price} MXN</p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="grid gap-4 md:grid-cols-3">
                <Input label="Duración base (min)" inputMode="numeric" value={form.baseDuration} onChange={(e) => updateForm({ baseDuration: numericInput(e.target.value) })} />
                <Input label="Precio consulta normal" inputMode="numeric" value={form.priceNormal} onChange={(e) => updateForm({ priceNormal: numericInput(e.target.value) })} />
                <Input label="Precio consulta extendida" inputMode="numeric" value={form.priceExtended} onChange={(e) => updateForm({ priceExtended: numericInput(e.target.value) })} disabled={!form.extendedEnabled} />
                <label className="flex min-h-[48px] items-center gap-3 rounded-lg border border-border bg-background px-3 md:col-span-3">
                  <input type="checkbox" checked={form.extendedEnabled} onChange={(e) => updateForm({ extendedEnabled: e.target.checked })} className="h-4 w-4 accent-primary" />
                  <span className="text-sm font-medium text-foreground">Permitir consulta extendida</span>
                </label>
                <Input label="Recordatorio WhatsApp (horas antes)" inputMode="numeric" value={form.reminderLeadHours} onChange={(e) => updateForm({ reminderLeadHours: numericInput(e.target.value) })} />
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4">
                <label className="flex min-h-[52px] items-center gap-3 rounded-lg border border-border bg-background px-3">
                  <input type="checkbox" checked={form.depositEnabled} onChange={(e) => updateForm({ depositEnabled: e.target.checked })} className="h-4 w-4 accent-primary" />
                  <span>
                    <span className="block text-sm font-semibold text-foreground">Solicitar anticipo para reducir no-show</span>
                    <span className="block text-xs text-muted-foreground">Stripe cobrará el anticipo antes de confirmar la cita.</span>
                  </span>
                </label>
                <div className="grid gap-4 md:grid-cols-3">
                  <Input label="Monto de anticipo" inputMode="numeric" value={form.depositAmount} onChange={(e) => updateForm({ depositAmount: numericInput(e.target.value) })} disabled={!form.depositEnabled} />
                  <Input label="Vence en minutos" inputMode="numeric" value={form.depositExpiresInMinutes} onChange={(e) => updateForm({ depositExpiresInMinutes: numericInput(e.target.value) })} disabled={!form.depositEnabled} />
                  <Input label="Cancelación sin penalización (horas)" inputMode="numeric" value={form.cancellationWindowHours} onChange={(e) => updateForm({ cancellationWindowHours: numericInput(e.target.value) })} />
                  <Select
                    label="Política de reembolso"
                    value={form.cancellationRefundMode}
                    onValueChange={(value) => updateForm({ cancellationRefundMode: value as OnboardingForm["cancellationRefundMode"] })}
                    options={[
                      { value: "FULL", label: "Reembolso completo" },
                      { value: "PARTIAL", label: "Reembolso parcial" },
                      { value: "CREDIT", label: "Crédito para otra cita" },
                      { value: "FORFEIT", label: "Sin reembolso" },
                    ]}
                  />
                  <Input label="Porcentaje parcial" inputMode="numeric" value={form.cancellationPartialRefundPct} onChange={(e) => updateForm({ cancellationPartialRefundPct: numericInput(e.target.value) })} disabled={form.cancellationRefundMode !== "PARTIAL"} />
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="grid gap-4 lg:grid-cols-2">
                <ReviewCard icon={Stethoscope} title="Perfil" lines={[form.name, SPECIALTY_TRANSLATIONS[form.specialty as keyof typeof SPECIALTY_TRANSLATIONS] ?? form.specialty, form.professionalLicense]} />
                <ReviewCard icon={MapPin} title="Consultorio" lines={[form.phone, form.clinicAddress]} />
                <ReviewCard icon={ClipboardList} title="Servicios" lines={existingServices.length > 0 ? existingServices.map((service) => service.name) : selectedServices} />
                <ReviewCard icon={CreditCard} title="Pagos y no-show" lines={[form.depositEnabled ? `Anticipo de $${form.depositAmount} MXN` : "Sin anticipo", `Cancelación: ${form.cancellationWindowHours} horas`, `Reembolso: ${form.cancellationRefundMode}`]} />
                <div className="rounded-xl border border-primary/25 bg-primary/10 p-4 lg:col-span-2">
                  <div className="flex gap-3">
                    <Sparkles className="mt-0.5 h-5 w-5 text-primary" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">Listo para operar</p>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">Al finalizar, MiDoc guardará la configuración y te llevará al dashboard.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <footer className="mt-8 flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="secondary" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0 || saving}>
              <ChevronLeft className="h-4 w-4" />
              Volver
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep((current) => Math.min(STEPS.length - 1, current + 1))} disabled={!canContinue || saving}>
                Continuar
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} loading={saving} disabled={!canContinue}>
                Finalizar configuración
              </Button>
            )}
          </footer>
        </section>
      </main>
    </div>
  );
}

function stepTitle(step: number) {
  return [
    "Perfil profesional",
    "Servicios iniciales",
    "Agenda y precios",
    "Anticipo y no-show",
    "Revisión final",
  ][step];
}

function stepDescription(step: number) {
  return [
    "Estos datos aparecen en tu operación interna y ayudan a preparar plantillas clínicas por especialidad.",
    "Selecciona servicios de arranque. Si ya existen servicios, no se crearán duplicados.",
    "Define duración, precios y recordatorios para que la agenda no nazca con reglas genéricas.",
    "Configura una política clara antes de recibir pacientes. En cobros, la ambigüedad cuesta dinero.",
    "Revisa lo que se guardará. Si algo no cuadra, vuelve y corrígelo antes de activar.",
  ][step];
}

function ReviewCard({ icon: Icon, title, lines }: { icon: typeof Stethoscope; title: string; lines: string[] }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <p className="text-sm font-semibold text-foreground">{title}</p>
      </div>
      <div className="mt-3 space-y-1">
        {lines.filter(Boolean).map((line) => (
          <p key={line} className="text-sm text-muted-foreground">{line}</p>
        ))}
      </div>
    </div>
  );
}
