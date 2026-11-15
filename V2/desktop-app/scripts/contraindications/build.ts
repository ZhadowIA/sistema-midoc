//! Genera las reglas medicamento contra padecimiento (paso 33, etapa 5).
//!
//! Corre fuera de la app, sin red: `npm run contraindications:build` (despues de
//! `npm run ingredients:build`). Lee `reglas.csv` (solo reglas revisadas), las
//! valida contra los catalogos de ingredientes y CIE-10 y escribe:
//!   - src-tauri/src/reference_data/contraindications.csv            (lo que lee la app)
//!   - src-tauri/src/reference_data/contraindications.manifest.json  (conteos y checksum)
//! Las propuestas (`propuestas.csv`) las escribe `npm run cnis:build`.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseRules, toCsv, validateRules } from "./catalog.ts";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "..", "src-tauri", "src", "reference_data");

const rules = validateRules(
  parseRules(readFileSync(join(here, "reglas.csv"), "utf8")),
  readFileSync(join(dataDir, "ingredients.csv"), "utf8"),
  readFileSync(join(dataDir, "cie10.csv"), "utf8")
);
const csv = toCsv(rules);
const manifest = {
  version: `contraindicaciones-${new Date().toISOString().slice(0, 10)}`,
  generatedAt: new Date().toISOString(),
  rules: rules.length,
  contraindicated: rules.filter((r) => r.severity === "CONTRAINDICADA").length,
  reviewers: [...new Set(rules.map((r) => r.reviewedBy))].sort(),
  sha256: createHash("sha256").update(csv, "utf8").digest("hex")
};
writeFileSync(join(dataDir, "contraindications.csv"), csv, "utf8");
writeFileSync(join(dataDir, "contraindications.manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Reglas revisadas: ${rules.length} (${manifest.contraindicated} contraindicaciones).`);
