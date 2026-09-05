import assert from "node:assert/strict";
import test from "node:test";

import { MEDICAL_HISTORY_GROUPS as ESCRITORIO } from "./medicalHistoryFormat.ts";
import {
  MEDICAL_HISTORY_GROUPS as PORTAL,
  groupFields
} from "../../consultorio-app/src/lib/medical-history.ts";

/**
 * Guarda contra la deriva del cuestionario de antecedentes, que vive por
 * duplicado: el portal define lo que el paciente contesta y el escritorio el
 * espejo con que el medico lo lee. Las dos apps no comparten paquete todavia
 * (ver nota abajo), asi que la unica defensa contra que se separen es esta
 * prueba, que **importa los dos modulos de verdad** y los compara.
 *
 * Lo que tiene que coincidir: los **grupos** y las **claves de campo**. Si el
 * portal gana un campo y el espejo no, el paciente lo contesta y el medico
 * nunca lo ve — esa es la falla silenciosa que esto impide.
 *
 * Lo que NO tiene que coincidir: las **etiquetas**. El portal le pregunta al
 * paciente en segunda persona ("Eres diabetico") y el escritorio rotula para el
 * medico ("Es diabetico"). Es una diferencia de audiencia, deliberada.
 *
 * Camino a futuro (paquete G de la remediacion 2026-09-03): mover el contrato a
 * `V2/shared/` como paquete comun. No se hizo aqui porque el contenedor del
 * portal se construye con `V2/consultorio-app` como contexto de build, asi que
 * un import fuera de esa carpeta rompe la imagen: mover el contrato exige mover
 * tambien el contexto del Dockerfile y el despliegue, y eso no se toca a ciegas.
 */

type CampoPlano = { key: string; label: string };

function camposDelPortal(): Map<string, CampoPlano[]> {
  return new Map(
    PORTAL.map((grupo) => [
      grupo.key,
      groupFields(grupo).map((campo) => ({ key: campo.key, label: campo.label }))
    ])
  );
}

function camposDelEscritorio(): Map<string, CampoPlano[]> {
  return new Map(
    ESCRITORIO.map((grupo) => [
      grupo.key,
      grupo.fields.map((campo) => ({ key: campo.key, label: campo.label }))
    ])
  );
}

test("los dos lados declaran los mismos grupos de antecedentes", () => {
  const portal = [...camposDelPortal().keys()].sort();
  const escritorio = [...camposDelEscritorio().keys()].sort();

  assert.deepEqual(escritorio, portal);
});

test("cada grupo tiene las mismas claves de campo en ambos lados", () => {
  const portal = camposDelPortal();
  const escritorio = camposDelEscritorio();

  for (const [grupo, campos] of portal) {
    const claves = campos.map((campo) => campo.key).sort();
    const espejo = (escritorio.get(grupo) ?? []).map((campo) => campo.key).sort();

    assert.deepEqual(
      espejo,
      claves,
      `el grupo "${grupo}" difiere: el paciente contestaria campos que el medico no ve, o al reves`
    );
  }
});

test("ningun campo se repite dentro de su grupo", () => {
  for (const [lado, mapa] of [
    ["portal", camposDelPortal()],
    ["escritorio", camposDelEscritorio()]
  ] as const) {
    for (const [grupo, campos] of mapa) {
      const claves = campos.map((campo) => campo.key);
      assert.equal(
        new Set(claves).size,
        claves.length,
        `${lado}: el grupo "${grupo}" repite una clave de campo`
      );
    }
  }
});

test("las etiquetas pueden diferir: cada lado le habla a su audiencia", () => {
  // No es un detalle cosmetico: si algun dia se unificaran las etiquetas, el
  // formulario del paciente empezaria a hablarle en tercera persona. Esta
  // prueba deja constancia de que la diferencia es intencional.
  const portal = camposDelPortal().get("pathological") ?? [];
  const escritorio = camposDelEscritorio().get("pathological") ?? [];

  const enPortal = portal.find((campo) => campo.key === "diabetico");
  const enEscritorio = escritorio.find((campo) => campo.key === "diabetico");

  assert.equal(enPortal?.label, "Eres diabetico");
  assert.equal(enEscritorio?.label, "Es diabetico");
});
