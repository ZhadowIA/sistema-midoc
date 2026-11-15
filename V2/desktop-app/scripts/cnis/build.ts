//! Genera el catalogo CNIS que empaqueta la app para codificar medicamentos en
//! el FHIR (decision del 2026-10-19).
//!
//! Corre fuera de la app: `npm run cnis:build`. Descarga el Compendio Nacional
//! de Insumos para la Salud que publica el Consejo de Salubridad General, lo
//! pasa a texto con `pdftotext -layout` (poppler; viene con Git para Windows) y
//! aplica las correcciones revisadas de `correcciones.csv`, muestra que cambia
//! contra la tabla anterior y escribe:
//!   - src-tauri/src/reference_data/cnis.csv            (claves de medicamentos; fuente de verdad)
//!   - src-tauri/src/reference_data/cnis.manifest.json  (fuente, conteos, checksum)
//!   - scripts/contraindications/propuestas.csv          (texto de contraindicaciones, para revisar)
//! El compendio es referencia publica, no PHI.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { proposalsCsv } from "../contraindications/catalog.ts";
import {
  allKeys,
  applyCorrections,
  contraindicationTexts,
  diffTables,
  parseCnisText,
  parseCorrections,
  toCsv
} from "./catalog.ts";

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
    const text = readFileSync(textPath, "utf8");
    const corrections = parseCorrections(readFileSync(join(here, "correcciones.csv"), "utf8"));
    const entries = applyCorrections(parseCnisText(text), corrections, allKeys(text));
    const csv = toCsv(entries);
    const complete = entries.filter((e) => e.complete);
    const codable = complete.filter((e) => e.packages === 1).length;
    const products = new Set(complete.map((e) => e.product)).size;
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
          "Solo medicamentos (grupos 010, 020, 030 y 040). Por clave y generico (una fila por alternativa): producto, forma, concentracion, unidades del envase y numero de envases del producto; lo que no se pudo leer sin ambiguedad queda marcado como incompleto y no se codifica. Las correcciones escritas a mano (correcciones.csv) llevan motivo y revisor."
      },
      entries: entries.length,
      complete: complete.length,
      completeProducts: products,
      corrections: corrections.length,
      codable,
      sha256: createHash("sha256").update(csv, "utf8").digest("hex")
    };
    // La tabla del repositorio es la fuente de verdad: se muestra lo que cambia
    // para revisarlo en el PR antes de aceptar una edicion nueva.
    const csvPath = join(outDir, "cnis.csv");
    if (existsSync(csvPath)) {
      const diff = diffTables(readFileSync(csvPath, "utf8"), csv);
      console.log(`Contra la tabla anterior: ${diff.added.length} nuevas, ${diff.removed.length} retiradas, ${diff.changed.length} cambiadas.`);
      for (const [label, keys] of Object.entries(diff)) {
        for (const key of keys.slice(0, 40)) console.log(`  ${label}: ${key}`);
        if (keys.length > 40) console.log(`  ${label}: ... y ${keys.length - 40} mas`);
      }
    }
    writeFileSync(csvPath, csv, "utf8");
    // Materia prima de las reglas medicamento contra padecimiento (etapa 5).
    const proposals = contraindicationTexts(text);
    writeFileSync(join(here, "..", "contraindications", "propuestas.csv"), proposalsCsv(proposals), "utf8");
    writeFileSync(join(outDir, "cnis.manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    console.log(
      `CNIS ${EDITION}: ${entries.length} filas, ${complete.length} completas (${products} productos), ${corrections.length} correcciones, ${codable} con clave completa sin cantidad.`
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

await main();
