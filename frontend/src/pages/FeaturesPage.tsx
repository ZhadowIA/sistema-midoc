import React from "react";
import { Button } from "../components/Button";
import { Card, CardContent } from "../components/Card";
import { mockFeatureDetails } from "../data/mockData";
import { PageShell } from "../layout/PageShell";

export function FeaturesPage() {
  return (
    <PageShell
      title="Features por flujo clínico"
      subtitle="Cada capacidad está presentada como un bloque de decisión para facilitar lectura por impacto operativo."
      eyebrow="Surface · Capabilities"
    >
      <div className="space-y-4">
        {mockFeatureDetails.map((feature, index) => (
          <Card key={feature.id}>
            <CardContent className="grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                  Capacidad {index + 1}
                </p>
                <h3 className="mt-1 text-xl font-semibold text-foreground">{feature.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{feature.description}</p>
                <ul className="mt-4 space-y-2 text-sm text-foreground">
                  {feature.bullets.map((bullet) => (
                    <li key={bullet} className="rounded-lg bg-secondary px-3 py-2">
                      {bullet}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-col gap-2">
                <Button>Explorar</Button>
                <Button variant="tertiary">Ver casos</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}
