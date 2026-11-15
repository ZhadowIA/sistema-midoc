//! Genera el catalogo CNIS que empaqueta la app para codificar medicamentos en
//! el FHIR (decision del 2026-10-19).
//!
//! Corre fuera de la app: `npm run cnis:build`. Descarga el Compendio Nacional
//! de Insumos para la Salud que publica el Consejo de Salubridad General, lo
//! pasa a texto con `pdftotext -layout` (poppler; viene con Git para Windows) y
//! escribe:
//!   - src-tauri/src/reference_data/cnis.csv            (claves de medicamentos)
//!   - src-tauri/src/reference_data/cnis.manifest.json  (fuente, conteos, checksum)
//! El compendio es referencia publica, no PHI.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCnisText, toCsv } from "./catalog.ts";

const EDITION = "2025-04-26";
const PDF_URL = "https://www.csg.gob.mx/Comp26042025.pdf";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "..", "src-tauri", "src", "reference_data");

async function main(): Promise<void> {
  const work = mkdtempSync(join(tmpdir(), "midoc-cnis-"));
  try {
    const response = await fetch(PDF_URL, { headers: { "User-Agent": "Mozilla/5.0 (MiDoc cnis build)" } });
    if (!response.ok) throw new Error(`csg.gob.mx respondio ${response.status}`);
    const pdf = Buffer.from(await response.arrayBuffer());
    const pdfPath = join(work, "cnis.pdf");
    const textPath = join(work, "cnis.txt");
    writeFileSync(pdfPath, pdf);
    execFileSync("pdftotext", ["-layout", "-enc", "UTF-8", pdfPath, textPath]);
    const entries = parseCnisText(readFileSync(textPath, "utf8"));
    const csv = toCsv(entries);
    const codable = entries.filter((e) => e.complete && e.packages === 1).length;
    const manifest = {
      version: `cnis-${EDITION}`,
      generatedAt: new Date().toISOString(),
      source: {
        name: "Compendio Nacional de Insumos para la Salud, Consejo de Salubridad General",
        edition: `Edicion publicada en el DOF el ${EDITION}; no incluye las actualizaciones posteriores`,
        url: PDF_URL,
        pdfSha256: createHash("sha256").update(pdf).digest("hex"),
        license:
          "Documento oficial publicado en el Diario Oficial de la Federacion; sin derechos de autor (Ley Federal del Derecho de Autor, art. 14, fr. VIII)",
        changes:
          "Solo medicamentos (grupo 010.000). Por clave: producto, generico, forma, concentracion del principio activo y numero de envases del producto; lo que no se pudo leer sin ambiguedad queda marcado como incompleto y no se codifica."
      },
      entries: entries.length,
      complete: entries.filter((e) => e.complete).length,
      codable,
      sha256: createHash("sha256").update(csv, "utf8").digest("hex")
    };
    writeFileSync(join(outDir, "cnis.csv"), csv, "utf8");
    writeFileSync(join(outDir, "cnis.manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    console.log(
      `CNIS ${EDITION}: ${entries.length} claves, ${manifest.complete} completas, ${codable} codificables (un solo envase).`
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

await main();
