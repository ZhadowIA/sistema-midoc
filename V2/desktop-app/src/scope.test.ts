import assert from "node:assert/strict";
import test from "node:test";
import { defaultView, isViewAvailable, parseFrozenScopeFlag, workspaceNav } from "./scope.ts";

function navIds(frozenScope: boolean) {
  return workspaceNav(frozenScope).flatMap((section) => section.items.map((item) => item.id));
}

test("la bandera del alcance congelado esta apagada salvo un 'on' explicito", () => {
  assert.equal(parseFrozenScopeFlag(undefined), false);
  assert.equal(parseFrozenScopeFlag(""), false);
  assert.equal(parseFrozenScopeFlag("true"), false);
  assert.equal(parseFrozenScopeFlag("off"), false);
  assert.equal(parseFrozenScopeFlag("on"), true);
  assert.equal(parseFrozenScopeFlag(" ON "), true);
});

test("con la bandera apagada la app abre en Pacientes y no ofrece agenda ni recepcion", () => {
  assert.equal(defaultView(false), "patients");
  assert.deepEqual(navIds(false), [
    "patients",
    "open-encounters",
    "search",
    "transcription",
    "arco",
    "benchmark",
    "doctor-data"
  ]);
  assert.equal(isViewAvailable("agenda", false), false);
  assert.equal(isViewAvailable("reception", false), false);
});

test("con la bandera encendida vuelve la navegacion previa al reenfoque", () => {
  assert.equal(defaultView(true), "agenda");
  assert.deepEqual(navIds(true), [
    "agenda",
    "patients",
    "open-encounters",
    "search",
    "reception",
    "transcription",
    "arco",
    "benchmark",
    "doctor-data"
  ]);
  assert.equal(isViewAvailable("reception", true), true);
});

test("Medicamentos solo aparece con la revision de seguridad encendida", () => {
  const ids = (medicationSafety?: boolean) =>
    workspaceNav(false, { medicationSafety }).flatMap((section) => section.items.map((item) => item.id));
  assert.ok(!ids(undefined).includes("medications"), "apagada si no se sabe");
  assert.ok(!ids(false).includes("medications"));
  assert.ok(ids(true).includes("medications"));
  assert.equal(isViewAvailable("medications", true), false, "el alcance congelado no la enciende");
  assert.equal(isViewAvailable("medications", false, { medicationSafety: true }), true);
});

test("el laboratorio solo aparece con el perfil odontologico", () => {
  const ids = (dental: boolean) =>
    workspaceNav(false, { dental }).flatMap((section) => section.items.map((item) => item.id));
  assert.ok(!ids(false).includes("lab-orders"));
  assert.deepEqual(ids(true).slice(0, 4), ["patients", "open-encounters", "lab-orders", "search"]);
});

test("ninguna seccion de la navegacion queda vacia con la bandera apagada", () => {
  for (const section of workspaceNav(false)) {
    assert.ok(section.items.length > 0, `seccion vacia: ${section.heading}`);
  }
});
