import React from "react";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Card, CardContent } from "../components/Card";
import { mockAppointments, mockDashboardWidgets, mockPatients } from "../data/mockData";
import { PageShell } from "../layout/PageShell";

export function DashboardDoctorPage() {
  return (
    <PageShell
      title="Dashboard operativo del médico"
      subtitle="Resumen de productividad, carga clínica y próximos eventos para iniciar la jornada."
      eyebrow="Surface · Doctor workspace"
      actions={
        <>
          <Button size="sm">Nueva cita</Button>
          <Button size="sm" variant="secondary">Nuevo paciente</Button>
        </>
      }
    >
      <section className="rounded-2xl border border-border bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Prioridad de hoy</p>
            <h3 className="mt-1 text-lg font-semibold text-foreground">Consulta continua, recepción y nota clínica en un solo tablero</h3>
          </div>
          <Badge variant="info" className="text-xs">Actualizado hace 2 min</Badge>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {mockDashboardWidgets.map((w) => (
          <Card key={w.id}>
            <CardContent>
              <p className="text-sm text-muted-foreground">{w.label}</p>
              <p className="mt-2 text-2xl font-bold text-foreground">{w.value}</p>
              <Badge variant="success" className="mt-2">{w.trend}</Badge>
            </CardContent>
          </Card>
        ))}
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent>
            <h4 className="font-semibold text-foreground">Próximas citas</h4>
            <ul className="mt-3 space-y-2 text-sm">
              {mockAppointments.map((a) => (
                <li key={a.id} className="rounded-lg border border-border p-3">
                  <p className="font-medium text-foreground">{a.patientName}</p>
                  <p className="text-muted-foreground">{a.time} · {a.status}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <h4 className="font-semibold text-foreground">Pacientes recientes</h4>
            <ul className="mt-3 space-y-2 text-sm">
              {mockPatients.map((p) => (
                <li key={p.id} className="rounded-lg border border-border p-3">
                  <p className="font-medium text-foreground">{p.firstName} {p.lastName}</p>
                  <p className="text-muted-foreground">{p.email}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardContent>
            <h4 className="font-semibold text-foreground">Alertas de operación</h4>
            <ul className="mt-3 space-y-2 text-sm text-foreground">
              <li className="rounded-lg bg-secondary px-3 py-2">3 pacientes pendientes de confirmar por WhatsApp.</li>
              <li className="rounded-lg bg-secondary px-3 py-2">2 notas clínicas sin validación final.</li>
              <li className="rounded-lg bg-secondary px-3 py-2">1 incidencia de trazabilidad requiere revisión.</li>
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <h4 className="font-semibold text-foreground">Acciones rápidas</h4>
            <div className="mt-3 grid gap-2">
              <Button variant="secondary" fullWidth>Registrar llegada</Button>
              <Button variant="secondary" fullWidth>Abrir expediente</Button>
              <Button variant="secondary" fullWidth>Enviar recordatorio</Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </PageShell>
  );
}
