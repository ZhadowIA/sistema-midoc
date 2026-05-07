"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { Search, UserCircle2, CalendarDays, LogIn } from "lucide-react";

type PublicDoctor = {
  id: string;
  name: string;
  slug?: string | null;
  specialty?: string | null;
  profileImage?: string | null;
  bio?: string | null;
};

export default function PacienteHubPage() {
  const [doctors, setDoctors] = useState<PublicDoctor[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/agenda/public/doctors", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => setDoctors(Array.isArray(data) ? data : []))
      .catch(() => setDoctors([]));
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return doctors;
    return doctors.filter((d) => `${d.name} ${d.specialty ?? ""}`.toLowerCase().includes(term));
  }, [doctors, q]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-10 space-y-8">
        <section className="rounded-2xl border border-border bg-card p-6 md:p-8">
          <h1 className="text-2xl md:text-3xl font-bold">Portal de pacientes</h1>
          <p className="text-muted-foreground mt-2">
            Inicia sesión para ver tu panel o agenda una cita desde el directorio médico.
          </p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link href="/paciente/login?returnTo=/paciente/historial">
              <Button className="w-full" size="lg"><LogIn className="w-4 h-4 mr-2" />Iniciar sesión</Button>
            </Link>
            <Link href="/agendar">
              <Button variant="secondary" className="w-full" size="lg"><CalendarDays className="w-4 h-4 mr-2" />Agendar directo</Button>
            </Link>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 md:p-8 space-y-4">
          <div className="flex items-center gap-2">
            <UserCircle2 className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-semibold">Directorio de médicos</h2>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nombre o especialidad"
              className="pl-10"
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {filtered.map((doctor) => (
              doctor.slug ? (
                <Link
                  key={doctor.id}
                  href={`/doctor/${doctor.slug}`}
                  className="rounded-xl border border-border p-4 hover:border-primary/40 hover:bg-secondary/20 transition-colors"
                >
                  <div className="font-semibold">{doctor.name}</div>
                  <div className="text-sm text-muted-foreground">{doctor.specialty ?? "Especialidad no especificada"}</div>
                </Link>
              ) : (
                <article
                  key={doctor.id}
                  className="rounded-xl border border-border p-4 bg-secondary/10"
                >
                  <div className="font-semibold">{doctor.name}</div>
                  <div className="text-sm text-muted-foreground">{doctor.specialty ?? "Especialidad no especificada"}</div>
                  <p className="mt-2 text-xs text-warning">Perfil público incompleto (sin URL personalizada).</p>
                </article>
              )
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
