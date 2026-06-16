import assert from "node:assert/strict";
import {
  filterAgendaAppointments,
  getAgendaVisibleDays,
  moveAgendaAnchorDate
} from "../src/weekAgendaFilters.ts";

const appointments = [
  { id: "active", status: "CONFIRMED" },
  { id: "cancelled", status: "CANCELLED" },
  { id: "pending", status: "PENDING" }
];

assert.deepEqual(
  filterAgendaAppointments(appointments, false).map((appointment) => appointment.id),
  ["active", "pending"],
  "oculta citas canceladas por defecto"
);

assert.deepEqual(
  filterAgendaAppointments(appointments, true).map((appointment) => appointment.id),
  ["active", "cancelled", "pending"],
  "muestra citas canceladas cuando el medico activa el checkbox"
);

const wednesday = new Date(2026, 5, 17);

assert.deepEqual(
  getAgendaVisibleDays(wednesday, "week").map((day) => day.toISOString().slice(0, 10)),
  [
    "2026-06-15",
    "2026-06-16",
    "2026-06-17",
    "2026-06-18",
    "2026-06-19",
    "2026-06-20",
    "2026-06-21"
  ],
  "la vista semanal muestra la semana completa iniciando en lunes"
);

assert.deepEqual(
  getAgendaVisibleDays(wednesday, "day").map((day) => day.toISOString().slice(0, 10)),
  ["2026-06-17"],
  "la vista diaria muestra solo el dia seleccionado"
);

assert.equal(
  moveAgendaAnchorDate(wednesday, "day", 1).toISOString().slice(0, 10),
  "2026-06-18",
  "la navegacion diaria avanza de un dia"
);

assert.equal(
  moveAgendaAnchorDate(wednesday, "week", 1).toISOString().slice(0, 10),
  "2026-06-24",
  "la navegacion semanal avanza de siete dias"
);
