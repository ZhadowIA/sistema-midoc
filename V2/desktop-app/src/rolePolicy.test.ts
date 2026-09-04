import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTIVITY_EVENTS,
  INACTIVITY_LOCK_MS,
  allowedViewsForRole,
  coerceRole,
  defaultViewForRole,
  isDoctor,
  roleLabel,
  viewAllowedForRole
} from "./rolePolicy.ts";

test("un rol desconocido o ausente se trata como recepción (menor privilegio)", () => {
  assert.equal(coerceRole(undefined), "RECEPCION");
  assert.equal(coerceRole(null), "RECEPCION");
  assert.equal(coerceRole("ADMIN"), "RECEPCION");
  assert.equal(coerceRole("DOCTOR"), "DOCTOR");
  assert.equal(isDoctor("DOCTOR"), true);
  assert.equal(isDoctor("RECEPCION"), false);
});

test("recepción solo ve Recepción y caja; el médico ve todo", () => {
  assert.deepEqual(allowedViewsForRole("RECEPCION"), ["reception"]);
  assert.equal(defaultViewForRole("RECEPCION"), "reception");
  assert.equal(defaultViewForRole("DOCTOR"), "agenda");
  for (const view of ["agenda", "patients", "arco", "transcription", "medications", "benchmark"] as const) {
    assert.equal(viewAllowedForRole("RECEPCION", view), false, view);
    assert.equal(viewAllowedForRole("DOCTOR", view), true, view);
  }
  assert.equal(viewAllowedForRole("RECEPCION", "reception"), true);
});

test("etiquetas y bloqueo por inactividad", () => {
  assert.equal(roleLabel("DOCTOR"), "Médico");
  assert.equal(roleLabel("RECEPCION"), "Recepción");
  assert.equal(INACTIVITY_LOCK_MS, 10 * 60_000);
  assert.ok(ACTIVITY_EVENTS.includes("keydown"));
  assert.ok(ACTIVITY_EVENTS.includes("pointerdown"));
});
