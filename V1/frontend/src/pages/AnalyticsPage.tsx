import React from "react";
import { Badge } from "../components/Badge";
import { Card, CardContent } from "../components/Card";
import { mockGovernanceSeries } from "../data/mockData";
import { PageShell } from "../layout/PageShell";

export function AnalyticsPage() {
  return (
    <PageShell
      title="Analítica y gobernanza de IA"
      subtitle="Lectura ejecutiva de consumo, adopción y trazabilidad para supervisión clínica."
      eyebrow="Surface · Governance analytics"
    >
      <section className="grid gap-4 md:grid-cols-[1fr_auto]">
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Rango activo</p>
              <p className="text-sm text-muted-foreground">Últimos 7 días · Todos los módulos</p>
            </div>
            <div className="flex gap-2 text-xs">
              <span className="rounded-full bg-secondary px-3 py-1 text-muted-foreground">Clínica completa</span>
              <span className="rounded-full bg-secondary px-3 py-1 text-muted-foreground">Exportable</span>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {["Costo diario", "Llamadas IA", "Aceptación", "Auditorías"].map((name, idx) => (
          <Card key={name}>
            <CardContent>
              <p className="text-sm text-muted-foreground">{name}</p>
              <p className="mt-2 text-2xl font-bold text-foreground">{idx === 0 ? "$148" : idx === 1 ? "260" : idx === 2 ? "78%" : "24"}</p>
              <Badge variant="success" className="mt-2">7 días</Badge>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent>
            <h4 className="font-semibold text-foreground">Tendencia de costo diario</h4>
            <div className="mt-3 rounded-xl bg-secondary p-4">
              <p className="text-sm text-muted-foreground">Placeholder de line chart con comparación semanal.</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <h4 className="font-semibold text-foreground">Distribución por módulo</h4>
            <div className="mt-3 rounded-xl bg-secondary p-4">
              <p className="text-sm text-muted-foreground">Placeholder de gráfico de composición por tipo de uso.</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardContent>
          <h4 className="font-semibold text-foreground">Serie diaria</h4>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm text-foreground">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-2">Día</th><th>Costo</th><th>Llamadas</th><th>Aceptación</th>
                </tr>
              </thead>
              <tbody>
                {mockGovernanceSeries.map((row) => (
                  <tr key={row.day} className="border-b border-slate-100">
                    <td className="py-2">{row.day}</td>
                    <td>${row.cost}</td>
                    <td>{row.calls}</td>
                    <td>{row.acceptance}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
