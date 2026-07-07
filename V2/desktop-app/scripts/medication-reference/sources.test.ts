import { test } from "node:test";
import assert from "node:assert/strict";
import { expandRuleset, normalizeName } from "./reference.ts";
import { BASE_MEDICATIONS, CLASS_MEMBERS, ONCHIGH_RULES, SOURCES } from "./sources.ts";

const knownIngredients = new Set(BASE_MEDICATIONS.map((m) => normalizeName(m.ingredient)));

test("todo ingrediente de una clase existe en la base (autoconsistencia)", () => {
  const missing: string[] = [];
  for (const [className, members] of Object.entries(CLASS_MEMBERS)) {
    for (const ingredient of members) {
      if (!knownIngredients.has(normalizeName(ingredient))) {
        missing.push(`${className}:${ingredient}`);
      }
    }
  }
  assert.deepEqual(missing, [], `ingredientes sin fila en BASE_MEDICATIONS: ${missing.join(", ")}`);
});

test("cada regla ONChigh referencia clases que existen y tienen miembros", () => {
  for (const rule of ONCHIGH_RULES) {
    assert.ok(CLASS_MEMBERS[rule.classA]?.length, `clase sin miembros: ${rule.classA}`);
    assert.ok(CLASS_MEMBERS[rule.classB]?.length, `clase sin miembros: ${rule.classB}`);
  }
});

test("la expansion produce pares reconocibles por el motor", () => {
  const pairs = expandRuleset(ONCHIGH_RULES, CLASS_MEMBERS, "ONChigh", "test");
  assert.ok(pairs.length > 0);
  for (const p of pairs) {
    assert.ok(knownIngredients.has(p.ingredientA), `ingrediente desconocido: ${p.ingredientA}`);
    assert.ok(knownIngredients.has(p.ingredientB), `ingrediente desconocido: ${p.ingredientB}`);
    assert.ok(["CONTRAINDICATED", "MAJOR", "MODERATE", "MINOR"].includes(p.severity));
  }
});

test("un mismo nombre no apunta a ingredientes distintos (sin ambiguedad)", () => {
  const byName = new Map<string, string>();
  for (const m of BASE_MEDICATIONS) {
    const name = normalizeName(m.name);
    const ingredient = normalizeName(m.ingredient);
    const prev = byName.get(name);
    assert.ok(prev === undefined || prev === ingredient, `nombre ambiguo: ${name} -> ${prev} y ${ingredient}`);
    byName.set(name, ingredient);
  }
});

test("nitrato + inhibidor PDE5 se expande como CONTRAINDICATED", () => {
  const pairs = expandRuleset(ONCHIGH_RULES, CLASS_MEMBERS, "ONChigh", "test");
  const [a, b] = ["nitroglycerin", "sildenafil"].sort();
  const found = pairs.find((p) => p.ingredientA === a && p.ingredientB === b);
  assert.ok(found, "falta el par nitroglicerina + sildenafil");
  assert.equal(found?.severity, "CONTRAINDICATED");
});

test("las fuentes declaradas son de dominio publico y ninguna es DDInter", () => {
  assert.ok(SOURCES.length > 0);
  assert.ok(SOURCES.every((s) => /public domain/i.test(s.license)));
  assert.ok(!SOURCES.some((s) => /ddinter/i.test(s.name)));
});
