"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { ShieldPlus } from "lucide-react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function DoctorRegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    password: "",
    acceptTerms: false,
    acceptPrivacy: false,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await response.json() as { error?: string; nextStep?: "SUBSCRIPTION" | "ONBOARDING" | "DASHBOARD" };

      if (!response.ok) {
        setError(data.error || "No se pudo crear la cuenta");
        return;
      }

      if (data.nextStep === "SUBSCRIPTION") {
        router.push("/medico/suscripcion");
        return;
      }
      if (data.nextStep === "ONBOARDING") {
        router.push("/medico/onboarding");
        return;
      }

      router.push("/medico/dashboard");
    } catch {
      setError("Error interno");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-secondary/30 via-background to-primary/5 flex items-center justify-center px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-xl"
      >
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="inline-flex w-16 h-16 bg-primary/10 rounded-2xl items-center justify-center mb-4"
          >
            <ShieldPlus className="w-8 h-8 text-primary" />
          </motion.div>
          <h1 className="text-3xl font-semibold text-foreground mb-2">Crear Cuenta Médica</h1>
          <p className="text-muted-foreground">Regístrate para comenzar tu suscripción mensual</p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="bg-card border border-border rounded-2xl shadow-lg p-8"
        >
          {error && <div className="mb-4 p-3 bg-red-100/10 border border-red-500 rounded-md text-red-500 text-sm">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Nombre"
                placeholder="Juan"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                required
              />
              <Input
                label="Apellidos"
                placeholder="Pérez López"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                required
              />
            </div>

            <Input
              label="Correo electrónico"
              type="email"
              placeholder="doctor@consultorio.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />

            <Input
              label="Teléfono"
              type="tel"
              placeholder="6141234567"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              required
            />

            <Input
              label="Contraseña"
              type="password"
              placeholder="Mínimo 8 caracteres"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              minLength={8}
            />

            <div className="space-y-2 rounded-xl border border-border p-4">
              <label className="flex items-center gap-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={form.acceptTerms}
                  onChange={(e) => setForm({ ...form, acceptTerms: e.target.checked })}
                  className="w-4 h-4 accent-primary"
                />
                <span>
                  Acepto los{" "}
                  <Link href="/terminos" target="_blank" className="text-primary hover:underline">
                    Términos y Condiciones
                  </Link>
                </span>
              </label>
              <label className="flex items-center gap-3 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={form.acceptPrivacy}
                  onChange={(e) => setForm({ ...form, acceptPrivacy: e.target.checked })}
                  className="w-4 h-4 accent-primary"
                />
                <span>
                  Acepto el{" "}
                  <Link href="/privacidad" target="_blank" className="text-primary hover:underline">
                    Aviso de Privacidad
                  </Link>
                </span>
              </label>
            </div>

            <Button type="submit" size="lg" fullWidth disabled={loading}>
              {loading ? "Creando cuenta..." : "Continuar a Suscripción"}
            </Button>
            <Button type="button" variant="tertiary" size="sm" fullWidth onClick={() => router.push("/medico/login")}>
              Ya tengo cuenta
            </Button>
          </form>
        </motion.div>
      </motion.div>
    </div>
  );
}
