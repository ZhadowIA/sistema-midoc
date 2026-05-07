"use client";

import { useState, useEffect, useCallback } from "react";
import { format, parseISO, addDays, subDays } from "date-fns";
import { es } from "date-fns/locale";
import {
  ChevronLeft, ChevronRight, Plus, RefreshCw, Download,
  Lock, CheckCircle2, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { Modal } from "@/components/Modal";
import { toast } from "sonner";

type CashPaymentMethod = "CASH" | "CARD" | "TRANSFER" | "OTHER";

type CashEntry = {
  id: string;
  concept: string;
  amount: string;
  method: CashPaymentMethod;
  notes: string | null;
  createdAt: string;
  appointment: { id: string; startTime: string; patient: { firstName: string; lastNamePaternal: string } } | null;
  actor: { id: string; name: string };
};

type DayTotals = { total: number; CASH: number; CARD: number; TRANSFER: number; OTHER: number };

type ClosureSummary = {
  id: string;
  closedAt: string;
  closedBy: { id: string; name: string };
  notes: string | null;
  totals: { total: number; CASH: number; CARD: number; TRANSFER: number; OTHER: number; entries: number };
};

type CloseReport = {
  date: string;
  appointments: { total: number; byStatus: Record<string, number> };
  cash: { entries: number; total: number; CASH: number; CARD: number; TRANSFER: number; OTHER: number };
  closure: ClosureSummary | null;
};

const METHOD_LABEL: Record<CashPaymentMethod, string> = {
  CASH: "Efectivo", CARD: "Tarjeta", TRANSFER: "Transferencia", OTHER: "Otro",
};

const METHOD_COLOR: Record<CashPaymentMethod, string> = {
  CASH: "bg-green-100 text-green-800",
  CARD: "bg-blue-100 text-blue-800",
  TRANSFER: "bg-purple-100 text-purple-800",
  OTHER: "bg-gray-100 text-gray-700",
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendientes", CONFIRMED: "Confirmadas", ARRIVED: "Llegaron",
  WAITING: "En espera", IN_CONSULTATION: "En consulta",
  CHECKOUT_PENDING: "Por cobrar", COMPLETED: "Completadas",
  NO_SHOW: "No asistieron", CANCELLED: "Canceladas",
};

const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export default function CajaPage() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [entries, setEntries] = useState<CashEntry[]>([]);
  const [totals, setTotals] = useState<DayTotals | null>(null);
  const [report, setReport] = useState<CloseReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [closingDay, setClosingDay] = useState(false);
  const [closeNotes, setCloseNotes] = useState("");
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [form, setForm] = useState({ concept: "", amount: "", method: "CASH" as CashPaymentMethod, notes: "" });

  const dateStr = format(selectedDate, "yyyy-MM-dd");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [entriesRes, closeRes] = await Promise.all([
        fetch(`/api/agenda/admin/cash/entries?date=${dateStr}`, { cache: "no-store" }),
        fetch(`/api/agenda/admin/cash/close?date=${dateStr}`, { cache: "no-store" }),
      ]);
      const entriesData = await entriesRes.json() as { entries: CashEntry[]; totals: DayTotals };
      const closeData = await closeRes.json() as CloseReport;
      if (!entriesRes.ok) throw new Error((entriesData as { error?: string }).error ?? "Error");
      setEntries(entriesData.entries);
      setTotals(entriesData.totals);
      if (closeRes.ok) setReport(closeData);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [dateStr]);

  useEffect(() => { void loadData(); }, [loadData]);

  const handleAdd = async () => {
    if (!form.concept.trim() || !form.amount) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/agenda/admin/cash/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, amount: Number(form.amount), date: dateStr }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Error");
      setForm({ concept: "", amount: "", method: "CASH", notes: "" });
      setShowForm(false);
      toast.success("Cobro registrado");
      void loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al registrar");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseDay = async () => {
    setClosingDay(true);
    try {
      const res = await fetch("/api/agenda/admin/cash/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dateStr, notes: closeNotes.trim() || null }),
      });
      const data = await res.json() as { error?: string; closure?: ClosureSummary };
      if (!res.ok) throw new Error(data.error ?? "Error al cerrar");
      toast.success("Día cerrado correctamente");
      setShowCloseModal(false);
      setCloseNotes("");
      void loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al cerrar el día");
    } finally {
      setClosingDay(false);
    }
  };

  const exportCsv = () => {
    if (!entries.length) return;
    const rows = [
      ["Concepto", "Monto", "Método", "Hora", "Actor", "Notas"],
      ...entries.map(e => [
        e.concept,
        e.amount,
        METHOD_LABEL[e.method],
        format(parseISO(e.createdAt), "HH:mm"),
        e.actor.name,
        e.notes ?? "",
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `caja-${dateStr}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const isClosed = !!report?.closure;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Caja</h1>
            <p className="text-sm text-muted-foreground capitalize">
              {format(selectedDate, "EEEE d 'de' MMMM yyyy", { locale: es })}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Button variant="secondary" onClick={() => setSelectedDate(d => subDays(d, 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="secondary" onClick={() => setSelectedDate(new Date())}>Hoy</Button>
            <Button variant="secondary" onClick={() => setSelectedDate(d => addDays(d, 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button variant="secondary" onClick={loadData} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="secondary" onClick={exportCsv} disabled={!entries.length}>
              <Download className="w-4 h-4" />
            </Button>
            <Button
              onClick={() => setShowCloseModal(true)}
              disabled={loading || !entries.length}
              className={isClosed ? "opacity-70" : ""}
            >
              <Lock className="w-4 h-4 mr-2" />
              {isClosed ? "Re-cerrar día" : "Cerrar día"}
            </Button>
          </div>
        </div>

        {/* Banner de cierre formal */}
        {isClosed && report?.closure && (
          <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-4 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-semibold text-green-800">Día cerrado formalmente</p>
              <p className="text-green-700">
                {format(parseISO(report.closure.closedAt), "HH:mm")} · por {report.closure.closedBy.name}
                {report.closure.notes && ` · "${report.closure.notes}"`}
              </p>
              <p className="text-green-700 mt-0.5">
                {report.closure.totals.entries} cobros · {mxn.format(report.closure.totals.total)} total registrado
              </p>
            </div>
          </div>
        )}

        {/* Totales del día (live) */}
        {totals && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <div className="rounded-md border-2 border-primary/30 bg-primary/5 p-3 text-center md:col-span-1">
              <p className="text-xl font-bold text-primary">{mxn.format(totals.total)}</p>
              <p className="text-xs text-muted-foreground">Total del día</p>
            </div>
            {(["CASH", "CARD", "TRANSFER", "OTHER"] as CashPaymentMethod[]).map(m => (
              <div key={m} className="rounded-md border border-border bg-card p-3 text-center">
                <p className="text-lg font-semibold text-foreground">{mxn.format(totals[m])}</p>
                <p className="text-xs text-muted-foreground">{METHOD_LABEL[m]}</p>
              </div>
            ))}
          </div>
        )}

        {/* Resumen de citas */}
        {report && Object.keys(report.appointments.byStatus).length > 0 && (
          <div className="bg-card border border-border rounded-lg p-4 mb-6">
            <h2 className="font-semibold text-foreground mb-3 text-sm">Resumen de citas del día</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-y-1 gap-x-4 text-sm">
              {Object.entries(report.appointments.byStatus).map(([status, count]) => (
                <div key={status} className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{STATUS_LABEL[status] ?? status}</span>
                  <span className="font-medium">{count as number}</span>
                </div>
              ))}
            </div>
            {/* Alerta de citas por cobrar */}
            {(report.appointments.byStatus["CHECKOUT_PENDING"] ?? 0) > 0 && (
              <div className="mt-3 flex items-center gap-2 text-amber-700 text-xs bg-amber-50 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {report.appointments.byStatus["CHECKOUT_PENDING"]} cita(s) pendiente(s) de cobro
              </div>
            )}
          </div>
        )}

        {/* Agregar cobro manual */}
        <div className="mb-4">
          {!showForm ? (
            <Button onClick={() => setShowForm(true)} variant="secondary">
              <Plus className="w-4 h-4 mr-2" /> Registrar cobro
            </Button>
          ) : (
            <div className="bg-card border border-border rounded-lg p-4 space-y-3">
              <h3 className="font-medium text-foreground">Nuevo cobro</h3>
              <Input
                label="Concepto"
                placeholder="Consulta, procedimiento..."
                value={form.concept}
                onChange={e => setForm(f => ({ ...f, concept: e.target.value }))}
              />
              <Input
                label="Monto (MXN)"
                type="number"
                placeholder="0.00"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              />
              <div className="space-y-1">
                <label className="text-sm font-medium">Método de pago</label>
                <div className="flex gap-2 flex-wrap">
                  {(["CASH", "CARD", "TRANSFER", "OTHER"] as CashPaymentMethod[]).map(m => (
                    <button
                      key={m} type="button"
                      onClick={() => setForm(f => ({ ...f, method: m }))}
                      className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                        form.method === m
                          ? "border-primary bg-primary/10 text-primary font-medium"
                          : "border-border bg-background hover:bg-secondary/30"
                      }`}
                    >
                      {METHOD_LABEL[m]}
                    </button>
                  ))}
                </div>
              </div>
              <Input
                label="Notas (opcional)"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              />
              <div className="flex gap-2">
                <Button onClick={handleAdd} disabled={submitting || !form.concept || !form.amount}>
                  {submitting ? "Guardando..." : "Guardar"}
                </Button>
                <Button variant="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
              </div>
            </div>
          )}
        </div>

        {/* Lista de cobros */}
        {loading ? (
          <p className="text-center text-muted-foreground py-8 animate-pulse">Cargando...</p>
        ) : entries.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Sin cobros registrados para este día.</p>
        ) : (
          <div className="space-y-2">
            {entries.map(entry => (
              <div key={entry.id} className="bg-card border border-border rounded-md p-4 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-foreground truncate">{entry.concept}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${METHOD_COLOR[entry.method]}`}>
                      {METHOD_LABEL[entry.method]}
                    </span>
                  </div>
                  {entry.notes && <p className="text-xs text-muted-foreground mt-0.5">{entry.notes}</p>}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {format(parseISO(entry.createdAt), "HH:mm")} · {entry.actor.name}
                  </p>
                </div>
                <span className="font-semibold text-foreground text-lg whitespace-nowrap">
                  {mxn.format(Number(entry.amount))}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de cierre */}
      <Modal
        open={showCloseModal}
        onOpenChange={(open) => { if (!open) setShowCloseModal(false); }}
        title={isClosed ? "Re-cerrar día" : "Cerrar día"}
        description={
          isClosed
            ? "El día ya tiene un cierre registrado. Al re-cerrar se actualizarán los totales con los cobros actuales."
            : "Se registrará un cierre formal con los totales actuales. Puedes re-cerrar si se agregan cobros después."
        }
        size="sm"
      >
        <div className="space-y-4">
          {totals && (
            <div className="rounded-md bg-secondary/30 p-3 space-y-1 text-sm">
              <div className="flex justify-between font-semibold">
                <span>Total a cerrar</span>
                <span>{mxn.format(totals.total)}</span>
              </div>
              {(["CASH", "CARD", "TRANSFER", "OTHER"] as CashPaymentMethod[]).filter(m => totals[m] > 0).map(m => (
                <div key={m} className="flex justify-between text-muted-foreground">
                  <span>{METHOD_LABEL[m]}</span>
                  <span>{mxn.format(totals[m])}</span>
                </div>
              ))}
              <div className="flex justify-between text-muted-foreground pt-1 border-t border-border mt-1">
                <span>Cobros</span>
                <span>{entries.length}</span>
              </div>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Notas del cierre (opcional)</label>
            <textarea
              rows={2}
              value={closeNotes}
              onChange={e => setCloseNotes(e.target.value)}
              placeholder="Observaciones del turno..."
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleCloseDay} disabled={closingDay} className="flex-1">
              <Lock className="w-4 h-4 mr-2" />
              {closingDay ? "Cerrando..." : "Confirmar cierre"}
            </Button>
            <Button variant="secondary" onClick={() => setShowCloseModal(false)} disabled={closingDay}>
              Cancelar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
