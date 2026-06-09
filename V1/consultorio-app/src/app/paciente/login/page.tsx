"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Shield, ArrowLeft, LogIn, UserPlus, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import Link from "next/link";

function PatientLoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedReturnTo = searchParams.get("returnTo");
  const returnTo =
    requestedReturnTo && /^\/paciente(\/|$)/.test(requestedReturnTo)
      ? requestedReturnTo
      : "/paciente/historial";
  
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [registerForm, setRegisterForm] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    phone: "",
    dateOfBirth: ""
  });

  const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback;

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/patient/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginForm),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Credenciales inválidas");

      router.push(returnTo);
    } catch (error: unknown) {
      setError(getErrorMessage(error, "Credenciales inválidas"));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    
    if (registerForm.password !== registerForm.confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/patient/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: registerForm.name,
          email: registerForm.email,
          password: registerForm.password,
          phone: registerForm.phone,
          dateOfBirth: registerForm.dateOfBirth,
        }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Error al registrarse");

      setSuccess("¡Cuenta creada con éxito! Ahora puedes iniciar sesión.");
      setAuthMode("login");
      setLoginForm({ email: registerForm.email, password: registerForm.password });
    } catch (error: unknown) {
      setError(getErrorMessage(error, "Error al registrarse"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row overflow-hidden">
      {/* Visual Side */}
      <div className="hidden md:flex md:w-1/2 bg-primary relative items-center justify-center p-12 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary via-primary to-secondary/40" />
        <div className="absolute top-0 left-0 w-full h-full opacity-10">
            <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d="M0 100 C 20 0 50 0 100 100 Z" fill="white" />
            </svg>
        </div>
        
        <div className="relative z-10 text-white max-w-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-16 h-16 bg-white/10 backdrop-blur-md rounded-lg flex items-center justify-center mb-8 border border-white/20"
          >
            <Shield className="w-8 h-8 text-white" />
          </motion.div>
          <h1 className="text-4xl font-bold mb-6 leading-tight">Tu salud, siempre al alcance de tu mano.</h1>
          <p className="text-lg text-white/80 leading-relaxed mb-8">
            Accede a tu historial clínico, gestiona tus citas y mantén el control de tu bienestar desde un solo lugar.
          </p>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center"><CheckCircle2 className="w-4 h-4" /></div>
                <span className="text-sm">Historial de consultas y recetas</span>
            </div>
            <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center"><CheckCircle2 className="w-4 h-4" /></div>
                <span className="text-sm">Recordatorios automáticos</span>
            </div>
            <div className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center"><CheckCircle2 className="w-4 h-4" /></div>
                <span className="text-sm">Comunicación directa con tu médico</span>
            </div>
          </div>
        </div>
      </div>

      {/* Form Side */}
      <div className="flex-1 flex flex-col p-6 md:p-12 lg:p-20 items-center justify-center relative">
        <div className="absolute top-8 left-8">
            <Link href="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors group">
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                <span className="text-sm font-medium">Volver al inicio</span>
            </Link>
        </div>

        <div className="w-full max-w-md">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-foreground mb-2">
                {authMode === "login" ? "¡Bienvenido de nuevo!" : "Crea tu cuenta"}
            </h2>
            <p className="text-muted-foreground">
                {authMode === "login" 
                    ? "Ingresa tus credenciales para acceder a tu panel de paciente." 
                    : "Únete a MiDoc y comienza a gestionar tu salud de forma inteligente."}
            </p>
          </div>

          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 rounded-md bg-destructive/10 border border-destructive/20 flex items-center gap-3 text-destructive text-sm"
            >
              <AlertCircle className="w-5 h-5 shrink-0" />
              {error}
            </motion.div>
          )}

          {success && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 rounded-md bg-success/10 border border-success/20 flex items-center gap-3 text-success text-sm"
            >
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              {success}
            </motion.div>
          )}

          <div className="bg-card border border-border rounded-3xl p-8 shadow-sm">
            <AnimatePresence mode="wait">
              {authMode === "login" ? (
                <motion.form
                  key="login"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  onSubmit={handleLogin}
                  className="space-y-4"
                >
                  <Input
                    label="Correo electrónico"
                    type="email"
                    placeholder="ejemplo@correo.com"
                    value={loginForm.email}
                    onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                    required
                  />
                  <Input
                    label="Contraseña"
                    type="password"
                    placeholder="••••••••"
                    value={loginForm.password}
                    onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                    required
                  />
                  <div className="pt-2">
                    <Button fullWidth size="lg" type="submit" loading={loading}>
                      <LogIn className="w-4 h-4 mr-2" />
                      Iniciar Sesión
                    </Button>
                  </div>
                  <p className="text-center text-sm text-muted-foreground pt-4">
                    ¿No tienes cuenta?{" "}
                    <button
                      type="button"
                      onClick={() => { setAuthMode("register"); setError(""); setSuccess(""); }}
                      className="text-primary font-semibold hover:underline"
                    >
                      Regístrate ahora
                    </button>
                  </p>
                </motion.form>
              ) : (
                <motion.form
                  key="register"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  onSubmit={handleRegister}
                  className="space-y-4"
                >
                  <Input
                    label="Nombre completo"
                    placeholder="Tu nombre y apellidos"
                    value={registerForm.name}
                    onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })}
                    required
                  />
                  <Input
                    label="Correo electrónico"
                    type="email"
                    placeholder="tu@email.com"
                    value={registerForm.email}
                    onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                    required
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Teléfono"
                      placeholder="10 dígitos"
                      value={registerForm.phone}
                      onChange={(e) => setRegisterForm({ ...registerForm, phone: e.target.value })}
                      required
                    />
                    <div className="relative">
                      <Input
                        label="Fecha de nacimiento"
                        type="date"
                        value={registerForm.dateOfBirth}
                        onChange={(e) => setRegisterForm({ ...registerForm, dateOfBirth: e.target.value })}
                        required
                      />
                      {registerForm.dateOfBirth && (
                        <span className="absolute right-3 top-9 text-[10px] font-medium text-primary/70 bg-primary/5 px-1.5 py-0.5 rounded-md border border-primary/10">
                          {calculateAge(registerForm.dateOfBirth)} años
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Contraseña"
                      type="password"
                      placeholder="••••••••"
                      value={registerForm.password}
                      onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                      required
                    />
                    <Input
                      label="Confirmar"
                      type="password"
                      placeholder="••••••••"
                      value={registerForm.confirmPassword}
                      onChange={(e) => setRegisterForm({ ...registerForm, confirmPassword: e.target.value })}
                      required
                    />
                  </div>
                  <div className="pt-2">
                    <Button fullWidth size="lg" type="submit" loading={loading} variant="primary">
                      <UserPlus className="w-4 h-4 mr-2" />
                      Crear Cuenta
                    </Button>
                  </div>
                  <p className="text-center text-sm text-muted-foreground pt-4">
                    ¿Ya tienes cuenta?{" "}
                    <button
                      type="button"
                      onClick={() => { setAuthMode("login"); setError(""); setSuccess(""); }}
                      className="text-primary font-semibold hover:underline"
                    >
                      Inicia sesión
                    </button>
                  </p>
                </motion.form>
              )}
            </AnimatePresence>
          </div>
        </div>
        
        <footer className="mt-12 text-center text-xs text-muted-foreground">
            © 2026 MiDoc. Todos los derechos reservados.
        </footer>
      </div>
    </div>
  );
}

function calculateAge(dateOfBirth: string): number {
  if (!dateOfBirth) return 0;
  const birth = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export default function PatientLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <PatientLoginContent />
    </Suspense>
  );
}
