import React from "react";
import { Button } from "../components/Button";
import { Card, CardContent } from "../components/Card";
import { Input } from "../components/Input";
import { SPECIALTIES } from "../config/specialties";
import { PageShell } from "../layout/PageShell";

export function OnboardingPage() {
  return (
    <PageShell
      title="Onboarding clínico guiado"
      subtitle="Flujo de alta en 4 pasos con progresión visible y opción de completar después."
      eyebrow="Surface · Activation"
    >
      <section className="grid gap-4 lg:grid-cols-[1.2fr_2fr]">
        <Card>
          <CardContent className="space-y-4">
            <h4 className="font-semibold text-foreground">Ruta de configuración</h4>
            <div className="space-y-2 text-sm">
              {["Especialidad", "Horarios", "Datos de clínica", "Firma y perfil"].map((step, index) => (
                <div key={step} className="flex items-center gap-3 rounded-lg bg-secondary px-3 py-2">
                  {index === 0 ? (
                    <>
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-white">
                        {index + 1}
                      </span>
                      <p className="font-medium text-primary">{step}</p>
                    </>
                  ) : (
                    <>
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
                        {index + 1}
                      </span>
                      <p className="text-foreground">{step}</p>
                    </>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Tiempo estimado: 5 a 7 minutos.</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4">
            <div className="h-2 rounded-full bg-slate-200">
              <div className="h-2 w-1/2 rounded-full bg-primary" />
            </div>
            <h4 className="font-semibold text-foreground">Paso 1 · Selecciona tu especialidad</h4>
            <div className="grid gap-3 md:grid-cols-2">
              {SPECIALTIES.map((item) => (
                <button
                  key={item.id}
                  className="min-h-[44px] rounded-xl border border-border p-3 text-left transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <p className="font-medium text-foreground">{item.icon} {item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </button>
              ))}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Input label="Nombre de clínica" placeholder="Clínica MiDoc" />
              <Input label="Teléfono de contacto" placeholder="+52..." />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button>Continuar</Button>
              <Button variant="tertiary">Completar después</Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </PageShell>
  );
}
