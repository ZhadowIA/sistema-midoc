//! Emisor de artefactos del pipeline (paso 25, rebanada 1).
//!
//! Corre fuera de la app: `node scripts/medication-reference/build.ts`.
//! Genera en ./build/ los tres artefactos en el formato del paso 25:
//!   - interactions.csv  (pares canonicos con procedencia real)
//!   - medications.csv   (name,ingredient,display_name,drug_class)
//!   - manifest.json     (version, licencia por fuente, conteos, checksums)
//!
//! NO sobrescribe la base viva (src-tauri/src/reference_data/): esa sustitucion
//! (y retirar los pares DDInter de la semilla) es la rebanada 3, tras revision.

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildManifest,
  expandRuleset,
  expandTripleRuleset,
  toInteractionsCsv,
  toMedicationsCsv,
  toTriplesCsv
} from "./reference.ts";
import { BASE_MEDICATIONS, CLASS_MEMBERS, ONCHIGH_RULES, SOURCES, TRIPLE_RULES } from "./sources.ts";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "build");

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function main(): void {
  const version = process.argv[2] ?? `onchigh-${new Date().toISOString().slice(0, 10)}`;

  const pairs = expandRuleset(ONCHIGH_RULES, CLASS_MEMBERS, "ONChigh", version);
  const triples = expandTripleRuleset(TRIPLE_RULES, "ONChigh", version);
  const interactionsCsv = toInteractionsCsv(pairs);
  const triplesCsv = toTriplesCsv(triples);
  const medicationsCsv = toMedicationsCsv(BASE_MEDICATIONS);

  const manifest = {
    ...buildManifest({
      version,
      medications: BASE_MEDICATIONS.length,
      interactions: pairs.length,
      labels: 0,
      sources: SOURCES
    }),
    triples: triples.length,
    checksums: {
      interactionsCsv: sha256(interactionsCsv),
      triplesCsv: sha256(triplesCsv),
      medicationsCsv: sha256(medicationsCsv)
    }
  };

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "interactions.csv"), interactionsCsv);
  writeFileSync(join(outDir, "triples.csv"), triplesCsv);
  writeFileSync(join(outDir, "medications.csv"), medicationsCsv);
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

  process.stdout.write(
    `Base de medicamentos generada (version ${version}):\n` +
      `  ${BASE_MEDICATIONS.length} medicamentos\n` +
      `  ${pairs.length} interacciones de par (expandidas por clase desde ONChigh)\n` +
      `  ${triples.length} interacciones de tripleta de clases (triple whammy)\n` +
      `  fuentes: ${SOURCES.map((s) => s.name).join(", ")}\n` +
      `  salida: ${outDir}\n`
  );
}

main();
