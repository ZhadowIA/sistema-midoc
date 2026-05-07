"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { DoctorProfileHeader } from "@/components/public/DoctorProfileHeader";
import { DoctorInfo } from "@/components/public/DoctorInfo";
import { BookingCalendar } from "@/components/public/BookingCalendar";
import { BookingForm } from "@/components/public/BookingForm";
import { toast } from "sonner";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type DoctorData = {
  id: string;
  name: string;
  specialty: string;
  bio: string;
  profileImage: string | null;
  phone: string | null;
  professionalLicense: string | null;
  consultationDurationMin: number;
  normalConsultationPrice: number | null;
  extendedConsultationPrice: number | null;
  services: Array<{
    id: string;
    name: string;
    description: string | null;
    price: number;
  }>;
};

type SelectedSlot = {
  date: string;
  startTime: string;
  endTime: string;
  serviceId?: string;
} | null;

export default function DoctorPublicProfile() {
  const params = useParams();
  const slug = params.slug as string;

  const [doctor, setDoctor] = useState<DoctorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const loadDoctor = async () => {
      try {
        const response = await fetch(`/api/public/doctor/${slug}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error("Doctor no encontrado");
        }
        const data = await response.json();
        setDoctor(data);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error al cargar el perfil";
        setError(message);
        toast.error(message);
      } finally {
        setLoading(false);
      }
    };

    loadDoctor();
  }, [slug]);

  const handleSubmitBooking = async (formData: {
    name: string;
    email: string;
    phone: string;
    reason?: string;
    serviceId?: string;
  }) => {
    if (!selectedSlot || !doctor) {
      toast.error("Por favor selecciona un horario");
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`/api/public/doctor/${slug}/booking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          ...selectedSlot,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Error al agendar");
      }

      await response.json();
      toast.success("¡Cita agendada! Revisa tu WhatsApp para confirmar");
      setSelectedSlot(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al agendar";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground animate-pulse">Cargando perfil del doctor...</p>
      </div>
    );
  }

  if (error || !doctor) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">Doctor no encontrado</h1>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-7xl px-4 pb-24 pt-4 sm:px-6 sm:py-6">
        <header className="mb-4 flex items-center justify-between gap-3">
          <Link
            href="/paciente"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Directorio
          </Link>
          <Link
            href="/paciente/login?returnTo=/paciente/historial"
            className="inline-flex min-h-11 items-center rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            Panel paciente
          </Link>
        </header>

        <div className="space-y-4 sm:space-y-6">
          <DoctorProfileHeader doctor={doctor} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:items-start">
            <aside className="space-y-4 lg:sticky lg:top-6">
              <DoctorInfo doctor={doctor} />
            </aside>

            <main className="space-y-4">
              <BookingCalendar
                doctorId={doctor.id}
                durationMin={doctor.consultationDurationMin}
                selectedSlot={selectedSlot}
                onSelectSlot={setSelectedSlot}
              />
              <BookingForm
                isOpen={selectedSlot !== null}
                selectedSlot={selectedSlot}
                services={doctor.services}
                onSubmit={handleSubmitBooking}
                isSubmitting={submitting}
              />
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
