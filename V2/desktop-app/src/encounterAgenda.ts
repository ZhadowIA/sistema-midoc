import { filterAgendaAppointments } from "./weekAgendaFilters.ts";

export interface EncounterAgendaAppointment {
  id: string;
  status: string;
  scheduled_start: string;
  scheduled_end: string;
  service_name: string | null;
  reason: string | null;
  patient_name: string;
  patient_phone?: string | null;
  has_precheckin: boolean;
}

interface ScheduledAppointment {
  id: string;
  status: string;
  scheduled_start: string;
}

interface EncounterSwitchState {
  currentAppointmentId: string | null;
  targetAppointmentId: string;
  signed: boolean;
  hasUnsavedChanges: boolean;
}

export interface EncounterDraftSnapshot {
  note: unknown;
  prescription: string;
  background: unknown;
}

function isSameLocalDay(first: Date, second: Date): boolean {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

export function getEncounterAgendaAppointments<T extends ScheduledAppointment>(
  appointments: readonly T[],
  appointmentStart: string | null,
  now = new Date()
): T[] {
  const parsedStart = appointmentStart ? new Date(appointmentStart) : now;
  const referenceDate = Number.isNaN(parsedStart.getTime()) ? now : parsedStart;

  return filterAgendaAppointments(appointments, false)
    .filter((appointment) => {
      const scheduledStart = new Date(appointment.scheduled_start);
      return !Number.isNaN(scheduledStart.getTime()) && isSameLocalDay(scheduledStart, referenceDate);
    })
    .sort((first, second) => first.scheduled_start.localeCompare(second.scheduled_start));
}

export function shouldConfirmEncounterSwitch(state: EncounterSwitchState): boolean {
  return (
    state.currentAppointmentId !== state.targetAppointmentId &&
    !state.signed
  );
}

export function hasEncounterDraftChanges(
  current: EncounterDraftSnapshot,
  persisted: EncounterDraftSnapshot
): boolean {
  return JSON.stringify(current) !== JSON.stringify(persisted);
}
