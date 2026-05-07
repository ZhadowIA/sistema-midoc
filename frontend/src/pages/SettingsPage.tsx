import React, { useState } from "react";
import { Button } from "../components/Button";
import { Card, CardContent } from "../components/Card";
import { Input } from "../components/Input";
import { Tabs } from "../components/Tabs";
import { PageShell } from "../layout/PageShell";

const settingsTabs = [
  { id: "perfil", label: "Perfil" },
  { id: "especialidad", label: "Especialidad" },
  { id: "horarios", label: "Horarios" },
  { id: "clinica", label: "Clínica" },
  { id: "seguridad", label: "Seguridad" },
];

export function SettingsPage() {
  const [active, setActive] = useState("perfil");

  return (
    <PageShell
      title="Configuración del médico"
      subtitle="Panel de ajustes por dominio para mantener perfil, operación y seguridad en un mismo lugar."
      eyebrow="Surface · Settings"
      actions={
        <>
          <Button size="sm" variant="secondary">Descartar</Button>
          <Button size="sm">Guardar cambios</Button>
        </>
      }
    >
      <section className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <div className="space-y-2 rounded-2xl border border-border bg-white p-3">
          <Tabs tabs={settingsTabs} activeTab={active} onChange={setActive} ariaLabel="Secciones de configuración" />
        </div>
        <Card>
          <CardContent className="space-y-5">
            <h4 className="font-semibold text-foreground">Detalle de la sección: {settingsTabs.find((tab) => tab.id === active)?.label}</h4>
            <div className="grid gap-4 md:grid-cols-2">
              <Input label="Nombre" defaultValue="Dr. Carlos Mendoza" />
              <Input label="Email" defaultValue="carlos.mendoza@midoc.app" />
              <Input label="Teléfono" defaultValue="+52 614 000 0000" />
              <Input label="Clínica" defaultValue="Clínica MiDoc" />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-xl bg-secondary p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Estado</p>
                <p className="mt-1 text-sm text-foreground">Perfil completo al 82%</p>
              </div>
              <div className="rounded-xl bg-secondary p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Seguridad</p>
                <p className="mt-1 text-sm text-foreground">2FA pendiente de activar</p>
              </div>
              <div className="rounded-xl bg-secondary p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Integraciones</p>
                <p className="mt-1 text-sm text-foreground">WhatsApp conectado</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </PageShell>
  );
}
