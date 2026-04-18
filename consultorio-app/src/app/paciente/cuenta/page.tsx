"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, LogOut, UserCircle2 } from "lucide-react";
import { Button } from "@/components/Button";

type PatientMeResponse = {
  authenticated: boolean;
  user?: { id: string; name: string | null; email: string; role: string };
  profile?: { id: string; fullName: string; phone: string | null; email: string | null; dateOfBirth: string | null } | null;
  error?: string;
};

export default function PatientAccountPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<PatientMeResponse | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/patient/me", { cache: "no-store" })
      .then((res) => res.json().then((json) => ({ ok: res.ok, json })))
      .then(({ ok, json }) => {
        if (!active) return;
        const payload = json as PatientMeResponse;
        if (!ok) throw new Error(payload.error || "No se pudo cargar tu cuenta.");
        if (!payload.authenticated) {
          router.push("/paciente/login?returnTo=/paciente/cuenta");
          return;
        }
        setData(payload);
      })
      .catch((err: unknown) => {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Error interno";
        setError(message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [router]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.push("/agendar");
  };

  const profile = data?.profile ?? null;
  const user = data?.user;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => router.push("/paciente/historial")}
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver
          </button>
          <h1 className="font-semibold">Mi cuenta</h1>
          <Button size="sm" variant="secondary" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Cerrar sesión
          </Button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {loading ? (
          <div className="text-center text-muted-foreground py-12">Cargando cuenta...</div>
        ) : error ? (
          <div className="rounded-xl border border-red-500 text-red-400 p-4">{error}</div>
        ) : (
          <>
            <div className="rounded-2xl border border-border bg-card p-6 flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center">
                <UserCircle2 className="w-6 h-6 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">Cuenta</p>
                <p className="text-lg font-semibold">{profile?.fullName || user?.name || "Paciente"}</p>
                <div className="mt-2 grid gap-1 text-sm text-muted-foreground">
                  <p>
                    <span className="text-foreground/80">Correo:</span> {profile?.email || user?.email || "—"}
                  </p>
                  <p>
                    <span className="text-foreground/80">Teléfono:</span> {profile?.phone || "—"}
                  </p>
                  <p>
                    <span className="text-foreground/80">Fecha de nacimiento:</span> {profile?.dateOfBirth || "—"}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-6">
              <p className="text-sm text-muted-foreground mb-4">Acciones</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button variant="secondary" onClick={() => router.push("/paciente/consultas")} className="sm:w-auto">
                  Ver mis consultas
                </Button>
                <Button variant="tertiary" onClick={() => router.push("/paciente/historial")} className="sm:w-auto">
                  Ver historial completo
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                Por ahora, la edición de datos se gestiona al agendar o a través del consultorio.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

