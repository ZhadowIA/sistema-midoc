"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Shield } from "lucide-react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { useRouter } from "next/navigation";

export default function DoctorLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      const data = await res.json() as {
        error?: string;
        nextStep?: "SUBSCRIPTION" | "ONBOARDING" | "DASHBOARD";
        user?: { role?: string };
      }
      if (res.ok) {
        if (data?.user?.role !== "DOCTOR" && data?.user?.role !== "ADMIN") {
          setError("Esta cuenta no tiene acceso al panel médico");
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
      } else {
        setError(data.error || "Error de inicio de sesión");
      }
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
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="inline-flex w-16 h-16 bg-primary/10 rounded-2xl items-center justify-center mb-4"
          >
            <Shield className="w-8 h-8 text-primary" />
          </motion.div>
          <h1 className="text-3xl font-semibold text-foreground mb-2">Panel Médico</h1>
          <p className="text-muted-foreground">Ingresa a tu cuenta</p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="bg-card border border-border rounded-2xl shadow-lg p-8"
        >
          {error && <div className="mb-4 p-3 bg-red-100/10 border border-red-500 rounded-md text-red-500 text-sm">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-6">
            <Input
              label="Correo electrónico"
              type="email"
              placeholder="admin@consultorio.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              label="Contraseña"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Button type="submit" size="lg" fullWidth disabled={loading}>
              {loading ? "Ingresando..." : "Iniciar sesión"}
            </Button>
            <Button
              type="button"
              variant="tertiary"
              size="sm"
              fullWidth
              onClick={() => router.push("/medico/registro")}
            >
              Crear cuenta médica
            </Button>
          </form>
        </motion.div>
      </motion.div>
    </div>
  );
}
