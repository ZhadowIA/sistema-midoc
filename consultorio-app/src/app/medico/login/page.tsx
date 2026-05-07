"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Shield } from "lucide-react";
import { Input } from "@/components/Input";
import { useRouter } from "next/navigation";

export default function DoctorLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [twoFactorRequired, setTwoFactorRequired] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const redirectTo = (target: string) => {
    router.replace(target);
    router.refresh();
    if (typeof window !== "undefined") {
      window.setTimeout(() => {
        if (window.location.pathname === "/medico/login") {
          window.location.assign(target);
        }
      }, 450);
    }
  };

  const submitLogin = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({ email, password })
      })
      const data = await res.json() as {
        error?: string;
        nextStep?: "SUBSCRIPTION" | "ONBOARDING" | "DASHBOARD";
        requiresTwoFactor?: boolean;
        challengeToken?: string;
        user?: { role?: string; twoFactorSetupRequired?: boolean };
      }
      if (res.ok) {
        if (data.requiresTwoFactor && data.challengeToken) {
          setTwoFactorRequired(true);
          setChallengeToken(data.challengeToken);
          setError("");
          return;
        }

        if (data?.user?.role !== "DOCTOR" && data?.user?.role !== "ADMIN" && data?.user?.role !== "CLINIC_ADMIN") {
          setError("Esta cuenta no tiene acceso al panel médico");
          return;
        }
        if (data.user?.twoFactorSetupRequired) {
          redirectTo("/medico/seguridad");
          return;
        }
        if (data.nextStep === "SUBSCRIPTION") {
          redirectTo("/medico/suscripcion");
          return;
        }
        if (data.nextStep === "ONBOARDING") {
          redirectTo("/medico/onboarding");
          return;
        }
        redirectTo("/medico/dashboard");
      } else {
        setError(data.error || "Error de inicio de sesión");
      }
    } catch {
      setError("Error interno");
    } finally {
      setLoading(false);
    }
  };

  const submitTwoFactor = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({ challengeToken, code: twoFactorCode }),
      });
      const data = await res.json() as {
        error?: string;
        nextStep?: "SUBSCRIPTION" | "ONBOARDING" | "DASHBOARD";
      };
      if (!res.ok) {
        setError(data.error || "No se pudo validar el segundo factor");
        return;
      }

      if (data.nextStep === "SUBSCRIPTION") {
        redirectTo("/medico/suscripcion");
        return;
      }
      if (data.nextStep === "ONBOARDING") {
        redirectTo("/medico/onboarding");
        return;
      }
      redirectTo("/medico/dashboard");
    } catch {
      setError("Error interno");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await submitLogin();
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
            className="inline-flex w-16 h-16 bg-primary/10 rounded-lg items-center justify-center mb-4"
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
          className="bg-card border border-border rounded-lg shadow-lg p-8"
        >
          {error && <div className="mb-4 p-3 bg-red-100/10 border border-red-500 rounded-md text-red-500 text-sm">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-6">
            {!twoFactorRequired ? (
              <>
                <Input
                  label="Correo electrónico"
                  type="email"
                  autoComplete="email"
                  placeholder="admin@consultorio.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <Input
                  label="Contraseña"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    if (!loading) void submitLogin();
                  }}
                  className="w-full min-h-[56px] px-8 py-4 text-lg inline-flex items-center justify-center gap-2 rounded-md transition-all duration-200 font-medium touch-manipulation bg-primary text-primary-foreground hover:bg-primary-hover shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {loading ? "Ingresando..." : "Iniciar sesión"}
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/medico/registro")}
                  className="w-full min-h-[44px] px-4 py-2 text-sm inline-flex items-center justify-center gap-2 rounded-md transition-all duration-200 font-medium touch-manipulation text-foreground hover:bg-secondary border border-transparent hover:border-border"
                >
                  Crear cuenta médica
                </button>
              </>
            ) : (
              <>
                <div className="rounded-lg border border-border bg-secondary/30 p-4 text-sm text-muted-foreground">
                  Tu cuenta requiere un segundo factor. Abre tu app autenticadora y escribe el código actual.
                </div>
                <Input
                  label="Código de autenticación"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value)}
                  required
                />
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    if (!loading) void submitTwoFactor();
                  }}
                  className="w-full min-h-[56px] px-8 py-4 text-lg inline-flex items-center justify-center gap-2 rounded-md transition-all duration-200 font-medium touch-manipulation bg-primary text-primary-foreground hover:bg-primary-hover shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {loading ? "Validando..." : "Validar segundo factor"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTwoFactorRequired(false);
                    setChallengeToken("");
                    setTwoFactorCode("");
                    setError("");
                  }}
                  className="w-full min-h-[44px] px-4 py-2 text-sm inline-flex items-center justify-center gap-2 rounded-md transition-all duration-200 font-medium touch-manipulation text-foreground hover:bg-secondary border border-transparent hover:border-border"
                >
                  Volver
                </button>
              </>
            )}
          </form>
        </motion.div>
      </motion.div>
    </div>
  );
}
