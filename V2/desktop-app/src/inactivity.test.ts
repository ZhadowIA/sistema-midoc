import assert from "node:assert/strict";
import { mock, test } from "node:test";

import { holdAwake, inactivityLabel, INACTIVITY_LOCK_CHOICES, isHeldAwake, watchInactivity } from "./inactivity.ts";

const MINUTE = 60_000;

test("bloquea tras el tiempo sin actividad, y la actividad reinicia la cuenta", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const target = new EventTarget();
    let idle = 0;
    const stop = watchInactivity({ target, timeoutMs: 30 * MINUTE, onIdle: () => (idle += 1) });

    mock.timers.tick(29 * MINUTE);
    target.dispatchEvent(new Event("keydown"));
    mock.timers.tick(29 * MINUTE);
    assert.equal(idle, 0, "la tecla reinicio la cuenta");

    mock.timers.tick(1 * MINUTE + 1);
    assert.equal(idle, 1);

    // Ya bloqueada, la actividad no la vuelve a disparar.
    target.dispatchEvent(new Event("pointermove"));
    mock.timers.tick(60 * MINUTE);
    assert.equal(idle, 1);
    stop();
  } finally {
    mock.timers.reset();
  }
});

test("una grabacion en curso retiene la app despierta", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const target = new EventTarget();
    let idle = 0;
    const release = holdAwake();
    assert.equal(isHeldAwake(), true);
    const stop = watchInactivity({ target, timeoutMs: 5 * MINUTE, onIdle: () => (idle += 1) });

    mock.timers.tick(45 * MINUTE);
    assert.equal(idle, 0, "dictar 45 minutos sin tocar nada no bloquea");

    release();
    release();
    assert.equal(isHeldAwake(), false, "soltar dos veces no descuenta de mas");
    mock.timers.tick(5 * MINUTE + 1);
    assert.equal(idle, 1);
    stop();
  } finally {
    mock.timers.reset();
  }
});

test("dejar de vigilar cancela el bloqueo pendiente", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    let idle = 0;
    const stop = watchInactivity({ target: new EventTarget(), timeoutMs: MINUTE, onIdle: () => (idle += 1) });
    stop();
    mock.timers.tick(10 * MINUTE);
    assert.equal(idle, 0);
  } finally {
    mock.timers.reset();
  }
});

test("las opciones coinciden con las del proceso nativo y se rotulan en palabras", () => {
  assert.deepEqual([...INACTIVITY_LOCK_CHOICES], [0, 5, 10, 15, 30, 60, 120]);
  assert.equal(inactivityLabel(0), "Desactivado");
  assert.equal(inactivityLabel(30), "30 minutos");
  assert.equal(inactivityLabel(60), "1 hora");
  assert.equal(inactivityLabel(120), "2 horas");
});
