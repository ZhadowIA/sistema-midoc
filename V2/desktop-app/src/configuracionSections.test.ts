import assert from "node:assert/strict";
import { test } from "node:test";
import {
  configuracionSections,
  resolveConfiguracionSection,
  type ConfiguracionSectionId
} from "./configuracionSections.ts";

test("agrupa en Configuración todo lo que salió del menú lateral", () => {
  const ids = configuracionSections({ canOpenPortal: true }).map((section) => section.id);
  assert.deepEqual(ids, [
    "apariencia",
    "servicios",
    "transcripcion",
    "medicamentos",
    "arco",
    "benchmark"
  ]);
});

test("sin URL de portal no ofrece servicios y precios", () => {
  const ids = configuracionSections({ canOpenPortal: false }).map((section) => section.id);
  assert.ok(!ids.includes("servicios"));
  assert.ok(ids.includes("apariencia"));
});

test("cae a la primera sección cuando la actual deja de estar disponible", () => {
  const available = configuracionSections({ canOpenPortal: false });
  assert.equal(resolveConfiguracionSection("servicios", available), "apariencia");
  assert.equal(resolveConfiguracionSection("arco", available), "arco");
});

test("cada sección se identifica y describe para el médico", () => {
  for (const section of configuracionSections({ canOpenPortal: true })) {
    assert.ok(section.label.length > 0, `sin etiqueta: ${section.id}`);
    assert.ok(section.description.length > 0, `sin descripción: ${section.id}`);
  }
});

test("los identificadores no se repiten", () => {
  const ids = configuracionSections({ canOpenPortal: true }).map(
    (section): ConfiguracionSectionId => section.id
  );
  assert.equal(new Set(ids).size, ids.length);
});
