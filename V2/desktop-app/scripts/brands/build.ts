//! Genera el nucleo curado de marcas (paso 33, etapa 3).
//!
//! Corre fuera de la app, sin red: `npm run brands:build` (despues de
//! `npm run ingredients:build`). Lee `marcas.csv` (solo marcas revisadas), las
//! valida contra el catalogo de ingredientes y escribe:
//!   - src-tauri/src/reference_data/brands.csv            (lo que lee la app)
//!   - src-tauri/src/reference_data/brands.manifest.json  (conteo y checksum)
//! Es referencia publica, no PHI.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseBrands, toCsv, validateBrands } from "./catalog.ts";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "..", "src-tauri", "src", "reference_data");

const brands = validateBrands(
  parseBrands(readFileSync(join(here, "marcas.csv"), "utf8")),
  readFileSync(join(dataDir, "ingredients.csv"), "utf8")
);
const csv = toCsv(brands);
const manifest = {
  version: `marcas-${new Date().toISOString().slice(0, 10)}`,
  generatedAt: new Date().toISOString(),
  brands: brands.length,
  combinations: brands.filter((b) => b.ingredients.length > 1).length,
  sha256: createHash("sha256").update(csv, "utf8").digest("hex")
};
writeFileSync(join(dataDir, "brands.csv"), csv, "utf8");
writeFileSync(join(dataDir, "brands.manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Marcas revisadas: ${brands.length} (${manifest.combinations} combinaciones).`);
