import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeName,
  canonicalPair,
  expandClassRule,
  expandRuleset,
  toInteractionsCsv,
  toMedicationsCsv,
  toTriplesCsv,
  canonicalTriple,
  expandTripleRuleset,
  buildManifest,
  type ClassRule,
  type ClassMembers,
  type MedicationRow,
  type TripleRule
} from "./reference.ts";

// El pipeline debe producir EXACTAMENTE lo que el motor de Rust espera. Estas
// dos funciones espejan `normalize_name` y `canonical_pair` de medication.rs;
// si divergen, una interaccion no se encontraria al verificar la receta.
test("normalizeName colapsa espacios, pasa a minusculas y pliega acentos, como el motor Rust", () => {
  assert.equal(normalizeName("  Warfarina "), "warfarina");
  assert.equal(normalizeName("ACIDO   acetilsalicilico"), "acido acetilsalicilico");
  assert.equal(normalizeName("Enalapril\tMaleato"), "enalapril maleato");
  // Pliegue de diacriticos: debe coincidir con fold_diacritic de medication.rs.
  assert.equal(normalizeName("Losartán"), "losartan");
  assert.equal(normalizeName("Codeína"), "codeina");
  assert.equal(normalizeName("ÁCIDO Acetilsalicílico"), "acido acetilsalicilico");
  assert.equal(normalizeName("Niño"), "nino");
});

test("canonicalPair es independiente del orden", () => {
  assert.deepEqual(canonicalPair("warfarina", "ibuprofeno"), canonicalPair("ibuprofeno", "warfarina"));
  assert.deepEqual(canonicalPair("ibuprofeno", "warfarina"), ["ibuprofeno", "warfarina"]);
});

const AINE: string[] = ["ibuprofeno", "naproxeno", "diclofenaco"];
const ANTICOAGULANTES: string[] = ["warfarina"];

const members: ClassMembers = {
  AINE,
  Anticoagulante: ANTICOAGULANTES,
  IECA: ["enalapril", "lisinopril"],
  "Ahorrador de potasio": ["espironolactona", "amilorida"]
};

test("expandClassRule convierte una regla por clase en todos los pares de ingredientes", () => {
  const rule: ClassRule = {
    classA: "Anticoagulante",
    classB: "AINE",
    severity: "MAJOR",
    description: "Sangrado por uso concomitante."
  };
  const pairs = expandClassRule(rule, members, "ONChigh", "onc-2024");
  // 1 anticoagulante x 3 AINE = 3 pares.
  assert.equal(pairs.length, 3);
  for (const p of pairs) {
    assert.equal(p.severity, "MAJOR");
    assert.equal(p.source, "ONChigh");
    assert.equal(p.sourceVersion, "onc-2024");
    // Par canonico: a <= b.
    assert.ok(p.ingredientA <= p.ingredientB);
  }
  // La procedencia NO es DDInter (el punto del licenciamiento).
  assert.ok(pairs.every((p) => p.source === "ONChigh"));
});

test("expandClassRule excluye auto-pares cuando dos clases comparten un ingrediente", () => {
  const overlap: ClassMembers = {
    X: ["a", "b"],
    Y: ["b", "c"]
  };
  const rule: ClassRule = { classA: "X", classB: "Y", severity: "MODERATE", description: "x" };
  const pairs = expandClassRule(rule, overlap, "ONChigh", "onc-2024");
  // Pares posibles: a-b, a-c, b-b(descartado), b-c => 3 validos.
  assert.equal(pairs.length, 3);
  assert.ok(pairs.every((p) => p.ingredientA !== p.ingredientB));
});

test("expandRuleset deduplica y conserva la severidad mas alta en conflicto", () => {
  const rules: ClassRule[] = [
    { classA: "Anticoagulante", classB: "AINE", severity: "MODERATE", description: "moderada" },
    { classA: "Anticoagulante", classB: "AINE", severity: "MAJOR", description: "mayor" }
  ];
  const pairs = expandRuleset(rules, members, "ONChigh", "onc-2024");
  // Sigue habiendo 3 pares unicos (no 6), y todos con la severidad mas alta.
  assert.equal(pairs.length, 3);
  assert.ok(pairs.every((p) => p.severity === "MAJOR"));
  assert.ok(pairs.every((p) => p.description === "mayor"));
});

test("expandRuleset es determinista y esta ordenado (reproducibilidad)", () => {
  const rules: ClassRule[] = [
    { classA: "IECA", classB: "Ahorrador de potasio", severity: "MAJOR", description: "hiperpotasemia" },
    { classA: "Anticoagulante", classB: "AINE", severity: "MAJOR", description: "sangrado" }
  ];
  const a = expandRuleset(rules, members, "ONChigh", "onc-2024");
  const b = expandRuleset(rules, members, "ONChigh", "onc-2024");
  assert.deepEqual(a, b);
  // Orden canonico global por (ingredientA, ingredientB).
  const sorted = [...a].sort((x, y) =>
    x.ingredientA === y.ingredientA
      ? x.ingredientB.localeCompare(y.ingredientB)
      : x.ingredientA.localeCompare(y.ingredientA)
  );
  assert.deepEqual(a, sorted);
});

test("toInteractionsCsv emite encabezado con fuente y una fila por par", () => {
  const rule: ClassRule = { classA: "Anticoagulante", classB: "AINE", severity: "MAJOR", description: "sangrado" };
  const pairs = expandClassRule(rule, members, "ONChigh", "onc-2024");
  const csv = toInteractionsCsv(pairs);
  const lines = csv.trim().split("\n");
  assert.equal(lines[0], "ingredient_a,ingredient_b,severity,source,source_version,description");
  assert.equal(lines.length, pairs.length + 1);
  // Ninguna fila cita DDInter.
  assert.ok(!csv.toLowerCase().includes("ddinter"));
  // Las comas del texto se escapan para no romper el CSV.
  const withComma = toInteractionsCsv([
    { ingredientA: "a", ingredientB: "b", severity: "MAJOR", source: "ONChigh", sourceVersion: "v", description: "uno, dos" }
  ]);
  assert.ok(withComma.includes('"uno, dos"'));
});

test("canonicalTriple ordena las tres clases sin importar el orden de entrada", () => {
  assert.deepEqual(canonicalTriple("AINE", "IECA", "Diuretico"), ["AINE", "Diuretico", "IECA"]);
  assert.deepEqual(canonicalTriple("Diuretico", "AINE", "IECA"), canonicalTriple("IECA", "Diuretico", "AINE"));
});

test("expandTripleRuleset normaliza, deduplica y descarta clases repetidas", () => {
  const rules: TripleRule[] = [
    { classA: "IECA", classB: "Diuretico", classC: "AINE", severity: "MAJOR", description: "triple whammy" },
    // Misma tripleta en otro orden y menor severidad: se colapsa, gana MAJOR.
    { classA: "AINE", classB: "IECA", classC: "Diuretico", severity: "MODERATE", description: "dup" },
    // Clase repetida: invalida, se descarta.
    { classA: "AINE", classB: "AINE", classC: "IECA", severity: "MAJOR", description: "invalida" }
  ];
  const triples = expandTripleRuleset(rules, "ONChigh", "onc-2026");
  assert.equal(triples.length, 1);
  assert.equal(triples[0].severity, "MAJOR");
  assert.equal(triples[0].description, "triple whammy");
  assert.deepEqual([triples[0].classA, triples[0].classB, triples[0].classC], ["AINE", "Diuretico", "IECA"]);
  assert.equal(triples[0].source, "ONChigh");
});

test("toTriplesCsv emite el formato de clases con encabezado", () => {
  const triples = expandTripleRuleset(
    [{ classA: "IECA", classB: "Diuretico", classC: "AINE", severity: "MAJOR", description: "lesion renal aguda" }],
    "ONChigh",
    "onc-2026"
  );
  const lines = toTriplesCsv(triples).trim().split("\n");
  assert.equal(lines[0], "class_a,class_b,class_c,severity,source,source_version,description");
  assert.equal(lines[1], "AINE,Diuretico,IECA,MAJOR,ONChigh,onc-2026,lesion renal aguda");
});

test("toMedicationsCsv emite el formato name,ingredient,display_name,drug_class", () => {
  const rows: MedicationRow[] = [
    { name: "tempra", ingredient: "acetaminophen", displayName: "Paracetamol", drugClass: "Analgesico" }
  ];
  const csv = toMedicationsCsv(rows);
  const lines = csv.trim().split("\n");
  assert.equal(lines[0], "name,ingredient,display_name,drug_class");
  assert.equal(lines[1], "tempra,acetaminophen,Paracetamol,Analgesico");
});

test("buildManifest registra conteos, version y licencia por fuente", () => {
  const manifest = buildManifest({
    version: "onc-2024-07",
    medications: 10,
    interactions: 42,
    labels: 3,
    sources: [
      { name: "ONChigh", license: "Public Domain (ONC/RAND)", url: "https://…" },
      { name: "openFDA", license: "Public Domain (US Government)", url: "https://…" }
    ]
  });
  assert.equal(manifest.version, "onc-2024-07");
  assert.equal(manifest.counts.interactionRows, 42);
  assert.equal(manifest.counts.medicationRows, 10);
  // Toda fuente declara su licencia (compuerta legal del paso 25).
  assert.ok(manifest.sources.every((s) => s.license.length > 0));
  // Ninguna fuente es DDInter salvo permiso explicito.
  assert.ok(!manifest.sources.some((s) => s.name.toLowerCase().includes("ddinter")));
});
