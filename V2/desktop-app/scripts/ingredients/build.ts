//! Genera el catalogo de ingredientes canonicos (paso 33, etapa 2).
//!
//! Corre fuera de la app: `npm run ingredients:build`. No usa red: lee la tabla
//! del CNIS y la base de interacciones que ya viven en el repositorio, mas los
//! sinonimos revisados de `sinonimos.csv`, y escribe:
//!   - src-tauri/src/reference_data/ingredients.csv            (lo que lee la app)
//!   - src-tauri/src/reference_data/ingredients.manifest.json  (conteos y checksum)
//!   - scripts/ingredients/por-revisar.csv                     (nombres para el farmaceutico)
//! Todo es referencia publica, no PHI.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseBrands } from "../brands/catalog.ts";
import { buildIngredients, parseSynonyms, reviewCsv, toCsv } from "./catalog.ts";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "..", "src-tauri", "src", "reference_data");

const cnisCsv = readFileSync(join(dataDir, "cnis.csv"), "utf8");
const medicationsCsv = readFileSync(join(dataDir, "medications.csv"), "utf8");
const synonyms = parseSynonyms(readFileSync(join(here, "sinonimos.csv"), "utf8"));
const built = buildIngredients(cnisCsv, medicationsCsv, synonyms);
const { ingredients, conflicts } = built;
// Las marcas que ya estan en el nucleo revisado (etapa 3) no se vuelven a pedir.
const reviewedBrands = new Set(parseBrands(readFileSync(join(here, "..", "brands", "marcas.csv"), "utf8")).map((b) => b.name));
const review = built.review.filter((r) => !reviewedBrands.has(r.name));

const csv = toCsv(ingredients);
const linked = ingredients.filter((i) => i.cnis && i.interactionKey).length;
const manifest = {
  version: `ingredientes-${new Date().toISOString().slice(0, 10)}`,
  generatedAt: new Date().toISOString(),
  sources: {
    cnis: JSON.parse(readFileSync(join(dataDir, "cnis.manifest.json"), "utf8")).version,
    interactions: JSON.parse(readFileSync(join(dataDir, "manifest.json"), "utf8")).version,
    reviewedSynonyms: synonyms.length
  },
  ingredients: ingredients.length,
  cnis: ingredients.filter((i) => i.cnis).length,
  withInteractionData: ingredients.filter((i) => i.interactionKey).length,
  cnisLinkedToInteractions: linked,
  pendingReview: review.length,
  conflicts,
  sha256: createHash("sha256").update(csv, "utf8").digest("hex")
};
writeFileSync(join(dataDir, "ingredients.csv"), csv, "utf8");
writeFileSync(join(dataDir, "ingredients.manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
writeFileSync(join(here, "por-revisar.csv"), reviewCsv(review), "utf8");
console.log(
  `Ingredientes: ${ingredients.length} (${manifest.cnis} del CNIS, ${manifest.withInteractionData} con datos de interacciones, ${linked} ligados entre ambos). ` +
    `${synonyms.length} sinonimos revisados, ${review.length} nombres por revisar, ${conflicts.length} en conflicto.`
);
if (conflicts.length) console.log(`  En conflicto (apuntaban a dos ingredientes): ${conflicts.join(", ")}`);
