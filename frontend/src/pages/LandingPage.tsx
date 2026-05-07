import React from "react";
import { Button } from "../components/Button";
import { Card, CardContent } from "../components/Card";
import { SectionAccordion } from "../components/SectionAccordion";
import { mockFaq, mockFeatures, mockTestimonials } from "../data/mockData";
import { PageShell } from "../layout/PageShell";

export function LandingPage() {
  return (
    <PageShell
      title="Landing para captación clínica"
      subtitle="Narrativa orientada a confianza, resultado operativo y adopción de IA responsable."
      eyebrow="Surface · Brand to Product"
    >
      <section className="grid gap-6 rounded-2xl bg-primary p-8 text-white md:grid-cols-[1.5fr_1fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-100">Plataforma clínica con IA trazable</p>
          <h3 className="mt-2 text-3xl font-bold leading-tight sm:text-4xl">Menos tiempo en captura, más tiempo en decisión clínica</h3>
          <p className="mt-3 max-w-[55ch] text-blue-100">
            MiDoc conecta agenda, historia clínica, playbooks y gobernanza en un flujo único para consulta ambulatoria.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="secondary">Comenzar gratis</Button>
            <Button className="border border-white/30 bg-white/10 text-white hover:bg-white/20">Ver demo clínica</Button>
          </div>
        </div>

        <Card className="border-white/20 bg-white/95">
          <CardContent>
            <p className="text-sm font-semibold text-gray-700">Impacto operativo en consulta</p>
            <ul className="mt-3 space-y-3 text-sm text-gray-800">
              <li>
                <p className="font-medium">2 horas menos de documentación diaria</p>
                <p className="text-gray-600">Estructura SOAP asistida con revisión final del médico.</p>
              </li>
              <li>
                <p className="font-medium">Cobertura de entrevista preconsulta</p>
                <p className="text-gray-600">Captura de antecedentes previa con IA por texto y voz.</p>
              </li>
              <li>
                <p className="font-medium">Trazabilidad para comité y auditoría</p>
                <p className="text-gray-600">Decisiones registradas por encuentro y por módulo.</p>
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {mockFeatures.map((feature, index) => (
          <Card key={feature.id} className={index % 2 === 0 ? "md:translate-y-2" : ""}>
            <CardContent>
              <div className="flex items-start gap-3">
                <div className="mt-1 text-2xl">{feature.icon}</div>
                <div>
                  <h4 className="font-semibold text-foreground">{feature.title}</h4>
                  <p className="mt-1 text-sm text-muted-foreground">{feature.description}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 md:grid-cols-[1.2fr_1fr_1fr]">
        {mockTestimonials.map((item) => (
          <Card key={item.name}>
            <CardContent>
              <p className="text-sm text-foreground">“{item.text}”</p>
              <p className="mt-4 text-sm font-semibold text-foreground">{item.name}</p>
              <p className="text-xs text-muted-foreground">{item.specialty} · {item.clinic}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="rounded-2xl border border-border bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h4 className="text-xl font-semibold text-foreground">¿Listo para activar un piloto en tu clínica?</h4>
            <p className="mt-1 text-sm text-muted-foreground">Implementación guiada, onboarding por especialidad y soporte de adopción.</p>
          </div>
          <div className="flex gap-3">
            <Button>Solicitar piloto</Button>
            <Button variant="secondary">Descargar brochure</Button>
          </div>
        </div>
      </section>

      <SectionAccordion
        items={mockFaq.map((f, idx) => ({
          id: `${idx}`,
          title: f.question,
          content: <p>{f.answer}</p>,
        }))}
      />
    </PageShell>
  );
}
