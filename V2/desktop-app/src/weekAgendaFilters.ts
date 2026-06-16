type AppointmentStatus = {
  status: string;
};

export type AgendaViewMode = "day" | "week";

const DAYS_IN_WEEK = 7;

function startOfWeek(date: Date): Date {
  const nextDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const mondayOffset = (nextDate.getDay() + 6) % DAYS_IN_WEEK;
  nextDate.setDate(nextDate.getDate() - mondayOffset);
  return nextDate;
}

function addDays(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

export function filterAgendaAppointments<T extends AppointmentStatus>(
  appointments: readonly T[],
  showCancelled: boolean
): T[] {
  if (showCancelled) {
    return [...appointments];
  }
  return appointments.filter((appointment) => appointment.status !== "CANCELLED");
}

export function getAgendaVisibleDays(anchorDate: Date, viewMode: AgendaViewMode): Date[] {
  if (viewMode === "day") {
    return [new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate())];
  }
  const weekStart = startOfWeek(anchorDate);
  return Array.from({ length: DAYS_IN_WEEK }, (_, index) => addDays(weekStart, index));
}

export function moveAgendaAnchorDate(
  anchorDate: Date,
  viewMode: AgendaViewMode,
  direction: -1 | 1
): Date {
  return addDays(anchorDate, viewMode === "day" ? direction : direction * DAYS_IN_WEEK);
}
