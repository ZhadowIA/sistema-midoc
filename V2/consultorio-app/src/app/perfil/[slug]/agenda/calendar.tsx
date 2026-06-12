"use client";

interface CalendarProps {
  selectedDate: string;
  onDateSelect: (date: string) => void;
}

function getDaysInMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function getFirstDayOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
}

export function Calendar({ selectedDate, onDateSelect }: CalendarProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

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
    <div className="calendar-widget">
      <div className="calendar-header">
        <button className="calendar-nav-btn" onClick={handlePrevMonth} aria-label="Mes anterior">
          ◀
        </button>
        <h3 className="calendar-month">{monthName}</h3>
        <button className="calendar-nav-btn" onClick={handleNextMonth} aria-label="Próximo mes">
          ▶
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

          return (
            <button
              key={day}
              className={`day ${isSelected ? "selected" : ""} ${isPast ? "disabled" : ""}`}
              onClick={() => !isPast && handleDayClick(day)}
              disabled={isPast}
              aria-label={`${day} de ${monthName}${isSelected ? " (seleccionado)" : ""}`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
