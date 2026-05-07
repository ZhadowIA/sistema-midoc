import React from "react";
import { Button } from "../components/Button";
import { Card, CardContent } from "../components/Card";
import { PageShell } from "../layout/PageShell";

export function PatientBookingPage() {
  const slots = ["09:00", "09:30", "10:00", "10:30", "11:00", "12:00"];

  return (
    <PageShell
      title="Reserva de cita para paciente"
      subtitle="Flujo de selección de especialista, fecha y horario con resumen de confirmación."
      eyebrow="Surface · Booking"
    >
      <section className="rounded-2xl border border-border bg-white p-4">
        <div className="grid gap-2 text-sm sm:grid-cols-4">
          {["Especialista", "Fecha", "Horario", "Confirmación"].map((step, index) => (
            index === 2 ? (
              <div key={step} className="rounded-lg bg-primary px-3 py-2 text-white">
                {index + 1}. {step}
              </div>
            ) : (
              <div key={step} className="rounded-lg bg-secondary px-3 py-2 text-muted-foreground">
                {index + 1}. {step}
              </div>
            )
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardContent className="space-y-4">
            <h4 className="font-semibold text-foreground">Seleccionar horario</h4>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {slots.map((slot) => (
                <button
                  key={slot}
                  className="min-h-[44px] rounded-lg border border-border p-2 text-sm text-foreground transition-colors hover:border-primary hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {slot}
                </button>
              ))}
            </div>
            <div className="rounded-lg bg-secondary p-3 text-sm text-foreground">
              2 horarios tienen alta demanda para mañana, confirma cuanto antes para asegurar disponibilidad.
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3">
            <h4 className="font-semibold text-foreground">Resumen</h4>
            <p className="text-sm text-foreground">Especialista: Dra. Elena García</p>
            <p className="text-sm text-foreground">Fecha: 04 mayo 2026</p>
            <p className="text-sm text-foreground">Hora: 10:30</p>
            <p className="rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
              Recibirás confirmación por WhatsApp y correo al finalizar.
            </p>
            <Button fullWidth>Confirmar cita</Button>
          </CardContent>
        </Card>
      </section>
    </PageShell>
  );
}
