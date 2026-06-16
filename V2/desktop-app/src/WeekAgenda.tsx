import { useMemo, useState, type CSSProperties } from "react";
import {
  filterAgendaAppointments,
  getAgendaVisibleDays,
  moveAgendaAnchorDate,
  type AgendaViewMode
} from "./weekAgendaFilters";

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
const dayRangeFormatter = new Intl.DateTimeFormat("es-MX", {
  weekday: "long",
  day: "numeric",
  month: "long"
});
const weekRangeFormatter = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "long"
});

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
  const [anchorDate, setAnchorDate] = useState(() => new Date());
  const [viewMode, setViewMode] = useState<AgendaViewMode>("week");
  const [showCancelled, setShowCancelled] = useState(false);

  const slot = slotMinutes > 0 ? slotMinutes : 30;
  const workStart = workStartMinutes ?? DEFAULT_WORK_START;
  const workEnd = Math.max(workEndMinutes ?? DEFAULT_WORK_END, workStart + slot);
  const visibleAppointments = useMemo(
    () => filterAgendaAppointments(appointments, showCancelled),
    [appointments, showCancelled]
  );

  const today = new Date();
  const days = useMemo(() => getAgendaVisibleDays(anchorDate, viewMode), [anchorDate, viewMode]);
  const todayIndex = useMemo(() => {
    return days.findIndex((day) => sameDay(day, today));
  }, [days, today]);

  // Agrupa las citas de la semana visible por bloque (slot horario) y dia.
  const byBlockDay = useMemo(() => {
    const map = new Map<number, AgendaAppointment[][]>();
    for (const appt of visibleAppointments) {
      const start = new Date(appt.scheduled_start);
      const dayIndex = days.findIndex((d) => sameDay(d, start));
      if (dayIndex === -1) continue;
      const block = Math.floor(minutesSinceMidnight(start) / slot);
      if (!map.has(block)) {
        map.set(block, Array.from({ length: days.length }, () => [] as AgendaAppointment[]));
      }
      map.get(block)![dayIndex].push(appt);
    }
    for (const cols of map.values()) {
      for (const cell of cols) {
        cell.sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start));
      }
    }
    return map;
  }, [visibleAppointments, days, slot]);

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

  const rangeLabel =
    viewMode === "day"
      ? dayRangeFormatter.format(days[0])
      : `${weekRangeFormatter.format(days[0])} – ${weekRangeFormatter.format(days[days.length - 1])}`;
  const gridStyle = { "--week-day-count": days.length } as CSSProperties;

  return (
    <div className="week-agenda">
      <div className="week-nav">
        <button
          className="ghost-button"
          aria-label={viewMode === "day" ? "Dia anterior" : "Semana anterior"}
          onClick={() => setAnchorDate((date) => moveAgendaAnchorDate(date, viewMode, -1))}
        >
          ‹
        </button>
        <button className="ghost-button" onClick={() => setAnchorDate(new Date())}>
          Hoy
        </button>
        <button
          className="ghost-button"
          aria-label={viewMode === "day" ? "Dia siguiente" : "Semana siguiente"}
          onClick={() => setAnchorDate((date) => moveAgendaAnchorDate(date, viewMode, 1))}
        >
          ›
        </button>
        <div className="week-view-toggle" role="group" aria-label="Vista de agenda">
          <button
            type="button"
            className={
              viewMode === "day" ? "week-view-option week-view-option-active" : "week-view-option"
            }
            aria-pressed={viewMode === "day"}
            onClick={() => setViewMode("day")}
          >
            Dia
          </button>
          <button
            type="button"
            className={
              viewMode === "week" ? "week-view-option week-view-option-active" : "week-view-option"
            }
            aria-pressed={viewMode === "week"}
            onClick={() => setViewMode("week")}
          >
            Semana
          </button>
        </div>
        <span className="meta week-range">{rangeLabel}</span>
        <label className="week-cancelled-toggle">
          <input
            type="checkbox"
            checked={showCancelled}
            onChange={(event) => setShowCancelled(event.currentTarget.checked)}
          />
          <span>Mostrar canceladas</span>
        </label>
      </div>

      <div className="week-grid" style={gridStyle}>
        <div className="week-head">
          <div className="week-head-corner" />
          {days.map((day, i) => {
            const dayNameIndex = (day.getDay() + 6) % 7;
            return (
              <div
                key={day.toISOString()}
                className={i === todayIndex ? "week-col-head week-col-today" : "week-col-head"}
              >
                <span className="week-col-day">{DAY_NAMES[dayNameIndex]}</span>
                <span className="week-col-date">{dayHeaderFormatter.format(day)}</span>
              </div>
            );
          })}
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
