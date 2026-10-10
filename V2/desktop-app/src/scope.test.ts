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
    "search",
    "transcription",
    "medications",
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
    "search",
    "reception",
    "transcription",
    "medications",
    "arco",
    "benchmark",
    "doctor-data"
  ]);
  assert.equal(isViewAvailable("reception", true), true);
});

test("ninguna seccion de la navegacion queda vacia con la bandera apagada", () => {
  for (const section of workspaceNav(false)) {
    assert.ok(section.items.length > 0, `seccion vacia: ${section.heading}`);
  }
});
