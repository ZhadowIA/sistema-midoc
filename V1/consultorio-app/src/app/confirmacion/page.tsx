"use client";

import { motion } from "motion/react";
import {
  CheckCircle2,
  Home,
  ClipboardList,
  CalendarPlus,
  Clock,
  MapPin,
  Stethoscope,
  Hash,
} from "lucide-react";
import { Button } from "@/components/Button";
import { FeedbackState } from "@/components/FeedbackState";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

type BookingSnapshot = {
  appointmentId: string;
  startTime: string;
  endTime: string;
  appointmentType: "NORMAL" | "EXTENDED";
  durationMin: number;
  doctor: {
    name: string;
    specialty?: string | null;
    clinicAddress?: string | null;
  };
  patientName?: string;
  questionnaireUrl?: string | null;
};

const STORAGE_KEY = "mi-doc:last-booking";

function formatIcsDate(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return (
    date.getUTCFullYear().toString() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    "T" +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    "Z"
  );
}

function buildIcs(booking: BookingSnapshot): string {
  const start = new Date(booking.startTime);
  const end = new Date(booking.endTime);
  const stamp = formatIcsDate(new Date());
  const summary = `Consulta con ${booking.doctor.name}`;
  const description = [
    booking.doctor.specialty ? `Especialidad: ${booking.doctor.specialty}` : null,
    booking.patientName ? `Paciente: ${booking.patientName}` : null,
    `Duración: ${booking.durationMin} min`,
  ]
    .filter(Boolean)
    .join("\\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MiDoc//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${booking.appointmentId}@midoc`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${formatIcsDate(start)}`,
    `DTEND:${formatIcsDate(end)}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    booking.doctor.clinicAddress ? `LOCATION:${booking.doctor.clinicAddress}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

function downloadIcs(booking: BookingSnapshot) {
  const content = buildIcs(booking);
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `cita-midoc-${booking.appointmentId.slice(0, 8)}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function ConfirmationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const questionnaireUrlFromQuery = searchParams.get("cuestionario");
  const [booking, setBooking] = useState<BookingSnapshot | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as BookingSnapshot;
        setBooking(parsed);
      }
    } catch {
      // noop
    } finally {
      setHydrated(true);
    }
  }, []);

  const questionnaireUrl = useMemo(() => {
    const fromBooking = booking?.questionnaireUrl;
    if (fromBooking) return fromBooking;
    if (questionnaireUrlFromQuery) return decodeURIComponent(questionnaireUrlFromQuery);
    return null;
  }, [booking, questionnaireUrlFromQuery]);

  const startDate = booking ? new Date(booking.startTime) : null;
  const endDate = booking ? new Date(booking.endTime) : null;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 md:p-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-lg"
      >
        {/* Ticket card */}
        <div className="relative bg-card border border-border rounded-3xl overflow-hidden shadow-sm">
          {/* Decorative ticket notches */}
          <div className="absolute left-0 right-0 top-[172px] hidden sm:flex justify-between px-[-12px] pointer-events-none">
            <div className="w-6 h-6 rounded-full bg-background -ml-3" />
            <div className="w-6 h-6 rounded-full bg-background -mr-3" />
          </div>

          {/* Header */}
          <div className="px-6 md:px-8 pt-8 pb-6 text-center border-b border-dashed border-border">
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 220, damping: 18 }}
              className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4"
            >
              <CheckCircle2 className="w-9 h-9 text-success" />
            </motion.div>
            <h1 className="text-2xl font-semibold text-foreground mb-1">
              ¡Cita agendada!
            </h1>
            <p className="text-sm text-muted-foreground">
              Te enviaremos una confirmación por WhatsApp.
            </p>
          </div>

          {/* Body */}
          <div className="px-6 md:px-8 py-6 space-y-5">
            {!hydrated ? (
              <div className="py-6">
                <FeedbackState variant="loading" title="Cargando detalles" compact />
              </div>
            ) : booking && startDate && endDate ? (
              <>
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                    Fecha
                  </div>
                  <div className="text-lg font-semibold text-foreground capitalize">
                    {format(startDate, "EEEE, dd 'de' MMMM yyyy", { locale: es })}
                  </div>
                </div>

                <div className="flex gap-4 sm:gap-6">
                  <div className="flex-1">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" /> Hora
                    </div>
                    <div className="text-2xl font-bold text-primary tabular-nums">
                      {format(startDate, "HH:mm")}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      a {format(endDate, "HH:mm")} · {booking.durationMin} min
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1.5">
                      <Hash className="w-3.5 h-3.5" /> Folio
                    </div>
                    <div className="font-mono text-sm text-foreground break-all">
                      {booking.appointmentId.slice(0, 8).toUpperCase()}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {booking.appointmentType === "EXTENDED" ? "Primera vez" : "Consulta"}
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-dashed border-border">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Stethoscope className="w-3.5 h-3.5" /> Médico
                  </div>
                  <div className="font-semibold text-foreground">
                    {booking.doctor.name}
                  </div>
                  {booking.doctor.specialty && (
                    <div className="text-sm text-muted-foreground">
                      {booking.doctor.specialty}
                    </div>
                  )}
                </div>

                {booking.doctor.clinicAddress && (
                  <div className="pt-4 border-t border-dashed border-border">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5" /> Ubicación
                    </div>
                    <div className="text-sm text-foreground leading-relaxed">
                      {booking.doctor.clinicAddress}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-4">
                <p className="text-muted-foreground mb-2">
                  Tu cita fue registrada correctamente.
                </p>
                <p className="text-sm text-muted-foreground">
                  Revisa tu WhatsApp para los detalles de confirmación.
                </p>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="px-6 md:px-8 pb-7 space-y-2.5 bg-secondary/10">
            {booking && (
              <Button
                fullWidth
                size="lg"
                variant="secondary"
                onClick={() => downloadIcs(booking)}
              >
                <CalendarPlus className="w-4 h-4 mr-2" />
                Agregar a mi calendario
              </Button>
            )}
            {questionnaireUrl && (
              <Button
                fullWidth
                size="lg"
                onClick={() => router.push(questionnaireUrl)}
              >
                <ClipboardList className="w-4 h-4 mr-2" />
                Contestar cuestionario pre-consulta
              </Button>
            )}
            <Button
              fullWidth
              size="lg"
              variant="tertiary"
              onClick={() => router.push("/")}
            >
              <Home className="w-4 h-4 mr-2" />
              Volver al inicio
            </Button>
          </div>
        </div>

        {booking && (
          <p className="text-center text-xs text-muted-foreground mt-4">
            Guarda este folio por si necesitas contactarnos.
          </p>
        )}
      </motion.div>
    </div>
  );
}

export default function BookingConfirmation() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center p-6">
          <div className="w-full max-w-md">
            <FeedbackState
              variant="loading"
              title="Cargando confirmación"
              description="Preparando los detalles finales de tu cita."
            />
          </div>
        </div>
      }
    >
      <ConfirmationContent />
    </Suspense>
  );
}
