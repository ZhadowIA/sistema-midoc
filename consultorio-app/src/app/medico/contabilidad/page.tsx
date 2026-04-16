"use client";

import { useState, useEffect, useCallback } from "react";
import { DoctorLayout } from "@/components/DoctorLayout";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

type DashboardSummaryResponse = {
  analytics?: {
    currentMonth: {
      monthKey: string;
      label: string;
      totalAppointments: number;
      completedAppointments: number;
      pendingAppointments: number;
      confirmedAppointments: number;
      cancelledAppointments: number;
      estimatedRevenueCompleted: number;
      estimatedRevenueScheduled: number;
    };
    lastSixMonths: Array<{
      monthKey: string;
      label: string;
      totalAppointments: number;
      completedAppointments: number;
      estimatedRevenueCompleted: number;
    }>;
    priceConfig: {
      normalConsultationPrice: number;
      extendedConsultationPrice: number;
    };
  };
};

export default function ContabilidadPage() {
  const [dashboardData, setDashboardData] = useState<DashboardSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/dashboard/summary", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || "No se pudo cargar la contabilidad");
      }
      setDashboardData(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const analytics = dashboardData?.analytics;
  const currencyFormatter = new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  });

  return (
    <DoctorLayout>
      <div className="p-6 lg:p-8 w-full">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-foreground">Contabilidad y Finanzas</h1>
          <p className="text-muted-foreground text-sm mt-1">Monitorea tus ingresos e historial financiero</p>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-6 animate-pulse">Cargando datos contables...</p>
        ) : analytics ? (
          <div className="bg-card border border-border rounded-2xl shadow-sm mb-6">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">Analítica mensual</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Base de cálculo: precio de consulta configurado · corte {analytics.currentMonth.label}
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-xl border border-border bg-secondary/20 p-3">
                  <p className="text-xs text-muted-foreground">Citas del mes</p>
                  <p className="text-xl font-semibold text-foreground">{analytics.currentMonth.totalAppointments}</p>
                </div>
                <div className="rounded-xl border border-border bg-secondary/20 p-3">
                  <p className="text-xs text-muted-foreground">Completadas</p>
                  <p className="text-xl font-semibold text-foreground">{analytics.currentMonth.completedAppointments}</p>
                </div>
                <div className="rounded-xl border border-border bg-secondary/20 p-3">
                  <p className="text-xs text-muted-foreground">Ingreso estimado (realizado)</p>
                  <p className="text-xl font-semibold text-foreground">
                    {currencyFormatter.format(analytics.currentMonth.estimatedRevenueCompleted)}
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-secondary/20 p-3">
                  <p className="text-xs text-muted-foreground">Ingreso estimado (programado)</p>
                  <p className="text-xl font-semibold text-foreground">
                    {currencyFormatter.format(analytics.currentMonth.estimatedRevenueScheduled)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-border bg-secondary/20 p-3">
                  <p className="text-xs text-muted-foreground">Pendientes</p>
                  <p className="text-lg font-semibold text-warning">{analytics.currentMonth.pendingAppointments}</p>
                </div>
                <div className="rounded-xl border border-border bg-secondary/20 p-3">
                  <p className="text-xs text-muted-foreground">Confirmadas/Reagendadas</p>
                  <p className="text-lg font-semibold text-success">{analytics.currentMonth.confirmedAppointments}</p>
                </div>
                <div className="rounded-xl border border-border bg-secondary/20 p-3">
                  <p className="text-xs text-muted-foreground">Canceladas</p>
                  <p className="text-lg font-semibold text-destructive">{analytics.currentMonth.cancelledAppointments}</p>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-secondary/10 p-4">
                <p className="text-sm font-medium text-foreground mb-3">Tendencia últimos 6 meses</p>
                {analytics.lastSixMonths.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Aún no hay datos de tendencia.</p>
                ) : (
                  <div className="space-y-2">
                    {(() => {
                      const maxAppointments = Math.max(
                        1,
                        ...analytics.lastSixMonths.map((point) => point.totalAppointments)
                      );
                      return analytics.lastSixMonths.map((point) => (
                        <div key={point.monthKey} className="rounded-lg border border-border bg-card p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-foreground">{point.label}</p>
                            <p className="text-xs text-muted-foreground">
                              {point.completedAppointments}/{point.totalAppointments} completadas
                            </p>
                          </div>
                          <div className="mt-2 h-2 rounded-full bg-secondary overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all"
                              style={{
                                width: `${Math.round((point.totalAppointments / maxAppointments) * 100)}%`,
                              }}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">
                            Ingreso estimado realizado:{" "}
                            <span className="font-medium text-foreground">
                              {currencyFormatter.format(point.estimatedRevenueCompleted)}
                            </span>
                          </p>
                        </div>
                      ));
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-6">No hay datos contables disponibles.</p>
        )}
      </div>
    </DoctorLayout>
  );
}
