import React from "react";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { Card, CardContent, CardFooter, CardHeader } from "../components/Card";
import { SectionAccordion } from "../components/SectionAccordion";
import { mockFaqBilling, mockPlans, mockAiAddOns } from "../data/mockData";
import { PageShell } from "../layout/PageShell";

export function PricingPage() {
  return (
    <PageShell
      title="Pricing por etapa de crecimiento"
      subtitle="Estructura de planes base y add-ons clínicos para comparar costo, alcance y madurez operativa."
      eyebrow="Surface · Billing"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-secondary p-3 text-sm text-foreground">
        <p>Facturación: Mensual / Anual (20% off anual)</p>
        <p className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-muted-foreground">Moneda MXN</p>
      </div>

      <div className="space-y-4">
        <h3 className="text-2xl font-bold text-foreground">Planes base</h3>
        <section className="grid gap-4 lg:grid-cols-3">
          {mockPlans.map((plan) => (
            <Card key={plan.id} className={plan.highlighted ? "ring-2 ring-primary" : ""}>
              <CardHeader className="flex items-center justify-between">
                <h4 className="text-xl font-semibold text-foreground">{plan.name}</h4>
                {plan.highlighted && <Badge variant="info">Recomendado</Badge>}
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-foreground">
                  {plan.price === null ? "Custom" : `$${plan.price}`}
                  <span className="text-sm font-normal text-muted-foreground">/mes</span>
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
                <ul className="mt-4 space-y-2 text-sm text-foreground">
                  {plan.features.map((feature) => <li key={feature}>✓ {feature}</li>)}
                </ul>
              </CardContent>
              <CardFooter>
                <Button fullWidth>{plan.cta}</Button>
              </CardFooter>
            </Card>
          ))}
        </section>
      </div>

      <div className="grid gap-4 pt-2 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardContent className="space-y-3">
            <h4 className="text-lg font-semibold text-foreground">Qué incluye cada plan base</h4>
            <ul className="space-y-2 text-sm text-foreground">
              <li>• Gestión de agenda y recordatorios para reducir ausentismo.</li>
              <li>• Historia clínica estructurada para continuidad de atención.</li>
              <li>• Escalamiento progresivo según tamaño de consulta o clínica.</li>
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3">
            <h4 className="text-lg font-semibold text-foreground">Soporte de implementación</h4>
            <ul className="space-y-2 text-sm text-foreground">
              <li>• Onboarding por especialidad.</li>
              <li>• Migración de datos asistida.</li>
              <li>• Mesa de ayuda para operación clínica.</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 pt-2">
        <h3 className="text-2xl font-bold text-foreground">Add-ons de IA clínica</h3>
        <p className="text-muted-foreground">Cubre desde uso parcial hasta cobertura total de consulta asistida por IA.</p>
        <section className="grid gap-4 md:grid-cols-3">
          {mockAiAddOns.map((addon) => (
            <Card key={addon.id} className={addon.highlighted ? "ring-2 ring-primary" : ""}>
              <CardHeader className="flex items-center justify-between">
                <h4 className="text-xl font-semibold text-foreground">{addon.name}</h4>
                {addon.highlighted && <Badge variant="info">Cobertura total</Badge>}
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-foreground">
                  ${addon.price}
                  <span className="text-sm font-normal text-muted-foreground">/mes</span>
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{addon.description}</p>
                <ul className="mt-4 space-y-2 text-sm text-foreground">
                  {addon.features.map((feature) => <li key={feature}>✓ {feature}</li>)}
                </ul>
              </CardContent>
              <CardFooter>
                <Button fullWidth>{addon.cta}</Button>
              </CardFooter>
            </Card>
          ))}
        </section>
      </div>

      <div className="space-y-4 pt-4">
        <h3 className="text-2xl font-bold text-foreground">Preguntas frecuentes de billing</h3>
        <SectionAccordion
          items={mockFaqBilling.map((item, idx) => ({
            id: `billing-${idx}`,
            title: item.question,
            content: <p>{item.answer}</p>,
          }))}
        />
      </div>
    </PageShell>
  );
}
