import { useMemo, useState } from "react";

/**
 * Agenda semanal por bloques (7 columnas = dias). El bloque es la duracion de
 * cita que el medico configuro (`slotMinutes`). Se listan los bloques del
 * horario laboral del medico (`workStartMinutes`..`workEndMinutes`, tomados de
 * sus reglas de disponibilidad); los bloques sin cita salen compactos y los que
 * tienen cita a altura completa. Las citas fuera del horario tambien se
 * muestran (se extiende el rango). "Atender" no abre consulta: resuelve el
 * expediente del paciente (`resolve_appointment_patient` en el backend).
 */

export interface AgendaAppointment {
  id: string;
  status: string;
  scheduled_start: string;
  scheduled_end: string;
  service_name: string | null;
  reason: string | null;
  patient_name: string;
  has_precheckin: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmada",
  CANCELLED: "Cancelada",
  COMPLETED: "Atendida"
};

const STATUS_PILLS: Record<string, string> = {
  PENDING: "pill pill-primary",
  CONFIRMED: "pill pill-success",
  CANCELLED: "pill pill-danger",
  COMPLETED: "pill pill-muted"
};

// Lunes primero (coincide con la semana laboral mexicana).
const DAY_NAMES = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const MINUTES_IN_DAY = 24 * 60;
// Horario laboral por defecto si el medico aun no configuro reglas.
const DEFAULT_WORK_START = 8 * 60;
const DEFAULT_WORK_END = 20 * 60;

const dayHeaderFormatter = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short"
});
const weekRangeFormatter = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "long"
});

function startOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const mondayOffset = (d.getDay() + 6) % 7; // 0 = lunes
  d.setDate(d.getDate() - mondayOffset);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function blockLabel(block: number, slot: number): string {
  const minutes = (block * slot) % MINUTES_IN_DAY;
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

export function WeekAgenda({
  appointments,
  slotMinutes,
  workStartMinutes,
  workEndMinutes,
  onAttend
}: {
  appointments: AgendaAppointment[];
  slotMinutes: number;
  workStartMinutes: number | null;
  workEndMinutes: number | null;
  onAttend: (appointmentId: string) => void;
}) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));

  const slot = slotMinutes > 0 ? slotMinutes : 30;
  const workStart = workStartMinutes ?? DEFAULT_WORK_START;
  const workEnd = Math.max(workEndMinutes ?? DEFAULT_WORK_END, workStart + slot);

  const today = new Date();
  const todayIndex = useMemo(() => {
    const diff = Math.round(
      (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
        weekStart.getTime()) /
        86_400_000
    );
    return diff >= 0 && diff < 7 ? diff : -1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart]);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  // Agrupa las citas de la semana visible por bloque (slot horario) y dia.
  const byBlockDay = useMemo(() => {
    const map = new Map<number, AgendaAppointment[][]>();
    for (const appt of appointments) {
      const start = new Date(appt.scheduled_start);
      const dayIndex = days.findIndex((d) => sameDay(d, start));
      if (dayIndex === -1) continue;
      const block = Math.floor(minutesSinceMidnight(start) / slot);
      if (!map.has(block)) {
        map.set(block, Array.from({ length: 7 }, () => [] as AgendaAppointment[]));
      }
      map.get(block)![dayIndex].push(appt);
    }
    for (const cols of map.values()) {
      for (const cell of cols) {
        cell.sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start));
      }
    }
    return map;
  }, [appointments, days, slot]);

  // Rango de bloques a mostrar: el horario laboral, extendido para no ocultar
  // citas que caigan antes o despues de el.
  const blocks = useMemo(() => {
    let first = Math.floor(workStart / slot);
    let last = Math.ceil(workEnd / slot) - 1;
    for (const block of byBlockDay.keys()) {
      first = Math.min(first, block);
      last = Math.max(last, block);
    }
    return Array.from({ length: last - first + 1 }, (_, i) => first + i);
  }, [byBlockDay, workStart, workEnd, slot]);

  const rangeLabel = `${weekRangeFormatter.format(weekStart)} – ${weekRangeFormatter.format(
    addDays(weekStart, 6)
  )}`;

  return (
    <div className="week-agenda">
      <div className="week-nav">
        <button
          className="ghost-button"
          aria-label="Semana anterior"
          onClick={() => setWeekStart((w) => addDays(w, -7))}
        >
          ‹
        </button>
        <button className="ghost-button" onClick={() => setWeekStart(startOfWeek(new Date()))}>
          Hoy
        </button>
        <button
          className="ghost-button"
          aria-label="Semana siguiente"
          onClick={() => setWeekStart((w) => addDays(w, 7))}
        >
          ›
        </button>
        <span className="meta week-range">{rangeLabel}</span>
      </div>

      <div className="week-grid">
        <div className="week-head">
          <div className="week-head-corner" />
          {days.map((day, i) => (
            <div
              key={day.toISOString()}
              className={i === todayIndex ? "week-col-head week-col-today" : "week-col-head"}
            >
              <span className="week-col-day">{DAY_NAMES[i]}</span>
              <span className="week-col-date">{dayHeaderFormatter.format(day)}</span>
            </div>
          ))}
        </div>

        <div className="week-rows">
          {blocks.map((block) => {
            const cols = byBlockDay.get(block);
            const filled = cols !== undefined;
            return (
              <div
                key={block}
                className={filled ? "week-row week-row-filled" : "week-row"}
                role="row"
              >
                <div className="week-time-cell">{blockLabel(block, slot)}</div>
                {days.map((_, dayIndex) => (
                  <div
                    key={dayIndex}
                    className={
                      dayIndex === todayIndex
                        ? "week-day-cell week-day-today-cell"
                        : "week-day-cell"
                    }
                  >
                    {(cols?.[dayIndex] ?? []).map((appt) => {
                      const start = new Date(appt.scheduled_start);
                      const cancelled = appt.status === "CANCELLED";
                      return (
                        <button
                          key={appt.id}
                          type="button"
                          className={cancelled ? "week-appt week-appt-cancelled" : "week-appt"}
                          disabled={cancelled}
                          onClick={() => onAttend(appt.id)}
                          title={
                            cancelled
                              ? "Cita cancelada"
                              : "Atender · buscar o crear el expediente del paciente"
                          }
                        >
                          <span className="week-appt-time">
                            {pad(start.getHours())}:{pad(start.getMinutes())}
                          </span>
                          <span className="week-appt-name">{appt.patient_name}</span>
                          <span className="week-appt-meta">
                            {appt.service_name ?? "Consulta"}
                            {appt.reason ? ` · ${appt.reason}` : ""}
                          </span>
                          <span className="week-appt-tags">
                            <span className={STATUS_PILLS[appt.status] ?? "pill pill-muted"}>
                              {STATUS_LABELS[appt.status] ?? appt.status}
                            </span>
                            {appt.has_precheckin ? (
                              <span className="pill pill-muted">Preconsulta</span>
                            ) : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
