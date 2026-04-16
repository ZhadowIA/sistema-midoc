"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ClipboardList } from "lucide-react";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { useRouter } from "next/navigation";

type SetupStatusResponse = {
  error?: string;
  hasActiveSubscription?: boolean;
  onboardingCompleted?: boolean;
};

export default function DoctorOnboardingPage() {
  const router = useRouter();
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    phone: "",
    specialty: "",
    professionalLicense: "",
    clinicAddress: "",
    baseDuration: 30,
    extendedEnabled: true,
    priceNormal: 500,
    priceExtended: 900,
  });

  useEffect(() => {
    Promise.all([
      fetch("/api/auth/setup-status").then((r) => r.json()),
      fetch("/api/admin/profile").then((r) => r.json()),
      fetch("/api/admin/config").then((r) => r.json()),
    ])
      .then(([setupData, profileData, configData]: [SetupStatusResponse, Record<string, unknown>, Record<string, unknown>]) => {
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

        setForm((prev) => ({
          ...prev,
          name: typeof profileData.name === "string" ? profileData.name : prev.name,
          phone: typeof profileData.phone === "string" ? profileData.phone : prev.phone,
          specialty: typeof profileData.specialty === "string" ? profileData.specialty : prev.specialty,
          professionalLicense: typeof profileData.professionalLicense === "string" ? profileData.professionalLicense : prev.professionalLicense,
          clinicAddress: typeof profileData.clinicAddress === "string" ? profileData.clinicAddress : prev.clinicAddress,
          baseDuration: typeof configData.consultationDurationMin === "number" ? configData.consultationDurationMin : prev.baseDuration,
          extendedEnabled:
            typeof configData.extendedConsultationEnabled === "boolean"
              ? configData.extendedConsultationEnabled
              : prev.extendedEnabled,
          priceNormal:
            typeof configData.normalConsultationPrice === "number"
              ? configData.normalConsultationPrice
              : prev.priceNormal,
          priceExtended:
            typeof configData.extendedConsultationPrice === "number"
              ? configData.extendedConsultationPrice
              : prev.priceExtended,
        }));
      })
      .catch(() => router.push("/medico/login"))
      .finally(() => setLoadingStatus(false));
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        throw new Error(payload.error || "No se pudo guardar el perfil del consultorio");
      }

      const configRes = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseDuration: form.baseDuration,
          extendedEnabled: form.extendedEnabled,
          priceNormal: form.priceNormal,
          priceExtended: form.extendedEnabled ? form.priceExtended : undefined,
        }),
      });
      if (!configRes.ok) {
        const payload = await configRes.json().catch(() => ({}));
        throw new Error(payload.error || "No se pudo guardar la configuración inicial");
      }

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

  if (loadingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Cargando onboarding...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-secondary/30 via-background to-primary/5 flex items-center justify-center px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-3xl bg-card border border-border rounded-2xl shadow-lg p-8"
      >
        <div className="text-center mb-7">
          <div className="inline-flex w-14 h-14 bg-primary/10 rounded-2xl items-center justify-center mb-3">
            <ClipboardList className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Configuración Inicial</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Completa estos datos para dejar listo tu sistema desde el primer día.
          </p>
        </div>

        {error && <div className="mb-4 p-3 bg-red-100/10 border border-red-500 rounded-md text-red-500 text-sm">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Nombre completo"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <Input
              label="Teléfono"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Especialidad"
              value={form.specialty}
              onChange={(e) => setForm({ ...form, specialty: e.target.value })}
              required
            />
            <Input
              label="Cédula profesional"
              value={form.professionalLicense}
              onChange={(e) => setForm({ ...form, professionalLicense: e.target.value })}
              required
            />
          </div>

          <Input
            label="Dirección del consultorio"
            value={form.clinicAddress}
            onChange={(e) => setForm({ ...form, clinicAddress: e.target.value })}
            required
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              label="Duración base (min)"
              type="number"
              min={15}
              max={120}
              value={String(form.baseDuration)}
              onChange={(e) => setForm({ ...form, baseDuration: Number(e.target.value) || 30 })}
              required
            />
            <Input
              label="Precio consulta normal"
              type="number"
              min={0}
              step="0.01"
              value={String(form.priceNormal)}
              onChange={(e) => setForm({ ...form, priceNormal: Number(e.target.value) || 0 })}
              required
            />
            <Input
              label="Precio consulta extendida"
              type="number"
              min={0}
              step="0.01"
              value={String(form.priceExtended)}
              onChange={(e) => setForm({ ...form, priceExtended: Number(e.target.value) || 0 })}
              disabled={!form.extendedEnabled}
              required={form.extendedEnabled}
            />
          </div>

          <div className="flex items-center gap-3 rounded-xl border border-border p-3">
            <input
              id="extendedEnabled"
              type="checkbox"
              checked={form.extendedEnabled}
              onChange={(e) => setForm({ ...form, extendedEnabled: e.target.checked })}
              className="w-4 h-4 accent-primary"
            />
            <label htmlFor="extendedEnabled" className="text-sm text-foreground">
              Habilitar consulta extendida (doble módulo)
            </label>
          </div>

          <Button type="submit" size="lg" fullWidth disabled={saving}>
            {saving ? "Guardando configuración..." : "Finalizar e Ingresar al Sistema"}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}
