import assert from "node:assert/strict";
import test from "node:test";

import { daysOpen, isStale, noteSummary, openedLabel } from "./workQueues.ts";

const now = new Date(2026, 9, 18, 10, 0, 0);

test("cuenta los dias abiertos por fecha local, no por horas", () => {
  assert.equal(daysOpen(new Date(2026, 9, 18, 0, 5).toISOString(), now), 0);
  assert.equal(daysOpen(new Date(2026, 9, 17, 23, 55).toISOString(), now), 1);
  assert.equal(daysOpen(new Date(2026, 9, 10, 12, 0).toISOString(), now), 8);
  assert.equal(daysOpen("no es fecha", now), 0);
});

test("rotula la apertura en palabras", () => {
  assert.equal(openedLabel(new Date(2026, 9, 18, 8).toISOString(), now), "Abierta hoy");
  assert.equal(openedLabel(new Date(2026, 9, 17, 8).toISOString(), now), "Abierta ayer");
  assert.equal(openedLabel(new Date(2026, 9, 15, 8).toISOString(), now), "Abierta hace 3 dias");
});

test("resume lo escrito en la nota", () => {
  assert.equal(noteSummary({ diagnosis: " Faringitis ", has_note: true }), "Dx: Faringitis");
  assert.equal(noteSummary({ diagnosis: "", has_note: true }), "Nota sin diagnostico");
  assert.equal(noteSummary({ diagnosis: "", has_note: false }), "Sin nota");
});

test("una consulta de otro dia se marca como pendiente de firmar", () => {
  assert.equal(isStale(new Date(2026, 9, 18, 8).toISOString(), now), false);
  assert.equal(isStale(new Date(2026, 9, 17, 8).toISOString(), now), true);
});
