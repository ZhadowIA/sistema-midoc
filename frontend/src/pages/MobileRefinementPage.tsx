import React from "react";
import { Button } from "../components/Button";
import { Card, CardContent } from "../components/Card";
import { PageShell } from "../layout/PageShell";

export function MobileRefinementPage() {
  return (
    <PageShell
      title="Refinamiento mobile"
      subtitle="Composición de navegación inferior, tarjetas accionables y acción flotante para uso con una mano."
      eyebrow="Surface · Mobile"
    >
      <Card className="mx-auto max-w-sm">
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">Viewport móvil simulado</p>
          <div className="space-y-2">
            {["Paciente confirmado · 10:30", "Pendiente de llegada · 11:00", "Notas por validar · 12:00"].map((item) => (
              <div key={item} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100">
                {item}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-5 gap-2 rounded-xl border border-gray-200 p-2 dark:border-gray-700">
            {["Citas", "Pacientes", "IA", "Gov", "Perfil"].map((i) => (
              <button
                key={i}
                className="min-h-[44px] rounded-lg text-xs text-gray-700 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                {i}
              </button>
            ))}
          </div>
          <Button fullWidth>Nueva cita (FAB)</Button>
        </CardContent>
      </Card>
    </PageShell>
  );
}
