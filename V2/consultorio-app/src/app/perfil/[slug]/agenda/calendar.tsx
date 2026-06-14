"use client";

import { IconChevronLeft, IconChevronRight } from "../icons";

interface CalendarProps {
  selectedDate: string;
  onDateSelect: (date: string) => void;
  /**
   * Fechas (YYYY-MM-DD) con cupo real del medico. Si se provee, solo esos dias
   * (y no pasados) son seleccionables; el resto se muestra deshabilitado. Si es
   * `undefined`, todos los dias futuros quedan habilitados (sin filtro de cupo).
   */
  availableDays?: string[];
  /** Mientras se consultan los dias disponibles del mes visible. */
  loading?: boolean;
}

function getDaysInMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function getFirstDayOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
}

export function Calendar({ selectedDate, onDateSelect, availableDays, loading }: CalendarProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const availableSet = availableDays ? new Set(availableDays) : null;

  const selected = new Date(selectedDate);
  selected.setHours(0, 0, 0, 0);

  const currentDate = new Date(selected);
  const daysInMonth = getDaysInMonth(currentDate);
  const firstDay = getFirstDayOfMonth(currentDate);

  const monthName = currentDate.toLocaleString("es-MX", { month: "long", year: "numeric" });
  const dayNames = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

  const days = [];
  for (let i = 0; i < firstDay; i++) {
    days.push(null);
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i);
  }

  const handlePrevMonth = () => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() - 1);
    onDateSelect(newDate.toISOString().slice(0, 10));
  };

  const handleNextMonth = () => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + 1);
    onDateSelect(newDate.toISOString().slice(0, 10));
  };

  const handleDayClick = (day: number) => {
    const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    onDateSelect(newDate.toISOString().slice(0, 10));
  };

  return (
    <div className={`calendar-widget ${loading ? "is-loading" : ""}`} aria-busy={loading || undefined}>
      <div className="calendar-header">
        <button className="calendar-nav-btn" onClick={handlePrevMonth} aria-label="Mes anterior" type="button">
          <IconChevronLeft />
        </button>
        <h3 className="calendar-month">{monthName}</h3>
        <button className="calendar-nav-btn" onClick={handleNextMonth} aria-label="Próximo mes" type="button">
          <IconChevronRight />
        </button>
      </div>

      <div className="calendar-weekdays">
        {dayNames.map((day) => (
          <div key={day} className="weekday">
            {day}
          </div>
        ))}
      </div>

      <div className="calendar-days">
        {days.map((day, index) => {
          if (day === null) {
            return <div key={`empty-${index}`} className="day empty" />;
          }

          const dayDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
          const dateString = dayDate.toISOString().slice(0, 10);
          const isSelected = dateString === selectedDate;
          const isPast = dayDate < today;
          // Sin lista de dias disponibles no se filtra por cupo. Con lista, un
          // dia futuro fuera de ella esta sin cupo (regla/excepcion/lleno).
          const isUnavailable = !isPast && availableSet !== null && !availableSet.has(dateString);
          const isDisabled = isPast || isUnavailable;

          return (
            <button
              key={day}
              className={`day ${isSelected ? "selected" : ""} ${isPast ? "disabled" : ""} ${
                isUnavailable ? "unavailable" : ""
              }`}
              onClick={() => !isDisabled && handleDayClick(day)}
              disabled={isDisabled}
              aria-label={`${day} de ${monthName}${isSelected ? " (seleccionado)" : ""}${
                isUnavailable ? " (sin disponibilidad)" : ""
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>

      {availableSet !== null ? (
        <p className="calendar-legend">
          {loading
            ? "Cargando disponibilidad…"
            : availableSet.size === 0
              ? "Sin días disponibles este mes. Prueba otro mes."
              : "Solo se muestran activos los días con horarios disponibles."}
        </p>
      ) : null}
    </div>
  );
}
