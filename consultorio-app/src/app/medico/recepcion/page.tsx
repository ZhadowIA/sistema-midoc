"use client";

import { useState, useEffect, useCallback } from "react";
import { format, parseISO, addDays, subDays, differenceInMinutes } from "date-fns";
import { es } from "date-fns/locale";
import {
  UserCheck, Clock, Stethoscope, CheckCircle2,
  ChevronLeft, ChevronRight, AlertCircle, RefreshCw,
  FileText, ClipboardList, DollarSign,
} from "lucide-react";
import { Button } from "@/components/Button";
import { DoctorLayout } from "@/components/DoctorLayout";
import { CobrarModal } from "@/components/agenda/CobrarModal";
import { toast } from "sonner";

type AppointmentStatus =
  | "PENDING" | "CONFIRMED" | "ARRIVED" | "WAITING"
  | "IN_CONSULTATION" | "CHECKOUT_PENDING" | "COMPLETED"
  | "NO_SHOW" | "CANCELLED" | "RESCHEDULED";

type ReceptionAction =
  | "MARK_ARRIVED" | "MARK_WAITING" | "MARK_IN_CONSULTATION"
  | "MARK_CHECKOUT_PENDING" | "MARK_NO_SHOW" | "MARK_COMPLETED";

type ReceptionAppointment = {
  id: string;
  startTime: string;
  endTime: string;
  appointmentType: string;
  status: AppointmentStatus;
  arrivedAt: string | null;
  notes: string | null;
  patient: { id: string; name: string; phone: string };
  hasQuestionnaire: boolean;
  hasClinicalNote: boolean;
};

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmada",
  ARRIVED: "Llegó",
  WAITING: "En espera",
  IN_CONSULTATION: "En consulta",
  CHECKOUT_PENDING: "Por cobrar",
  COMPLETED: "Completada",
  NO_SHOW: "No asistió",
  CANCELLED: "Cancelada",
  RESCHEDULED: "Reagendada",
};

const STATUS_COLOR: Record<AppointmentStatus, string> = {
  PENDING: "bg-pending/10 text-pending border border-pending/30",
  CONFIRMED: "bg-primary/10 text-primary border border-primary/30",
  ARRIVED: "bg-success/10 text-success border border-success/30",
  WAITING: "bg-warning/10 text-warning border border-warning/30",
  IN_CONSULTATION: "bg-primary/10 text-primary border border-primary/30",
  CHECKOUT_PENDING: "bg-warning/10 text-warning border border-warning/30",
  COMPLETED: "bg-success/10 text-success border border-success/30",
  NO_SHOW: "bg-destructive/10 text-destructive border border-destructive/30",
  CANCELLED: "bg-destructive/10 text-destructive border border-destructive/30",
  RESCHEDULED: "bg-muted text-muted-foreground border border-border",
};

const NEXT_ACTIONS: Record<AppointmentStatus, { action: ReceptionAction; label: string; icon: React.ReactNode }[]> = {
  PENDING: [
    { action: "MARK_ARRIVED", label: "Registrar llegada", icon: <UserCheck className="w-4 h-4" /> },
    { action: "MARK_WAITING", label: "Poner en espera", icon: <Clock className="w-4 h-4" /> },
    { action: "MARK_NO_SHOW", label: "No asistió", icon: <AlertCircle className="w-4 h-4" /> },
  ],
  CONFIRMED: [
    { action: "MARK_ARRIVED", label: "Registrar llegada", icon: <UserCheck className="w-4 h-4" /> },
    { action: "MARK_WAITING", label: "Poner en espera", icon: <Clock className="w-4 h-4" /> },
    { action: "MARK_NO_SHOW", label: "No asistió", icon: <AlertCircle className="w-4 h-4" /> },
  ],
  ARRIVED: [
    { action: "MARK_WAITING", label: "Pasar a espera", icon: <Clock className="w-4 h-4" /> },
    { action: "MARK_IN_CONSULTATION", label: "Entró a consulta", icon: <Stethoscope className="w-4 h-4" /> },
    { action: "MARK_NO_SHOW", label: "No asistió", icon: <AlertCircle className="w-4 h-4" /> },
  ],
  WAITING: [
    { action: "MARK_IN_CONSULTATION", label: "Entró a consulta", icon: <Stethoscope className="w-4 h-4" /> },
    { action: "MARK_NO_SHOW", label: "No asistió", icon: <AlertCircle className="w-4 h-4" /> },
  ],
  IN_CONSULTATION: [
    { action: "MARK_CHECKOUT_PENDING", label: "Pasó a cobro", icon: <ClipboardList className="w-4 h-4" /> },
    { action: "MARK_COMPLETED", label: "Completar", icon: <CheckCircle2 className="w-4 h-4" /> },
  ],
  CHECKOUT_PENDING: [
    { action: "MARK_COMPLETED", label: "Completar cobro", icon: <CheckCircle2 className="w-4 h-4" /> },
  ],
  COMPLETED: [],
  NO_SHOW: [],
  CANCELLED: [],
  RESCHEDULED: [],
};

export default function RecepcionPage() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [appointments, setAppointments] = useState<ReceptionAppointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [checkoutApt, setCheckoutApt] = useState<ReceptionAppointment | null>(null);
  const now = new Date();

  const dateStr = format(selectedDate, "yyyy-MM-dd");

  const loadDay = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/agenda/admin/reception/day?date=${dateStr}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al cargar");
      setAppointments(data.appointments);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al cargar citas");
    } finally {
      setLoading(false);
    }
  }, [dateStr]);

  useEffect(() => { void loadDay(); }, [loadDay]);

  const applyAction = async (appointmentId: string, action: ReceptionAction) => {
    setActionLoading(`${appointmentId}:${action}`);
    try {
      const res = await fetch(`/api/agenda/admin/appointments/${appointmentId}/reception`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al actualizar");
      setAppointments(prev =>
        prev.map(a => a.id === appointmentId ? { ...a, status: data.status as AppointmentStatus } : a)
      );
      toast.success("Estado actualizado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar");
    } finally {
      setActionLoading(null);
    }
  };

  const stats = {
    total: appointments.length,
    arrived: appointments.filter(a => ["ARRIVED", "WAITING", "IN_CONSULTATION", "CHECKOUT_PENDING"].includes(a.status)).length,
    inConsultation: appointments.filter(a => a.status === "IN_CONSULTATION").length,
    completed: appointments.filter(a => a.status === "COMPLETED").length,
    noShow: appointments.filter(a => a.status === "NO_SHOW").length,
  };

  return (
    <DoctorLayout>
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">Recepción</h1>
            <p className="text-sm text-muted-foreground capitalize">
              {format(selectedDate, "EEEE d 'de' MMMM yyyy", { locale: es })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setSelectedDate(d => subDays(d, 1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="secondary" onClick={() => setSelectedDate(new Date())}>
              Hoy
            </Button>
            <Button variant="secondary" onClick={() => setSelectedDate(d => addDays(d, 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button variant="secondary" onClick={loadDay} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: "Total", value: stats.total, color: "text-foreground" },
            { label: "En sala", value: stats.arrived, color: "text-orange-600" },
            { label: "Consulta", value: stats.inConsultation, color: "text-purple-600" },
            { label: "Completadas", value: stats.completed, color: "text-green-600" },
          ].map(s => (
            <div key={s.label} className="rounded-md border border-border bg-card p-3 text-center">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Appointment list */}
        {loading ? (
          <p className="text-center text-muted-foreground py-12 animate-pulse">Cargando citas del día...</p>
        ) : appointments.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">No hay citas para este día.</p>
        ) : (
          <div className="space-y-3">
            {appointments.map(apt => {
              const actions = NEXT_ACTIONS[apt.status] ?? [];
              return (
                <div
                  key={apt.id}
                  className="bg-card border border-border rounded-lg p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-semibold text-foreground truncate">{apt.patient.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[apt.status]}`}>
                          {STATUS_LABEL[apt.status]}
                        </span>
                        {apt.hasQuestionnaire && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                            Cuestionario
                          </span>
                        )}
                        {apt.hasClinicalNote && (
                          <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span>
                          {format(parseISO(apt.startTime), "HH:mm")} – {format(parseISO(apt.endTime), "HH:mm")}
                        </span>
                        <span>·</span>
                        <span>{apt.appointmentType === "EXTENDED" ? "Extendida" : "Normal"}</span>
                        {apt.arrivedAt && (
                          <>
                            <span>·</span>
                            <span>Llegó {format(parseISO(apt.arrivedAt), "HH:mm")}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                      {/* Tiempo de espera en sala */}
                      {(apt.status === "ARRIVED" || apt.status === "WAITING") && apt.arrivedAt && (
                        <span className="text-xs text-amber-600 font-medium">
                          {differenceInMinutes(now, parseISO(apt.arrivedAt))} min en sala
                        </span>
                      )}

                      {/* Acciones de estado */}
                      {actions.map(({ action, label, icon }) => {
                        const key = `${apt.id}:${action}`;
                        const isLoading = actionLoading === key;
                        return (
                          <button
                            key={action}
                            onClick={() => applyAction(apt.id, action)}
                            disabled={isLoading || actionLoading !== null}
                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-secondary/30 transition-colors disabled:opacity-50"
                          >
                            {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : icon}
                            {label}
                          </button>
                        );
                      })}

                      {/* Cobro rápido para estados cobrables */}
                      {(apt.status === "CHECKOUT_PENDING" || apt.status === "IN_CONSULTATION" ||
                        apt.status === "ARRIVED" || apt.status === "WAITING") && (
                        <button
                          onClick={() => setCheckoutApt(apt)}
                          disabled={actionLoading !== null}
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-green-300 bg-green-50 text-green-700 hover:bg-green-100 transition-colors disabled:opacity-50 font-medium"
                        >
                          <DollarSign className="w-3.5 h-3.5" />
                          Cobrar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de cobro */}
      {checkoutApt && (
        <CobrarModal
          open={!!checkoutApt}
          onOpenChange={(open) => { if (!open) setCheckoutApt(null); }}
          appointmentId={checkoutApt.id}
          defaultConcept="Consulta"
          onSuccess={() => {
            setAppointments(prev =>
              prev.map(a => a.id === checkoutApt.id ? { ...a, status: "COMPLETED" } : a)
            );
            setCheckoutApt(null);
          }}
        />
      )}
    </div>
    </DoctorLayout>
  );
}
