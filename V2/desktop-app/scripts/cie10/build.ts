//! Genera el catalogo CIE-10 que empaqueta la app (paso 28, rebanada 2).
//!
//! Corre fuera de la app: `npm run cie10:build`. Descarga el "Catalogo CIE-10"
//! que publica la Secretaria de Salud en datos.gob.mx (mantenido por el
//! Hospital Juarez de Mexico, licencia CC BY 4.0) por el API de datos, porque el
//! archivo directo rechaza clientes sin navegador. Escribe:
//!   - src-tauri/src/reference_data/cie10.csv            (codigos vigentes)
//!   - src-tauri/src/reference_data/cie10.manifest.json  (fuente, licencia, conteo, checksum)
//! El catalogo es referencia publica, no PHI.

import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { toCsv, toEntries, type RawCie10Row } from "./catalog.ts";

const DATASET_URL = "https://www.datos.gob.mx/dataset/catalogo_cie_10";
const RESOURCE_ID = "8e99b4f4-9b12-4e6a-9379-4bcb7a9cd69e";
const API = "https://www.datos.gob.mx/api/3/action/datastore_search";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "..", "src-tauri", "src", "reference_data");

async function fetchAllRows(): Promise<RawCie10Row[]> {
  const rows: RawCie10Row[] = [];
  let offset = 0;
  for (;;) {
    const url = `${API}?resource_id=${RESOURCE_ID}&limit=5000&offset=${offset}`;
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (MiDoc cie10 build)" } });
    if (!response.ok) throw new Error(`datos.gob.mx respondio ${response.status}`);
    const body = (await response.json()) as { result: { records: RawCie10Row[]; total: number } };
    rows.push(...body.result.records);
    offset += body.result.records.length;
    if (body.result.records.length === 0 || offset >= body.result.total) return rows;
  }
}

async function main(): Promise<void> {
  const raw = await fetchAllRows();
  const entries = toEntries(raw);
  const csv = toCsv(entries);
  const manifest = {
    version: `cie10-mx-${new Date().toISOString().slice(0, 10)}`,
    generatedAt: new Date().toISOString(),
    source: {
      name: "Catalogo CIE-10, Secretaria de Salud (mantenido por el Hospital Juarez de Mexico)",
      url: DATASET_URL,
      license: "Creative Commons Attribution 4.0 (CC BY 4.0)",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      changes:
        "Solo codigos vigentes (VALID = SI) y no borrados (RUBRICA_TYPE distinto de B); se conservan clave, nombre, sexo, limites de edad y validez en consulta externa."
    },
    rawRows: raw.length,
    entries: entries.length,
    sha256: createHash("sha256").update(csv, "utf8").digest("hex")
  };
  writeFileSync(join(outDir, "cie10.csv"), csv, "utf8");
  writeFileSync(join(outDir, "cie10.manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`CIE-10: ${raw.length} filas -> ${entries.length} codigos vigentes (${manifest.version}).`);
}

await main();
