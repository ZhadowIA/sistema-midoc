import { describe, expect, it } from "vitest";

import * as escritorio from "../../../desktop-app/src/medicalHistoryFormat";
import * as portal from "../../src/lib/medical-history";

/**
 * Guarda contra la deriva del cuestionario de antecedentes, que vive por
 * duplicado: este modulo define lo que el paciente contesta y
 * `desktop-app/src/medicalHistoryFormat.ts` es el espejo con que el medico lo
 * lee y lo edita. Sin paquete comun, la unica defensa es comparar los dos
 * modulos de verdad.
 *
 * Tiene que coincidir todo lo que cambia el significado de una respuesta: los
 * grupos, a quien van y para que sexo; las claves de campo, su tipo, los
 * valores de sus opciones y cuando se muestran; y el catalogo heredo-familiar.
 * Las etiquetas NO: el portal le pregunta al paciente ("Eres diabetico") y el
 * escritorio rotula para el medico ("Es diabetico").
 *
 * Vive en el portal porque su CI instala las dependencias de ambos lados (el
 * contrato del portal importa `zod`); el espejo del escritorio no importa nada.
 */

interface Campo {
  tipo: string;
  opciones: string[];
  mostrarSi: string | null;
}

function campo(field: {
  kind?: string;
  options?: Array<{ value: string }>;
  showWhen?: { field: string; equals: string | string[] };
}): Campo {
  return {
    // En el espejo, un campo sin `kind` se edita como texto.
    tipo: field.kind ?? "text",
    opciones: (field.options ?? []).map((option) => option.value),
    mostrarSi: field.showWhen ? JSON.stringify(field.showWhen) : null
  };
}

const gruposPortal = new Map(portal.MEDICAL_HISTORY_GROUPS.map((group) => [group.key, group]));
const gruposEscritorio = new Map(escritorio.MEDICAL_HISTORY_GROUPS.map((group) => [group.key, group]));

describe("espejo del cuestionario de antecedentes en el escritorio", () => {
  it("declara los mismos grupos, en el mismo orden", () => {
    expect([...gruposEscritorio.keys()]).toEqual([...gruposPortal.keys()]);
  });

  it("cada grupo va a la misma audiencia y al mismo sexo", () => {
    for (const [key, group] of gruposPortal) {
      const espejo = gruposEscritorio.get(key);
      expect(espejo?.audience ?? "both", `${key}: audiencia`).toBe(group.audience ?? "both");
      expect(espejo?.onlyForSex ?? null, `${key}: sexo`).toBe(group.onlyForSex ?? null);
    }
  });

  it("cada campo tiene la misma clave, tipo, opciones y condicion", () => {
    for (const [key, group] of gruposPortal) {
      const esperado = Object.fromEntries(portal.groupFields(group).map((field) => [field.key, campo(field)]));
      const espejo = Object.fromEntries(
        (gruposEscritorio.get(key)?.fields ?? []).map((field) => [field.key, campo(field)])
      );
      expect(espejo, `el grupo "${key}" difiere entre lo que contesta el paciente y lo que ve el medico`).toEqual(
        esperado
      );
    }
  });

  it("ningun campo se repite dentro de su grupo", () => {
    for (const group of portal.MEDICAL_HISTORY_GROUPS) {
      const keys = portal.groupFields(group).map((field) => field.key);
      expect(new Set(keys).size, `portal: ${group.key}`).toBe(keys.length);
    }
    for (const group of escritorio.MEDICAL_HISTORY_GROUPS) {
      const keys = group.fields.map((field) => field.key);
      expect(new Set(keys).size, `escritorio: ${group.key}`).toBe(keys.length);
    }
  });

  it("el catalogo heredo-familiar coincide", () => {
    expect(escritorio.FAMILY_CONDITIONS.map((c) => [c.key, Boolean(c.hasType)])).toEqual(
      portal.FAMILY_CONDITIONS.map((c) => [c.key, Boolean(c.hasType)])
    );
    expect(Object.keys(escritorio.FAMILY_RELATIVES)).toEqual(portal.FAMILY_RELATIVES.map((r) => r.value));
  });

  it("las etiquetas pueden diferir: cada lado le habla a su audiencia", () => {
    const etiqueta = (fields: Array<{ key: string; label: string }>) =>
      fields.find((field) => field.key === "diabetico")?.label;
    expect(etiqueta(portal.groupFields(gruposPortal.get("pathological")!))).toBe("Eres diabetico");
    expect(etiqueta(gruposEscritorio.get("pathological")!.fields)).toBe("Es diabetico");
  });
});
