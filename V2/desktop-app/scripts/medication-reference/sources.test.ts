import { test } from "node:test";
import assert from "node:assert/strict";
import { expandRuleset, expandTripleRuleset, normalizeName } from "./reference.ts";
import { BASE_MEDICATIONS, CLASS_MEMBERS, ONCHIGH_RULES, SOURCES, TRIPLE_RULES } from "./sources.ts";

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

// --- Decisiones clinicas del medico (2026-07-07): fijadas para que no se
// reviertan en silencio. Cada assert corresponde a un ajuste pedido. ---

const clinicalPairs = expandRuleset(ONCHIGH_RULES, CLASS_MEMBERS, "ONChigh", "test");
function pair(a: string, b: string) {
  const [x, y] = [a, b].sort();
  return clinicalPairs.find((p) => p.ingredientA === x && p.ingredientB === y);
}

test("aspirina salio de AINE: no alerta con metotrexato, pero si con anticoagulante", () => {
  // Aspirina + metotrexato ya NO dispara (era el falso positivo a evitar).
  assert.equal(pair("aspirin", "methotrexate"), undefined);
  // Aspirina + warfarina SIGUE alertando, via Anticoagulante + Antiplaquetario.
  assert.equal(pair("aspirin", "warfarin")?.severity, "MAJOR");
  // Un AINE real + metotrexato si dispara.
  assert.equal(pair("ibuprofen", "methotrexate")?.severity, "MAJOR");
});

test("estatinas divididas: simva/lova CONTRAINDICATED, atorva MAJOR", () => {
  assert.equal(pair("simvastatin", "clarithromycin")?.severity, "CONTRAINDICATED");
  assert.equal(pair("lovastatin", "itraconazole")?.severity, "CONTRAINDICATED");
  assert.equal(pair("atorvastatin", "clarithromycin")?.severity, "MAJOR");
});

test("alopurinol/febuxostat + tiopurina es CONTRAINDICATED", () => {
  assert.equal(pair("allopurinol", "azathioprine")?.severity, "CONTRAINDICATED");
  assert.equal(pair("febuxostat", "mercaptopurine")?.severity, "CONTRAINDICATED");
});

test("IECA/ARA2 + AINE alerta como MAJOR (frecuente en primer nivel)", () => {
  assert.equal(pair("enalapril", "ibuprofen")?.severity, "MAJOR");
  assert.equal(pair("losartan", "naproxen")?.severity, "MAJOR");
  // Pero NO con aspirina (ya no es AINE): evita ruido con cardioproteccion.
  assert.equal(pair("enalapril", "aspirin"), undefined);
});

test("linezolid conserva su alerta CONTRAINDICATED con serotoninergicos", () => {
  assert.equal(pair("linezolid", "fluoxetine")?.severity, "CONTRAINDICATED");
  assert.equal(pair("linezolid", "tramadol")?.severity, "CONTRAINDICATED");
});

test("las reglas triple usan clases existentes con miembros en la base", () => {
  const triples = expandTripleRuleset(TRIPLE_RULES, "ONChigh", "test");
  assert.ok(triples.length >= 2, "faltan las reglas de triple whammy");
  const knownIngredientsSet = new Set(BASE_MEDICATIONS.map((m) => normalizeName(m.ingredient)));
  const drugClassHasMember = (className: string) =>
    (CLASS_MEMBERS[className] ?? []).some((ing) => knownIngredientsSet.has(normalizeName(ing)));
  for (const t of triples) {
    for (const cls of [t.classA, t.classB, t.classC]) {
      assert.ok(CLASS_MEMBERS[cls]?.length, `clase de tripleta sin miembros: ${cls}`);
      assert.ok(drugClassHasMember(cls), `clase ${cls} sin ingrediente en la base`);
    }
    assert.equal(t.severity, "MAJOR");
  }
  // Cubre las dos piernas IECA y ARA2 del triple whammy.
  assert.ok(triples.some((t) => [t.classA, t.classB, t.classC].includes("IECA")));
  assert.ok(triples.some((t) => [t.classA, t.classB, t.classC].includes("ARA2")));
});
