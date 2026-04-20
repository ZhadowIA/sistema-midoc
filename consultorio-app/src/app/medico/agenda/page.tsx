"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Ban, CalendarClock, RefreshCcw, X } from "lucide-react";
import { DoctorLayout } from "@/components/DoctorLayout";
import { Button } from "@/components/Button";
import { Badge } from "@/components/Badge";
import { format, addDays, startOfWeek, endOfWeek } from "date-fns";
import { es } from "date-fns/locale";
import { useSearchParams, useRouter } from "next/navigation";
import { Modal } from "@/components/Modal";
import { Input } from "@/components/Input";
import { Select } from "@/components/Select";
import { toast } from "sonner";
import { formatPatientName, parseFullName } from "@/lib/patientName";

type AgendaAppointment = {
  id: string;
  doctorId?: string;
  doctorName?: string;
  patientName: string;
  patientPhone: string;
  dateLocal: string;
  time: string;
  startTime: string;
  endTime: string;
  consultType: string;
  status: string;
  hasQuestionnaire: boolean;
  origin: string;
};

type AgendaBlock = {
  id: string;
  type: string;
  reason?: string | null;
  dateLocal: string;
  time: string;
  startTime: string;
  endTime: string;
};

type AvailabilitySlot = {
  start: string;
  end: string;
  type: string;
};

type DirectoryPatientOption = {
  id: string;
  firstName?: string | null;
  lastNamePaternal?: string | null;
  lastNameMaternal?: string | null;
  phone: string;
  email?: string | null;
  dateOfBirth: string;
};

type AgendaResponse = {
  consultationDurationMin: number;
  appointments: AgendaAppointment[];
  blocks: AgendaBlock[];
};

type AgendaWeekDay = {
  dateLocal: string;
  appointments: AgendaAppointment[];
  blocks: AgendaBlock[];
};

type AgendaWeekResponse = {
  weekStart: string;
  weekEnd: string;
  consultationDurationMin: number;
  appointments: AgendaAppointment[];
  blocks: AgendaBlock[];
  days: AgendaWeekDay[];
  scope?: AgendaScope;
};

type AgendaScope = {
  actorDoctorId: string;
  currentDoctorId: string;
  canViewClinicAgenda: boolean;
  canEditCrossDoctor?: boolean;
  doctors: Array<{ id: string; name: string }>;
};

function DoctorAgendaContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dateParam = searchParams.get('date');
  const statusFilter = searchParams.get('status');
  const [currentDate, setCurrentDate] = useState(() => {
    if (dateParam) return new Date(dateParam + 'T00:00:00');
    return new Date();
  });
  const [appointments, setAppointments] = useState<AgendaAppointment[]>([]);
  const [blocks, setBlocks] = useState<AgendaBlock[]>([]);
  const [weekDays, setWeekDays] = useState<AgendaWeekDay[]>([]);
  const [agendaScope, setAgendaScope] = useState<AgendaScope | null>(null);
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);
  const [consultationDurationMin, setConsultationDurationMin] = useState(30);
  const [viewMode, setViewMode] = useState<"day" | "week">("day");
  const [newAppointmentOpen, setNewAppointmentOpen] = useState(false);
  const [newBlockOpen, setNewBlockOpen] = useState(false);
  const [submittingAppointment, setSubmittingAppointment] = useState(false);
  const [submittingBlock, setSubmittingBlock] = useState(false);
  const [availabilitySlots, setAvailabilitySlots] = useState<AvailabilitySlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [directoryPatients, setDirectoryPatients] = useState<DirectoryPatientOption[]>([]);
  const [loadingDirectoryPatients, setLoadingDirectoryPatients] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<AgendaAppointment | null>(null);
  const [submittingReschedule, setSubmittingReschedule] = useState(false);
  const [rescheduleSlots, setRescheduleSlots] = useState<AvailabilitySlot[]>([]);
  const [loadingRescheduleSlots, setLoadingRescheduleSlots] = useState(false);
  const [cancelingIds, setCancelingIds] = useState<string[]>([]);
  const [updatingStatusIds, setUpdatingStatusIds] = useState<string[]>([]);
  const [cancelConfirmAppointment, setCancelConfirmAppointment] = useState<AgendaAppointment | null>(null);

  const [appointmentForm, setAppointmentForm] = useState({
    patientMode: "new",
    patientId: "",
    newPatientName: "",
    newPatientPhone: "",
    newPatientEmail: "",
    newPatientDateOfBirth: "",
    appointmentType: "NORMAL",
    date: format(new Date(), "yyyy-MM-dd"),
    slotStart: "",
    manualTime: "",
    allowOutsidePublic: false,
    notes: "",
  });

  const [blockForm, setBlockForm] = useState({
    date: format(new Date(), "yyyy-MM-dd"),
    startTime: "",
    endTime: "",
    reason: "",
    type: "BLOCKED",
  });

  const [rescheduleForm, setRescheduleForm] = useState({
    date: format(new Date(), "yyyy-MM-dd"),
    slotStart: "",
    manualTime: "",
    allowOutsidePublic: false,
  });

  const timeSlots = useMemo(() => {
    const startHour = 8;
    const endHour = 20;
    const slotCount = Math.floor(((endHour - startHour) * 60) / consultationDurationMin);
    return Array.from({ length: slotCount }, (_, i) => {
      const totalMinutes = startHour * 60 + i * consultationDurationMin;
      const hour = Math.floor(totalMinutes / 60);
      const minute = totalMinutes % 60;
      return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
    });
  }, [consultationDurationMin]);

  const weekLabel = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: 1 });
    const end = endOfWeek(currentDate, { weekStartsOn: 1 });
    return `${format(start, "dd MMM", { locale: es })} - ${format(end, "dd MMM yyyy", { locale: es })}`;
  }, [currentDate]);

  const isViewingAnotherDoctor = Boolean(
    agendaScope && agendaScope.currentDoctorId !== agendaScope.actorDoctorId
  );
  const canEditCurrentAgenda = !isViewingAnotherDoctor || Boolean(agendaScope?.canEditCrossDoctor);

  const buildAgendaUrl = useCallback((basePath: string, params: Record<string, string | boolean | undefined>) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined) return;
      query.set(key, String(value));
    });
    if (selectedDoctorId) {
      query.set("doctorId", selectedDoctorId);
    }
    return `${basePath}?${query.toString()}`;
  }, [selectedDoctorId]);

  useEffect(() => {
    if (viewMode === "day") {
      const dateStr = format(currentDate, "yyyy-MM-dd");
      fetch(buildAgendaUrl("/api/agenda/admin/agenda/day", { date: dateStr, showCancelled }))
        .then(res => res.json())
        .then(data => {
          const parsed = data as AgendaResponse & { scope?: AgendaScope };
          if (parsed && Array.isArray(parsed.appointments)) {
            setAppointments(parsed.appointments);
            setBlocks(Array.isArray(parsed.blocks) ? parsed.blocks : []);
            setWeekDays([]);
            setConsultationDurationMin(parsed.consultationDurationMin || 30);
            if (parsed.scope) {
              setAgendaScope(parsed.scope);
              if (!selectedDoctorId) setSelectedDoctorId(parsed.scope.currentDoctorId);
            }
          } else {
            setAppointments([]);
            setBlocks([]);
            setWeekDays([]);
          }
        })
        .catch(console.error);
      return;
    }

    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    const weekStartStr = format(weekStart, "yyyy-MM-dd");
    fetch(buildAgendaUrl("/api/agenda/admin/agenda/week", { start: weekStartStr, showCancelled }))
      .then(res => res.json())
      .then(data => {
        const parsed = data as AgendaWeekResponse;
        if (parsed && Array.isArray(parsed.appointments)) {
          setAppointments(parsed.appointments);
          setBlocks(Array.isArray(parsed.blocks) ? parsed.blocks : []);
          setWeekDays(Array.isArray(parsed.days) ? parsed.days : []);
          setConsultationDurationMin(parsed.consultationDurationMin || 30);
          if (parsed.scope) {
            setAgendaScope(parsed.scope);
            if (!selectedDoctorId) setSelectedDoctorId(parsed.scope.currentDoctorId);
          }
        } else {
          setAppointments([]);
          setBlocks([]);
          setWeekDays([]);
        }
      })
      .catch(console.error);
  }, [buildAgendaUrl, currentDate, showCancelled, viewMode, selectedDoctorId]);

  useEffect(() => {
    if (!newAppointmentOpen || appointmentForm.allowOutsidePublic || !appointmentForm.date) {
      setAvailabilitySlots([]);
      return;
    }

    const typeParam = appointmentForm.appointmentType === "EXTENDED" ? "extended" : "normal";
    setLoadingSlots(true);
    fetch(`/api/agenda/admin/availability/slots?date=${appointmentForm.date}&type=${typeParam}`)
      .then(res => res.json())
      .then(data => {
        if (data && Array.isArray(data.slots)) {
          setAvailabilitySlots(data.slots);
        } else {
          setAvailabilitySlots([]);
        }
      })
      .catch(() => setAvailabilitySlots([]))
      .finally(() => setLoadingSlots(false));
  }, [newAppointmentOpen, appointmentForm.date, appointmentForm.appointmentType, appointmentForm.allowOutsidePublic]);

  useEffect(() => {
    if (!newAppointmentOpen) return;

    setLoadingDirectoryPatients(true);
    fetch("/api/clinical/admin/patients")
      .then((res) => res.json())
      .then((data) => {
        const patients = Array.isArray(data) ? data as DirectoryPatientOption[] : [];
        setDirectoryPatients(patients);
        setAppointmentForm((prev) => ({
          ...prev,
          patientMode: patients.length === 0 && prev.patientMode === "existing" ? "new" : prev.patientMode,
        }));
      })
      .catch(() => setDirectoryPatients([]))
      .finally(() => setLoadingDirectoryPatients(false));
  }, [newAppointmentOpen]);

  useEffect(() => {
    if (!rescheduleOpen || !selectedAppointment || rescheduleForm.allowOutsidePublic || !rescheduleForm.date) {
      setRescheduleSlots([]);
      return;
    }

    const typeParam = selectedAppointment.consultType === "extended" ? "extended" : "normal";
    setLoadingRescheduleSlots(true);
    fetch(`/api/agenda/admin/availability/slots?date=${rescheduleForm.date}&type=${typeParam}`)
      .then(res => res.json())
      .then(data => {
        const slotsFromApi = data && Array.isArray(data.slots) ? data.slots as AvailabilitySlot[] : [];
        if (selectedAppointment.dateLocal === rescheduleForm.date) {
          const includesCurrent = slotsFromApi.some((slot) => slot.start === selectedAppointment.startTime);
          if (!includesCurrent) {
            setRescheduleSlots([
              { start: selectedAppointment.startTime, end: selectedAppointment.endTime, type: typeParam },
              ...slotsFromApi,
            ]);
            return;
          }
        }
        setRescheduleSlots(slotsFromApi);
      })
      .catch(() => setRescheduleSlots([]))
      .finally(() => setLoadingRescheduleSlots(false));
  }, [rescheduleOpen, selectedAppointment, rescheduleForm.date, rescheduleForm.allowOutsidePublic]);

  useEffect(() => {
    const dateStr = format(currentDate, "yyyy-MM-dd");
    setAppointmentForm(prev => ({ ...prev, date: dateStr }));
    setBlockForm(prev => ({ ...prev, date: dateStr }));
  }, [currentDate]);

  const matchesStatusFilter = (apt: AgendaAppointment): boolean => {
    if (!statusFilter) return true;
    if (statusFilter === "overdue") {
      if (apt.status !== "pending") return false;
      const end = new Date(`${format(currentDate, "yyyy-MM-dd")}T${apt.time}:00`);
      return end.getTime() < Date.now();
    }
    return apt.status === statusFilter;
  };

  const getAppointmentsForTimeSlot = (time: string): AgendaAppointment[] => {
    return appointments.filter(apt => apt.time === time && matchesStatusFilter(apt));
  };

  const clearStatusFilter = () => {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    params.delete("status");
    const qs = params.toString();
    router.replace(qs ? `/medico/agenda?${qs}` : "/medico/agenda");
  };

  const statusFilterLabel = (() => {
    switch (statusFilter) {
      case "pending": return "Pendientes";
      case "confirmed": return "Confirmadas";
      case "completed": return "Completadas";
      case "cancelled": return "Canceladas";
      case "rescheduled": return "Reagendadas";
      case "overdue": return "Pendientes vencidas";
      default: return null;
    }
  })();

  const getBlocksForTimeSlot = (time: string): AgendaBlock[] => {
    return blocks.filter(block => block.time === time);
  };

  const canModifyAppointment = (apt: AgendaAppointment): boolean => {
    return apt.status !== "cancelled" && apt.status !== "completed";
  };

  const canConfirmAppointment = (apt: AgendaAppointment): boolean => {
    return apt.status === "pending" || apt.status === "rescheduled";
  };

  const canCompleteAppointment = (apt: AgendaAppointment): boolean => {
    return apt.status === "pending" || apt.status === "confirmed" || apt.status === "rescheduled";
  };

  const goToPreviousDay = () => setCurrentDate(addDays(currentDate, viewMode === "day" ? -1 : -7));
  const goToNextDay = () => setCurrentDate(addDays(currentDate, viewMode === "day" ? 1 : 7));
  const goToToday = () => setCurrentDate(new Date());

  const reloadAgenda = () => {
    if (viewMode === "day") {
      const dateStr = format(currentDate, "yyyy-MM-dd");
      fetch(buildAgendaUrl("/api/agenda/admin/agenda/day", { date: dateStr, showCancelled }))
        .then(res => res.json())
        .then(data => {
          const parsed = data as AgendaResponse & { scope?: AgendaScope };
          if (parsed && Array.isArray(parsed.appointments)) {
            setAppointments(parsed.appointments);
            setBlocks(Array.isArray(parsed.blocks) ? parsed.blocks : []);
            setConsultationDurationMin(parsed.consultationDurationMin || 30);
            if (parsed.scope) setAgendaScope(parsed.scope);
          }
        })
        .catch(console.error);
      return;
    }

    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
    const weekStartStr = format(weekStart, "yyyy-MM-dd");
    fetch(buildAgendaUrl("/api/agenda/admin/agenda/week", { start: weekStartStr, showCancelled }))
      .then(res => res.json())
      .then(data => {
        const parsed = data as AgendaWeekResponse;
        if (parsed && Array.isArray(parsed.appointments)) {
          setAppointments(parsed.appointments);
          setBlocks(Array.isArray(parsed.blocks) ? parsed.blocks : []);
          setWeekDays(Array.isArray(parsed.days) ? parsed.days : []);
          setConsultationDurationMin(parsed.consultationDurationMin || 30);
          if (parsed.scope) setAgendaScope(parsed.scope);
        }
      })
      .catch(console.error);
  };

  const openNewAppointmentModal = () => {
    if (!canEditCurrentAgenda) {
      toast.error("Solo puedes crear citas en tu propia agenda.");
      return;
    }
    const dateStr = format(currentDate, "yyyy-MM-dd");
    setAppointmentForm((prev) => ({
      ...prev,
      patientMode: "new",
      patientId: "",
      newPatientName: "",
      newPatientPhone: "",
      newPatientEmail: "",
      newPatientDateOfBirth: "",
      date: dateStr,
      slotStart: "",
      manualTime: "",
      allowOutsidePublic: false,
      notes: "",
    }));
    setNewAppointmentOpen(true);
  };

  const handleCreateManualAppointment = async () => {
    if (!canEditCurrentAgenda) {
      toast.error("Solo puedes crear citas en tu propia agenda.");
      return;
    }
    setSubmittingAppointment(true);
    try {
      let startTime: string;
      if (appointmentForm.allowOutsidePublic) {
        if (!appointmentForm.manualTime) {
          throw new Error("Selecciona una hora manual para horario extraordinario.");
        }
        startTime = new Date(`${appointmentForm.date}T${appointmentForm.manualTime}:00`).toISOString();
      } else {
        if (!appointmentForm.slotStart) {
          throw new Error("Selecciona un módulo disponible.");
        }
        startTime = appointmentForm.slotStart;
      }

      const payload = {
        ...(isViewingAnotherDoctor ? { doctorId: selectedDoctorId } : {}),
        ...(appointmentForm.patientMode === "existing"
          ? { patientId: appointmentForm.patientId }
          : {
              createPatient: {
                phone: appointmentForm.newPatientPhone,
                email: appointmentForm.newPatientEmail || undefined,
                dateOfBirth: appointmentForm.newPatientDateOfBirth || undefined,
                ...(function () {
                  const parsed = parseFullName(appointmentForm.newPatientName);
                  return {
                    firstName: parsed.firstName,
                    lastNamePaternal: parsed.lastNamePaternal,
                    lastNameMaternal: parsed.lastNameMaternal || undefined,
                  };
                })(),
              },
            }),
        appointmentType: appointmentForm.appointmentType,
        startTime,
        notes: appointmentForm.notes || undefined,
        allowOutsidePublic: appointmentForm.allowOutsidePublic,
      };

      const res = await fetch("/api/agenda/admin/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo crear la cita");

      setNewAppointmentOpen(false);
      setAppointmentForm(prev => ({
        ...prev,
        patientMode: "new",
        patientId: "",
        newPatientName: "",
        newPatientPhone: "",
        newPatientEmail: "",
        newPatientDateOfBirth: "",
        slotStart: "",
        manualTime: "",
        notes: "",
      }));
      reloadAgenda();
      toast.success("Cita creada correctamente.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error inesperado";
      toast.error(message);
    } finally {
      setSubmittingAppointment(false);
    }
  };

  const handleCreateBlock = async () => {
    if (!canEditCurrentAgenda) {
      toast.error("Solo puedes bloquear horarios en tu propia agenda.");
      return;
    }
    setSubmittingBlock(true);
    try {
      if (!blockForm.startTime || !blockForm.endTime) {
        throw new Error("Selecciona hora de inicio y fin para el bloqueo.");
      }

      const startTime = new Date(`${blockForm.date}T${blockForm.startTime}:00`).toISOString();
      const endTime = new Date(`${blockForm.date}T${blockForm.endTime}:00`).toISOString();

      const res = await fetch("/api/agenda/admin/blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isViewingAnotherDoctor ? { doctorId: selectedDoctorId } : {}),
          startTime,
          endTime,
          reason: blockForm.reason || undefined,
          type: blockForm.type,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo crear el bloqueo");

      setNewBlockOpen(false);
      setBlockForm(prev => ({
        ...prev,
        startTime: "",
        endTime: "",
        reason: "",
      }));
      reloadAgenda();
      toast.success("Bloqueo creado correctamente.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error inesperado";
      toast.error(message);
    } finally {
      setSubmittingBlock(false);
    }
  };

  const openRescheduleModal = (apt: AgendaAppointment) => {
    setSelectedAppointment(apt);
    setRescheduleForm({
      date: apt.dateLocal,
      slotStart: apt.startTime,
      manualTime: format(new Date(apt.startTime), "HH:mm"),
      allowOutsidePublic: false,
    });
    setRescheduleSlots([]);
    setRescheduleOpen(true);
  };

  const handleQuickReschedule = async () => {
    if (!selectedAppointment) return;
    if (!canEditCurrentAgenda) {
      toast.error("Solo puedes reagendar citas de tu propia agenda.");
      return;
    }
    setSubmittingReschedule(true);
    try {
      let newStartTime: string;
      if (rescheduleForm.allowOutsidePublic) {
        if (!rescheduleForm.manualTime) {
          throw new Error("Selecciona una hora manual para reagendar.");
        }
        newStartTime = new Date(`${rescheduleForm.date}T${rescheduleForm.manualTime}:00`).toISOString();
      } else {
        if (!rescheduleForm.slotStart) {
          throw new Error("Selecciona un módulo para reagendar.");
        }
        newStartTime = rescheduleForm.slotStart;
      }

      const res = await fetch(`/api/agenda/admin/appointments/${selectedAppointment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "RESCHEDULE",
          newStartTime,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "No se pudo reagendar la cita");

      setRescheduleOpen(false);
      setSelectedAppointment(null);
      setRescheduleSlots([]);
      reloadAgenda();
      toast.success("Cita reagendada correctamente.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error inesperado";
      toast.error(message);
    } finally {
      setSubmittingReschedule(false);
    }
  };

  const handleQuickStatusUpdate = async (
    apt: AgendaAppointment,
    status: "CONFIRMED" | "COMPLETED" | "CANCELLED"
  ) => {
    if (!canEditCurrentAgenda) {
      toast.error("Solo puedes modificar estados en tu propia agenda.");
      return;
    }
    const statusKey = status.toLowerCase();
    if (status === "CONFIRMED" && !canConfirmAppointment(apt)) return;
    if (status === "COMPLETED" && !canCompleteAppointment(apt)) return;
    if (status === "CANCELLED" && !canModifyAppointment(apt)) return;

    setUpdatingStatusIds((prev) => [...prev, apt.id]);
    if (status === "CANCELLED") {
      setCancelingIds((prev) => [...prev, apt.id]);
    }
    try {
      const res = await fetch(`/api/agenda/admin/appointments/${apt.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "No se pudo actualizar la cita");
      reloadAgenda();
      const messageByStatus: Record<string, string> = {
        confirmed: "Cita confirmada.",
        completed: "Cita marcada como realizada.",
        cancelled: "Cita cancelada.",
      };
      toast.success(messageByStatus[statusKey] || "Cita actualizada.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error inesperado";
      toast.error(message);
    } finally {
      setCancelingIds((prev) => prev.filter((id) => id !== apt.id));
      setUpdatingStatusIds((prev) => prev.filter((id) => id !== apt.id));
    }
  };

  return (
    <DoctorLayout>
      <div className="min-h-screen flex flex-col max-w-7xl mx-auto">
        {/* Header */}
        <div className="border-b border-border px-4 py-4 sm:px-6">
          <div className="mb-4 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold text-foreground leading-tight">
                {viewMode === "day" ? "Agenda Diaria" : "Agenda Semanal"}
              </h1>
              <p className="text-sm text-muted-foreground capitalize">
                {viewMode === "day"
                  ? format(currentDate, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: es })
                  : `Semana: ${weekLabel}`} · Módulo de {consultationDurationMin} min
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
              <Button
                variant={viewMode === "day" ? "primary" : "secondary"}
                size="sm"
                onClick={() => setViewMode("day")}
                className="w-full sm:w-auto"
              >
                Día
              </Button>
              <Button
                variant={viewMode === "week" ? "primary" : "secondary"}
                size="sm"
                onClick={() => setViewMode("week")}
                className="w-full sm:w-auto"
              >
                Semana
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setNewBlockOpen(true)}
                className="w-full sm:w-auto"
                disabled={!canEditCurrentAgenda}
              >
                <Ban className="w-4 h-4 mr-2" />
                Bloquear horario
              </Button>
              <Button size="sm" onClick={openNewAppointmentModal} className="w-full sm:w-auto" disabled={!canEditCurrentAgenda}>
                <Plus className="w-4 h-4 mr-2" />
                Nueva cita
              </Button>
            </div>
          </div>

          {agendaScope?.canViewClinicAgenda && agendaScope.doctors.length > 0 && (
            <div className="mb-3">
              <Select
                label="Agenda del médico"
                value={selectedDoctorId || agendaScope.currentDoctorId}
                onValueChange={setSelectedDoctorId}
                options={agendaScope.doctors.map((doctor) => ({
                  value: doctor.id,
                  label: doctor.name,
                }))}
              />
            </div>
          )}

          {isViewingAnotherDoctor && !canEditCurrentAgenda && (
            <div className="mb-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
              Vista compartida activa: puedes consultar la agenda del médico seleccionado, pero las acciones de edición permanecen en solo lectura.
            </div>
          )}

          {statusFilterLabel && (
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              Filtrando: {statusFilterLabel}
              <button
                type="button"
                onClick={clearStatusFilter}
                className="rounded-full hover:bg-primary/20 p-0.5"
                aria-label="Quitar filtro"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="showCancelled"
                className="rounded border-border text-primary cursor-pointer"
                checked={showCancelled}
                onChange={(e) => setShowCancelled(e.target.checked)}
              />
              <label htmlFor="showCancelled" className="text-sm text-muted-foreground select-none cursor-pointer">
                Ver canceladas
              </label>
            </div>
            {/* Navigation */}
            <div className="grid w-full grid-cols-3 gap-2 sm:w-auto sm:flex sm:items-center">
              <Button variant="secondary" size="sm" onClick={goToPreviousDay} className="w-full sm:w-auto">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button variant="secondary" size="sm" onClick={goToToday} className="w-full sm:w-auto">
                Hoy
              </Button>
              <Button variant="secondary" size="sm" onClick={goToNextDay} className="w-full sm:w-auto">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="flex-1 overflow-auto p-4 sm:p-6">
          {viewMode === "day" ? (
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              {timeSlots.map((time: string) => {
                const apts = getAppointmentsForTimeSlot(time);
                const slotBlocks = getBlocksForTimeSlot(time);
                return (
                  <div key={time} className="flex border-b border-border last:border-b-0 hover:bg-secondary/30 transition-colors">
                    <div className="w-24 p-4 border-r border-border bg-secondary/20 flex items-start">
                      <span className="text-sm font-medium text-muted-foreground">{time}</span>
                    </div>
                    <div className="flex-1 p-4 min-h-[80px]">
                      {slotBlocks.length > 0 ? (
                        <div className="space-y-2">
                          {slotBlocks.map((block) => (
                            <div key={block.id} className="p-4 rounded-xl border-l-4 border-destructive bg-destructive/10">
                              <div className="flex items-start justify-between">
                                <div>
                                  <div className="font-semibold text-foreground">Horario bloqueado</div>
                                  <div className="text-sm text-muted-foreground mt-1">
                                    {block.reason || "Sin motivo especificado"}
                                  </div>
                                </div>
                                <Badge variant="destructive" className="text-xs capitalize">
                                  {block.type}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : apts.length > 0 ? (
                        <div className="space-y-2">
                          {apts.map((apt) => (
                            <div key={apt.id} onClick={() => router.push(`/medico/citas/${apt.id}`)} className={`p-4 rounded-xl border-l-4 cursor-pointer hover:shadow-md transition-all ${apt.consultType === "extended" ? "bg-primary/10 border-primary" : "bg-success/10 border-success"}`}>
                              <div className="flex items-start justify-between">
                                <div>
                                  <div className="font-semibold text-foreground">{apt.patientName}</div>
                                  {agendaScope?.canViewClinicAgenda && apt.doctorName && (
                                    <div className="text-xs text-muted-foreground">Dr(a). {apt.doctorName}</div>
                                  )}
                                  <div className="text-sm text-muted-foreground mt-1 capitalize">{apt.consultType} · {apt.patientPhone}</div>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                  <div className="flex gap-2">
                                    {apt.hasQuestionnaire && <Badge variant="success" className="text-xs">Cuestionario</Badge>}
                                    <Badge variant="default" className="text-xs capitalize">{apt.status}</Badge>
                                  </div>
                                  {canModifyAppointment(apt) && (
                                    <div className="flex gap-2">
                                      {canConfirmAppointment(apt) && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            void handleQuickStatusUpdate(apt, "CONFIRMED");
                                          }}
                                          disabled={updatingStatusIds.includes(apt.id)}
                                          className="text-xs px-2 py-1 rounded-md border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-60"
                                        >
                                          {updatingStatusIds.includes(apt.id) ? "..." : "Confirmar"}
                                        </button>
                                      )}
                                      {canCompleteAppointment(apt) && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            void handleQuickStatusUpdate(apt, "COMPLETED");
                                          }}
                                          disabled={updatingStatusIds.includes(apt.id)}
                                          className="text-xs px-2 py-1 rounded-md border border-success/40 text-success hover:bg-success/10 disabled:opacity-60"
                                        >
                                          {updatingStatusIds.includes(apt.id) ? "..." : "Realizada"}
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          openRescheduleModal(apt);
                                        }}
                                        disabled={updatingStatusIds.includes(apt.id)}
                                        className="text-xs px-2 py-1 rounded-md border border-border hover:border-primary/40 hover:bg-primary/10"
                                      >
                                        Reagendar
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setCancelConfirmAppointment(apt);
                                        }}
                                        disabled={cancelingIds.includes(apt.id) || updatingStatusIds.includes(apt.id)}
                                        className="text-xs px-2 py-1 rounded-md border border-destructive/40 text-destructive hover:bg-destructive/10 disabled:opacity-60"
                                      >
                                        {cancelingIds.includes(apt.id) ? "Cancelando..." : "Cancelar"}
                                      </button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Disponible</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-3">
              {weekDays.map((day) => (
                <div key={day.dateLocal} className="bg-card border border-border rounded-2xl p-4 min-h-[360px] flex flex-col">
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentDate(new Date(`${day.dateLocal}T00:00:00`));
                      setViewMode("day");
                    }}
                    className="text-left hover:opacity-80 transition-opacity"
                  >
                    <div className="font-semibold text-foreground capitalize">
                      {format(new Date(`${day.dateLocal}T00:00:00`), "EEE dd MMM", { locale: es })}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {day.appointments.length} citas · {day.blocks.length} bloqueos
                    </div>
                  </button>

                  <div className="mt-3 space-y-2 overflow-auto">
                    {day.blocks.map((block) => (
                      <div key={block.id} className="p-2 rounded-lg border border-destructive/30 bg-destructive/10">
                        <div className="text-xs font-semibold text-foreground">{block.time} Bloqueo</div>
                        <div className="text-xs text-muted-foreground">{block.reason || "Sin motivo"}</div>
                      </div>
                    ))}

                    {day.appointments.filter(matchesStatusFilter).map((apt) => (
                      <div
                        key={apt.id}
                        onClick={() => router.push(`/medico/citas/${apt.id}`)}
                        className={`p-2 rounded-lg border-l-4 cursor-pointer hover:shadow-sm transition-all ${
                          apt.consultType === "extended" ? "bg-primary/10 border-primary" : "bg-success/10 border-success"
                        }`}
                      >
                        <div className="text-xs font-semibold text-foreground">
                          {apt.time} · {apt.patientName}
                        </div>
                        {agendaScope?.canViewClinicAgenda && apt.doctorName && (
                          <div className="text-[11px] text-muted-foreground">Dr(a). {apt.doctorName}</div>
                        )}
                        <div className="text-xs text-muted-foreground capitalize">{apt.consultType}</div>
                        {canModifyAppointment(apt) && (
                          <div className="mt-1 flex gap-1">
                            {canConfirmAppointment(apt) && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleQuickStatusUpdate(apt, "CONFIRMED");
                                }}
                                disabled={updatingStatusIds.includes(apt.id)}
                                className="text-[10px] px-2 py-1 rounded border border-primary/40 text-primary hover:bg-primary/10 disabled:opacity-60"
                              >
                                {updatingStatusIds.includes(apt.id) ? "..." : "Conf."}
                              </button>
                            )}
                            {canCompleteAppointment(apt) && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleQuickStatusUpdate(apt, "COMPLETED");
                                }}
                                disabled={updatingStatusIds.includes(apt.id)}
                                className="text-[10px] px-2 py-1 rounded border border-success/40 text-success hover:bg-success/10 disabled:opacity-60"
                              >
                                {updatingStatusIds.includes(apt.id) ? "..." : "Done"}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openRescheduleModal(apt);
                              }}
                              disabled={updatingStatusIds.includes(apt.id)}
                              className="text-[10px] px-2 py-1 rounded border border-border hover:border-primary/40 hover:bg-primary/10"
                            >
                              Reag.
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCancelConfirmAppointment(apt);
                              }}
                              disabled={cancelingIds.includes(apt.id) || updatingStatusIds.includes(apt.id)}
                              className="text-[10px] px-2 py-1 rounded border border-destructive/40 text-destructive hover:bg-destructive/10 disabled:opacity-60"
                            >
                              {cancelingIds.includes(apt.id) ? "..." : "Canc."}
                            </button>
                          </div>
                        )}
                      </div>
                    ))}

                    {day.appointments.length === 0 && day.blocks.length === 0 && (
                      <div className="text-xs text-muted-foreground pt-2">Sin eventos</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal
        open={newAppointmentOpen}
        onOpenChange={setNewAppointmentOpen}
        title="Crear cita manual"
        description="Primero captura los datos del paciente (como invitado). Si prefieres, también puedes usar un paciente existente del directorio."
      >
        <div className="space-y-4">
          <Select
            label="Origen del paciente (opción secundaria: directorio)"
            value={appointmentForm.patientMode}
            onValueChange={(value) =>
              setAppointmentForm((prev) => ({
                ...prev,
                patientMode: value,
                patientId: "",
              }))
            }
            options={[
              { value: "new", label: "Capturar datos del paciente" },
              { value: "existing", label: "Usar paciente del directorio" },
            ]}
          />

          {appointmentForm.patientMode === "existing" ? (
            <div className="space-y-2">
              {loadingDirectoryPatients ? (
                <div className="text-sm text-muted-foreground">Cargando directorio...</div>
              ) : directoryPatients.length === 0 ? (
                <div className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
                  No tienes pacientes en tu directorio. Usa “Capturar datos del paciente”.
                </div>
              ) : (
                <Select
                  label="Selecciona paciente"
                  value={appointmentForm.patientId || undefined}
                  onValueChange={(value) => setAppointmentForm((prev) => ({ ...prev, patientId: value }))}
                  placeholder="Selecciona un paciente..."
                  options={directoryPatients.map((patient) => ({
                    value: patient.id,
                    label: `${formatPatientName(patient)} · ${patient.phone}`,
                  }))}
                />
              )}
            </div>
          ) : (
            <>
              <Input
                label="Nombre del paciente"
                value={appointmentForm.newPatientName}
                onChange={(e) => setAppointmentForm(prev => ({ ...prev, newPatientName: e.target.value }))}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Teléfono"
                  value={appointmentForm.newPatientPhone}
                  onChange={(e) => setAppointmentForm(prev => ({ ...prev, newPatientPhone: e.target.value }))}
                />
                <Input
                  label="Correo (opcional)"
                  type="email"
                  value={appointmentForm.newPatientEmail}
                  onChange={(e) => setAppointmentForm(prev => ({ ...prev, newPatientEmail: e.target.value }))}
                />
              </div>
              <Input
                label="Fecha de nacimiento (opcional)"
                type="date"
                value={appointmentForm.newPatientDateOfBirth}
                onChange={(e) => setAppointmentForm(prev => ({ ...prev, newPatientDateOfBirth: e.target.value }))}
              />
            </>
          )}

          <Select
            label="Tipo de consulta"
            value={appointmentForm.appointmentType}
            onValueChange={(value) => setAppointmentForm(prev => ({ ...prev, appointmentType: value, slotStart: "" }))}
            options={[
              { value: "NORMAL", label: "Normal" },
              { value: "EXTENDED", label: "Extendida" },
            ]}
          />
          <Input
            label="Fecha de cita"
            type="date"
            value={appointmentForm.date}
            onChange={(e) => setAppointmentForm(prev => ({ ...prev, date: e.target.value, slotStart: "" }))}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={appointmentForm.allowOutsidePublic}
              onChange={(e) => setAppointmentForm(prev => ({ ...prev, allowOutsidePublic: e.target.checked, slotStart: "" }))}
            />
            Usar horario extraordinario (fuera de módulos públicos)
          </label>

          {appointmentForm.allowOutsidePublic ? (
            <Input
              label="Hora manual"
              type="time"
              value={appointmentForm.manualTime}
              onChange={(e) => setAppointmentForm(prev => ({ ...prev, manualTime: e.target.value }))}
            />
          ) : (
            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">Módulos disponibles</div>
              {loadingSlots ? (
                <div className="text-sm text-muted-foreground">Cargando módulos...</div>
              ) : availabilitySlots.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {availabilitySlots.map((slot) => (
                    <button
                      key={slot.start}
                      type="button"
                      onClick={() => setAppointmentForm(prev => ({ ...prev, slotStart: slot.start }))}
                      className={`p-2 rounded-lg border text-sm ${
                        appointmentForm.slotStart === slot.start
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      {format(new Date(slot.start), "HH:mm")} - {format(new Date(slot.end), "HH:mm")}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No hay módulos públicos para esa fecha/tipo.</div>
              )}
            </div>
          )}

          <Input
            label="Notas (opcional)"
            value={appointmentForm.notes}
            onChange={(e) => setAppointmentForm(prev => ({ ...prev, notes: e.target.value }))}
          />

          <Button
            fullWidth
            onClick={handleCreateManualAppointment}
            disabled={
              submittingAppointment ||
              (appointmentForm.patientMode === "existing"
                ? !appointmentForm.patientId
                : !appointmentForm.newPatientName || !appointmentForm.newPatientPhone)
            }
          >
            <CalendarClock className="w-4 h-4 mr-2" />
            {submittingAppointment ? "Creando..." : "Crear cita manual"}
          </Button>
        </div>
      </Modal>

      <Modal
        open={rescheduleOpen}
        onOpenChange={(open) => {
          setRescheduleOpen(open);
          if (!open) {
            setSelectedAppointment(null);
            setRescheduleSlots([]);
          }
        }}
        title="Reagendar cita"
        description="Selecciona una nueva fecha y horario por módulos. También puedes usar horario extraordinario."
      >
        <div className="space-y-4">
          {selectedAppointment && (
            <div className="p-3 rounded-lg bg-secondary/30 border border-border">
              <div className="text-sm font-semibold text-foreground">{selectedAppointment.patientName}</div>
              <div className="text-xs text-muted-foreground mt-1">
                Actual: {selectedAppointment.dateLocal} {selectedAppointment.time} · {selectedAppointment.consultType}
              </div>
            </div>
          )}

          <Input
            label="Nueva fecha"
            type="date"
            value={rescheduleForm.date}
            onChange={(e) =>
              setRescheduleForm((prev) => ({
                ...prev,
                date: e.target.value,
                slotStart: "",
              }))
            }
          />

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={rescheduleForm.allowOutsidePublic}
              onChange={(e) =>
                setRescheduleForm((prev) => ({
                  ...prev,
                  allowOutsidePublic: e.target.checked,
                  slotStart: "",
                }))
              }
            />
            Usar horario extraordinario (fuera de módulos públicos)
          </label>

          {rescheduleForm.allowOutsidePublic ? (
            <Input
              label="Hora manual"
              type="time"
              value={rescheduleForm.manualTime}
              onChange={(e) =>
                setRescheduleForm((prev) => ({
                  ...prev,
                  manualTime: e.target.value,
                }))
              }
            />
          ) : (
            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">Módulos disponibles</div>
              {loadingRescheduleSlots ? (
                <div className="text-sm text-muted-foreground">Cargando módulos...</div>
              ) : rescheduleSlots.length > 0 ? (
                <div className="grid grid-cols-2 gap-2">
                  {rescheduleSlots.map((slot) => (
                    <button
                      key={slot.start}
                      type="button"
                      onClick={() =>
                        setRescheduleForm((prev) => ({
                          ...prev,
                          slotStart: slot.start,
                        }))
                      }
                      className={`p-2 rounded-lg border text-sm ${
                        rescheduleForm.slotStart === slot.start
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      {format(new Date(slot.start), "HH:mm")} - {format(new Date(slot.end), "HH:mm")}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No hay módulos disponibles para esa fecha.</div>
              )}
            </div>
          )}

          <Button
            fullWidth
            onClick={handleQuickReschedule}
            disabled={submittingReschedule || !selectedAppointment}
          >
            <RefreshCcw className="w-4 h-4 mr-2" />
            {submittingReschedule ? "Reagendando..." : "Confirmar reagenda"}
          </Button>
        </div>
      </Modal>

      <Modal
        open={newBlockOpen}
        onOpenChange={setNewBlockOpen}
        title="Bloquear horario"
        description="Crea un bloqueo para impedir reservas en ese rango."
      >
        <div className="space-y-4">
          <Input
            label="Fecha"
            type="date"
            value={blockForm.date}
            onChange={(e) => setBlockForm(prev => ({ ...prev, date: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Hora inicio"
              type="time"
              value={blockForm.startTime}
              onChange={(e) => setBlockForm(prev => ({ ...prev, startTime: e.target.value }))}
            />
            <Input
              label="Hora fin"
              type="time"
              value={blockForm.endTime}
              onChange={(e) => setBlockForm(prev => ({ ...prev, endTime: e.target.value }))}
            />
          </div>
          <Select
            label="Tipo de bloqueo"
            value={blockForm.type}
            onValueChange={(value) => setBlockForm(prev => ({ ...prev, type: value }))}
            options={[
              { value: "BLOCKED", label: "Bloqueado" },
              { value: "PRIVATE_RESERVED", label: "Reservado privado" },
            ]}
          />
          <Input
            label="Motivo (opcional)"
            value={blockForm.reason}
            onChange={(e) => setBlockForm(prev => ({ ...prev, reason: e.target.value }))}
          />

          <Button
            fullWidth
            variant="destructive"
            onClick={handleCreateBlock}
            disabled={submittingBlock}
          >
            <Ban className="w-4 h-4 mr-2" />
            {submittingBlock ? "Bloqueando..." : "Crear bloqueo"}
          </Button>
        </div>
      </Modal>

      <Modal
        open={Boolean(cancelConfirmAppointment)}
        onOpenChange={(open) => {
          if (!open) setCancelConfirmAppointment(null);
        }}
        title="Cancelar cita"
        description={
          cancelConfirmAppointment
            ? `Se cancelará la cita de ${cancelConfirmAppointment.patientName} a las ${cancelConfirmAppointment.time}.`
            : "Confirma esta acción."
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Esta acción notificará al paciente y liberará el horario en la agenda.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="secondary"
              onClick={() => setCancelConfirmAppointment(null)}
              disabled={Boolean(cancelConfirmAppointment && cancelingIds.includes(cancelConfirmAppointment.id))}
            >
              Mantener cita
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!cancelConfirmAppointment) return;
                const apt = cancelConfirmAppointment;
                setCancelConfirmAppointment(null);
                await handleQuickStatusUpdate(apt, "CANCELLED");
              }}
              disabled={Boolean(cancelConfirmAppointment && cancelingIds.includes(cancelConfirmAppointment.id))}
            >
              {cancelConfirmAppointment && cancelingIds.includes(cancelConfirmAppointment.id)
                ? "Cancelando..."
                : "Confirmar cancelación"}
            </Button>
          </div>
        </div>
      </Modal>
    </DoctorLayout>
  );
}

export default function DoctorAgenda() {
  return (
    <Suspense
      fallback={
        <DoctorLayout>
          <div className="p-6 lg:p-8 w-full">
            <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
              Cargando agenda...
            </div>
          </div>
        </DoctorLayout>
      }
    >
      <DoctorAgendaContent />
    </Suspense>
  );
}

