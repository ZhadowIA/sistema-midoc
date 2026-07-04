import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getEncounterAgendaAppointments,
  hasEncounterDraftChanges,
  shouldConfirmEncounterSwitch
} from "../src/encounterAgenda.ts";

const appointments = [
  {
    id: "late",
    status: "CONFIRMED",
    scheduled_start: "2026-06-18T17:00:00-06:00"
  },
  {
    id: "other-day",
    status: "CONFIRMED",
    scheduled_start: "2026-06-19T09:00:00-06:00"
  },
  {
    id: "cancelled",
    status: "CANCELLED",
    scheduled_start: "2026-06-18T12:00:00-06:00"
  },
  {
    id: "early",
    status: "PENDING",
    scheduled_start: "2026-06-18T09:00:00-06:00"
  }
];

assert.deepEqual(
  getEncounterAgendaAppointments(appointments, "2026-06-18T10:30:00-06:00").map(
    (appointment) => appointment.id
  ),
  ["early", "late"],
  "el riel muestra las citas no canceladas del dia de la consulta, ordenadas por hora"
);

assert.equal(
  shouldConfirmEncounterSwitch({
    currentAppointmentId: "current",
    targetAppointmentId: "next",
    signed: false,
    hasUnsavedChanges: false
  }),
  true,
  "cambiar una consulta abierta sin firmar requiere confirmacion aunque no haya cambios locales"
);

assert.equal(
  shouldConfirmEncounterSwitch({
    currentAppointmentId: "current",
    targetAppointmentId: "current",
    signed: false,
    hasUnsavedChanges: true
  }),
  false,
  "seleccionar la cita actual no requiere confirmacion"
);

assert.equal(
  shouldConfirmEncounterSwitch({
    currentAppointmentId: "current",
    targetAppointmentId: "next",
    signed: true,
    hasUnsavedChanges: true
  }),
  false,
  "una consulta firmada no tiene borradores editables que proteger"
);

const persistedDraft = {
  note: { subjective: "Dolor dental", specialty: { teeth: [] } },
  prescription: "Paracetamol",
  background: { allergies: "Penicilina" }
};

assert.equal(
  hasEncounterDraftChanges(persistedDraft, persistedDraft),
  false,
  "un borrador igual al persistido no se considera modificado"
);

assert.equal(
  hasEncounterDraftChanges(
    { ...persistedDraft, prescription: "Ibuprofeno" },
    persistedDraft
  ),
  true,
  "un cambio local en la receta se detecta antes de cambiar de paciente"
);

const agendaRail = readFileSync(
  new URL("../src/EncounterAgendaRail.tsx", import.meta.url),
  "utf8"
);
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const atencion = readFileSync(new URL("../src/Atencion.tsx", import.meta.url), "utf8");

assert.ok(
  agendaRail.includes('aria-label="Agenda del dia"'),
  "el riel debe identificarse como agenda del dia para lectores de pantalla"
);
assert.ok(
  agendaRail.includes('aria-current={isCurrent ? "true" : undefined}'),
  "la cita actual debe exponerse semanticamente"
);
assert.ok(
  app.includes("onSelectAppointment={(appointmentId) =>"),
  "App debe conectar el riel con el flujo existente para iniciar consultas"
);
assert.ok(
  atencion.includes("window.confirm("),
  "Atencion debe confirmar antes de abandonar cambios locales sin guardar"
);

console.log("encounter-agenda.test.mjs OK");
