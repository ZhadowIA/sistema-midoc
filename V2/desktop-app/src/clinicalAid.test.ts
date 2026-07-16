import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { compatibilityLabel, parseAiOverload, splitAidSegments } from "./clinicalAid.ts";
import type { SegmentDraft, TemplateSegment } from "./consultationScribe.ts";

test("traduce niveles de compatibilidad sin porcentajes", () => {
  assert.equal(compatibilityLabel("HIGH"), "Alta");
  assert.equal(compatibilityLabel("MEDIUM"), "Media");
  assert.equal(compatibilityLabel("LOW"), "Baja");
});

test("detecta la sobrecarga estructurada del proveedor y solo esa", () => {
  const overload = parseAiOverload(
    '{"code":"ai_overloaded","provider":"gemini-direct","model":"gemini-3-flash","message":"Gemini esta sobrecargado (503)"}'
  );
  assert.deepEqual(overload, {
    provider: "gemini-direct",
    model: "gemini-3-flash",
    message: "Gemini esta sobrecargado (503)"
  });

  // Los errores planos NO se tratan como sobrecarga: van al banner normal.
  assert.equal(parseAiOverload("Gemini rechazo la solicitud: 400"), null);
  assert.equal(parseAiOverload('{"code":"otro"}'), null);
  assert.equal(parseAiOverload("{json invalido"), null);
  assert.equal(parseAiOverload(new Error("falla generica")), null);

  // Campos faltantes degradan a texto seguro en lugar de romper el diálogo.
  const partial = parseAiOverload('{"code":"ai_overloaded"}');
  assert.equal(partial?.provider, "desconocido");
  assert.ok(partial?.message);
});

function segmentDraft(segmentId: string): SegmentDraft {
  return {
    segment_id: segmentId,
    content: `contenido de ${segmentId}`,
    confidence: "high",
    source_turns: [],
    warnings: []
  };
}

function templateSegment(id: string, label: string, target: string): TemplateSegment {
  return { id, label, target, instructions: "", required: false };
}

test("separa segmentos de plantilla y de especialidad segun su target", () => {
  const template: TemplateSegment[] = [
    templateSegment("subjective", "S - Subjetivo", "subjective"),
    templateSegment("general_risk_factors", "Factores de riesgo", "specialty.riskFactors"),
    templateSegment("general_follow_up", "Seguimiento", "specialty.followUp")
  ];
  const groups = splitAidSegments(
    [segmentDraft("subjective"), segmentDraft("general_risk_factors"), segmentDraft("general_follow_up")],
    template
  );

  assert.deepEqual(
    groups.template.map((item) => item.label),
    ["S - Subjetivo"]
  );
  assert.deepEqual(
    groups.specialty.map((item) => item.label),
    ["Factores de riesgo", "Seguimiento"]
  );
  assert.equal(groups.specialty[0]?.segment.segment_id, "general_risk_factors");
});

test("un segmento sin definicion en la plantilla cae al grupo de plantilla con su id como etiqueta", () => {
  const groups = splitAidSegments(
    [segmentDraft("segmento_desconocido")],
    [templateSegment("subjective", "S - Subjetivo", "subjective")]
  );

  assert.equal(groups.specialty.length, 0);
  assert.equal(groups.template.length, 1);
  assert.equal(groups.template[0]?.label, "segmento_desconocido");
});

test("los resultados de la Ayuda IA se organizan en pestañas, no en un listado con scroll", () => {
  const source = readFileSync(new URL("./ClinicalAidRail.tsx", import.meta.url), "utf8");

  // El panel de resultados usa la fila de pestañas y la particion plantilla/especialidad.
  assert.match(source, /tab-row/);
  assert.match(source, /splitAidSegments/);

  // Las cinco vistas pedidas por el medico: plantilla, especialidad,
  // posibilidades clinicas, sugerencias de consulta y tratamiento.
  for (const tab of ["plantilla", "especialidad", "posibilidades", "sugerencias", "tratamiento"]) {
    assert.match(source, new RegExp(`"${tab}"`));
  }
});

test("la Ayuda IA es una ruta de la consulta, no un riel lateral", () => {
  const source = readFileSync(new URL("./Atencion.tsx", import.meta.url), "utf8");

  // Ya no debe existir el riel de contexto a la derecha: la asistencia migró a
  // una ruta más dentro del centro de la consulta.
  assert.doesNotMatch(source, /consultation-context-rail/);

  // El ClinicalAidRail se renderiza cuando la ruta activa es "ayuda".
  assert.match(
    source,
    /resolvedSection === "ayuda" \?[\s\S]*?<ClinicalAidRail/
  );
});

test("el paso 21 expone el editor local de plantillas personalizadas", () => {
  const source = readFileSync(new URL("./ClinicalAidRail.tsx", import.meta.url), "utf8");
  assert.match(source, /ConsultationTemplateEditor/);
  const editor = readFileSync(new URL("./ConsultationTemplateEditor.tsx", import.meta.url), "utf8");
  assert.match(editor, /Guardar plantilla/);
  assert.match(editor, /Instrucciones para IA/);
  assert.match(editor, /required/);
});
