import {
  getEncounterAgendaAppointments,
  type EncounterAgendaAppointment
} from "./encounterAgenda";

const timeFormatter = new Intl.DateTimeFormat("es-MX", {
  hour: "2-digit",
  minute: "2-digit"
});

const dayFormatter = new Intl.DateTimeFormat("es-MX", {
  weekday: "long",
  day: "numeric",
  month: "long"
});

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmada",
  COMPLETED: "Atendida"
};

export function EncounterAgendaRail({
  appointments,
  currentAppointmentId,
  appointmentStart,
  busy,
  onSelectAppointment
}: {
  appointments: EncounterAgendaAppointment[];
  currentAppointmentId: string | null;
  appointmentStart: string | null;
  busy: boolean;
  onSelectAppointment: (appointmentId: string) => void;
}) {
  const dayAppointments = getEncounterAgendaAppointments(appointments, appointmentStart);
  const referenceDate = appointmentStart ? new Date(appointmentStart) : new Date();
  const validReferenceDate = Number.isNaN(referenceDate.getTime()) ? new Date() : referenceDate;

  return (
    <aside className="encounter-agenda" aria-label="Agenda del dia">
      <div className="encounter-agenda-header">
        <span>Agenda del día</span>
        <strong>{dayFormatter.format(validReferenceDate)}</strong>
      </div>

      {dayAppointments.length === 0 ? (
        <p className="context-empty">No hay otras citas para este día.</p>
      ) : (
        <ol className="encounter-agenda-list">
          {dayAppointments.map((appointment) => {
            const isCurrent = appointment.id === currentAppointmentId;
            return (
              <li key={appointment.id}>
                <button
                  type="button"
                  className={
                    isCurrent
                      ? "encounter-agenda-item encounter-agenda-item-current"
                      : "encounter-agenda-item"
                  }
                  aria-current={isCurrent ? "true" : undefined}
                  disabled={busy || isCurrent}
                  onClick={() => onSelectAppointment(appointment.id)}
                >
                  <span className="encounter-agenda-time">
                    {timeFormatter.format(new Date(appointment.scheduled_start))}
                  </span>
                  <span className="encounter-agenda-patient">{appointment.patient_name}</span>
                  <span className="encounter-agenda-service">
                    {appointment.service_name ?? "Consulta"}
                  </span>
                  <span className="encounter-agenda-status">
                    {isCurrent
                      ? "En consulta"
                      : STATUS_LABELS[appointment.status] ?? appointment.status}
                    {appointment.has_precheckin ? " · Preconsulta" : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}
