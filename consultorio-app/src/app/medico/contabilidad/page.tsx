"use client";

import { useState, useEffect, useCallback } from "react";
import { DoctorLayout } from "@/components/DoctorLayout";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Button } from "@/components/Button";

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

type BillingReceiptsResponse = {
  receipts: Array<{
    appointmentId: string;
    folio: string;
    series: string;
    folioNumber: number;
    date: string;
    patientName: string;
    appointmentType: string;
    amountMx: number;
    currency: string;
    issuerFiscalData: {
      legalName: string;
      taxId: string;
      taxRegime: string;
      fiscalZipCode: string;
    };
    receiverFiscalData: {
      legalName: string;
      taxId: string;
      fiscalZipCode: string;
    };
  }>;
};

export default function ContabilidadPage() {
  const [dashboardData, setDashboardData] = useState<DashboardSummaryResponse | null>(null);
  const [receiptsData, setReceiptsData] = useState<BillingReceiptsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloadingAppointmentId, setDownloadingAppointmentId] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryResponse, receiptsResponse] = await Promise.all([
        fetch("/api/agenda/admin/dashboard/summary", { cache: "no-store" }),
        fetch("/api/agenda/admin/billing/receipts", { cache: "no-store" }),
      ]);
      const summaryData = await summaryResponse.json().catch(() => ({}));
      const receiptsData = await receiptsResponse.json().catch(() => ({}));
      if (!summaryResponse.ok) {
        throw new Error(summaryData.error || "No se pudo cargar la contabilidad");
      }
      if (!receiptsResponse.ok) {
        throw new Error(receiptsData.error || "No se pudo cargar los recibos");
      }
      setDashboardData(summaryData);
      setReceiptsData(receiptsData as BillingReceiptsResponse);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDownloadReceipt = async (appointmentId: string) => {
    setDownloadingAppointmentId(appointmentId);
    try {
      const res = await fetch(
        `/api/agenda/admin/billing/receipts/${appointmentId}/download`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "No se pudo descargar el recibo.");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      a.href = url;
      a.download = match?.[1] ?? "recibo.txt";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      toast.error(message);
    } finally {
      setDownloadingAppointmentId(null);
    }
  };

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
          <>
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
          <div className="bg-card border border-border rounded-2xl shadow-sm mb-6">
            <div className="px-6 py-4 border-b border-border">
              <h2 className="font-semibold text-foreground">Recibos básicos</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Lista de consultas completadas con descarga de recibo simple.
              </p>
            </div>
            <div className="p-6">
              {!receiptsData || receiptsData.receipts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aún no hay recibos disponibles.
                </p>
              ) : (
                <div className="space-y-2">
                  {receiptsData.receipts.slice(0, 20).map((receipt) => (
                    <div
                      key={receipt.appointmentId}
                      className="rounded-lg border border-border bg-secondary/10 p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-2"
                    >
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {receipt.folio} · {receipt.patientName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(receipt.date), "dd/MM/yyyy HH:mm")} ·{" "}
                          {receipt.appointmentType === "EXTENDED" ? "Consulta extendida" : "Consulta normal"}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Emisor RFC: {receipt.issuerFiscalData.taxId} · Receptor RFC: {receipt.receiverFiscalData.taxId}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {currencyFormatter.format(receipt.amountMx)}
                        </span>
                        <Button
                          size="sm"
                          variant="tertiary"
                          onClick={() => void handleDownloadReceipt(receipt.appointmentId)}
                          disabled={downloadingAppointmentId === receipt.appointmentId}
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Recibo
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-6">No hay datos contables disponibles.</p>
        )}
      </div>
    </DoctorLayout>
  );
}

