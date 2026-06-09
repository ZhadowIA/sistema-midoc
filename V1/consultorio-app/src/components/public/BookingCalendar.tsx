"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { addDays, format, startOfWeek, isToday } from "date-fns";
import { es } from "date-fns/locale";

type AvailableSlot = {
  startTime: string;
  endTime: string;
  isAvailable: boolean;
};

type DaySchedule = {
  date: string;
  slots: AvailableSlot[];
};

type SelectedSlot = {
  date: string;
  startTime: string;
  endTime: string;
} | null;

interface BookingCalendarProps {
  doctorId: string;
  durationMin: number;
  selectedSlot: SelectedSlot;
  onSelectSlot: (slot: SelectedSlot) => void;
}

export function BookingCalendar({
  doctorId,
  selectedSlot,
  onSelectSlot,
}: BookingCalendarProps) {
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [schedule, setSchedule] = useState<DaySchedule[]>([]);
  const [loading, setLoading] = useState(false);

  const loadWeekSchedule = useCallback(async (week: Date) => {
    setLoading(true);
    try {
      const from = week.toISOString().split("T")[0];
      const to = addDays(week, 6).toISOString().split("T")[0];
      const response = await fetch(
        `/api/public/doctor/${doctorId}/availability?from=${from}&to=${to}`,
        { cache: "no-store" }
      );
      if (!response.ok) throw new Error("Error loading availability");
      const data = await response.json();
      setSchedule(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [doctorId]);

  useEffect(() => {
    loadWeekSchedule(weekStart);
  }, [loadWeekSchedule, weekStart]);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <section className="rounded-3xl border border-border bg-card p-4 sm:p-6">
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-foreground sm:text-2xl">Horarios disponibles</h2>
            <p className="mt-1 text-sm text-muted-foreground">Elige un horario para continuar con la reserva.</p>
          </div>
          <div className="grid grid-cols-[44px_1fr_44px] gap-2 sm:flex">
            <button
              onClick={() => setWeekStart(addDays(weekStart, -7))}
              className="flex min-h-11 items-center justify-center rounded-xl border border-border hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary/40"
              aria-label="Semana anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
              className="min-h-11 rounded-xl border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              Hoy
            </button>
            <button
              onClick={() => setWeekStart(addDays(weekStart, 7))}
              className="flex min-h-11 items-center justify-center rounded-xl border border-border hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary/40"
              aria-label="Semana siguiente"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Week Grid */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}

        {!loading && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
            {days.map((day, idx) => {
              const daySchedule = schedule[idx];
              const dayLabel = format(day, "EEE", { locale: es });
              const dayNum = format(day, "d");
              const month = format(day, "MMM", { locale: es });
              const isTodayDate = isToday(day);

              return (
                <div key={day.toISOString()} className="rounded-2xl border border-border bg-background p-3 lg:border-0 lg:bg-transparent lg:p-0">
                  <div className={`mb-3 rounded-xl p-3 lg:text-center ${isTodayDate ? "bg-primary/10" : "bg-secondary/70"}`}>
                    <div className="flex items-center justify-between gap-2 lg:block">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">{dayLabel}</p>
                      {isTodayDate && <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground lg:hidden">Hoy</span>}
                    </div>
                    <p className="mt-1 text-xl font-bold text-foreground lg:text-lg">{dayNum}</p>
                    <p className="text-xs text-muted-foreground">{month}</p>
                  </div>

                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-2 lg:grid-cols-1">
                    {!daySchedule || daySchedule.slots.length === 0 ? (
                      <p className="col-span-full py-2 text-center text-xs text-muted-foreground">Sin horarios</p>
                    ) : (
                      daySchedule.slots.map((slot, slotIdx) => {
                        const isSelected =
                          selectedSlot?.date === day.toISOString().split("T")[0] &&
                          selectedSlot?.startTime === slot.startTime;

                        return (
                          <button
                            key={`${slot.startTime}-${slotIdx}`}
                            onClick={() => {
                              if (slot.isAvailable) {
                                onSelectSlot({
                                  date: day.toISOString().split("T")[0],
                                  startTime: slot.startTime,
                                  endTime: slot.endTime,
                                });
                              }
                            }}
                            disabled={!slot.isAvailable}
                            className={`min-h-11 rounded-xl px-2 py-2 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                              isSelected
                                ? "bg-primary text-primary-foreground"
                                : slot.isAvailable
                                  ? "bg-primary/10 text-primary hover:bg-primary/20"
                                  : "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
                            }`}
                          >
                            {format(new Date(`2000-01-01T${slot.startTime}`), "HH:mm")}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="rounded-2xl bg-secondary/50 p-3 text-xs leading-5 text-muted-foreground">
          Los horarios son tentativos. El consultorio puede ajustar la cita según disponibilidad clínica.
        </p>
      </div>
    </section>
  );
}
