"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowLeft, CalendarClock, LogOut } from "lucide-react";
import { Button } from "@/components/Button";

type Appointment = {
  id: string;
  status: string;
  appointmentType: string;
  durationMin: number;
  startTime: string;
  endTime: string;
  doctor: { id: string; name: string; specialty: string | null; slug: string | null; profileImage: string | null };
};

type HistoryResponse = {
  appointments: Appointment[];
  summary: { total: number; completed: number; upcoming: number; cancelled: number };
  error?: string;
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmada",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
  RESCHEDULED: "Reagendada",
};

export default function PatientConsultasPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [referenceNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const res = await fetch("/api/auth/patient/history", { cache: "no-store" });
    const data = (await res.json()) as HistoryResponse;
    if (!res.ok) throw new Error(data.error || "No se pudieron cargar tus consultas.");
    setAppointments(Array.isArray(data.appointments) ? data.appointments : []);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      load()
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : "Error interno";
          setError(message);
        })
        .finally(() => setLoading(false));
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [load]);

  const upcoming = useMemo(() => {
    return appointments
      .filter((apt) => new Date(apt.startTime).getTime() > referenceNow && apt.status !== "CANCELLED")
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [appointments, referenceNow]);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.push("/agendar");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => router.push("/paciente/cuenta")}
            className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver
          </button>
          <h1 className="font-semibold">Mis consultas</h1>
          <Button size="sm" variant="secondary" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Cerrar sesión
          </Button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="rounded-2xl border border-border bg-card p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <p className="text-sm text-muted-foreground">Próximas consultas</p>
            <p className="text-2xl font-semibold">{upcoming.length}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="secondary" onClick={() => router.push("/paciente/pre-checkin")}>
              Pre-check-in
            </Button>
            <Button variant="secondary" onClick={() => router.push("/paciente/historial")}>
              Ver historial completo
            </Button>
            <Button variant="tertiary" onClick={() => router.push("/agendar")}>
              Agendar nueva cita
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="text-center text-muted-foreground py-12">Cargando consultas...</div>
        ) : error ? (
          <div className="rounded-xl border border-red-500 text-red-400 p-4">{error}</div>
        ) : upcoming.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">
            No tienes consultas próximas.
          </div>
        ) : (
          <div className="space-y-4">
            {upcoming.map((apt) => (
              <div key={apt.id} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <p className="text-sm text-muted-foreground">Médico</p>
                    <p className="font-semibold">{apt.doctor.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {apt.doctor.specialty || "Especialidad no definida"}
                    </p>
                  </div>
                  <span className="text-sm px-2 py-1 rounded-md bg-secondary text-foreground w-fit">
                    {STATUS_LABELS[apt.status] || apt.status}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="w-4 h-4" />
                    {format(new Date(apt.startTime), "EEEE dd MMM yyyy, HH:mm", { locale: es })}
                  </span>
                  <span>{apt.durationMin} min</span>
                  <span>{apt.appointmentType === "EXTENDED" ? "Consulta extendida" : "Consulta normal"}</span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => router.push("/paciente/historial")}
                  >
                    Administrar en historial
                  </Button>
                  <Button
                    size="sm"
                    variant="tertiary"
                    onClick={() =>
                      router.push(`/agendar${apt.doctor.slug ? `?doctor=${apt.doctor.slug}` : ""}`)
                    }
                  >
                    Ver disponibilidad
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

