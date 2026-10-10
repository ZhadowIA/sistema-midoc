// Exportar a PDF (paso 28 r4): Rust arma los datos, la interfaz dibuja el PDF y
// Rust abre "Guardar como", escribe el archivo y lo deja en la bitacora.

import { bytesToBase64 } from "./base64";
import { call } from "./ipc";
import { doctorHeader, suggestedName, type ExportKind, type RecordExport } from "./recordExportModel";

export interface ExportOutcome {
  /** null si el medico cancelo "Guardar como". */
  path: string | null;
  /** Faltan nombre o cedula del medico: se debe sincronizar con el portal. */
  missingDoctor: boolean;
}

export async function exportRecordPdf(
  patientId: string,
  kind: ExportKind,
  encounterId: string | null = null
): Promise<ExportOutcome> {
  const data = await call<RecordExport>("record_export", { patientId, encounterId });
  // pdf-lib pesa: se carga solo cuando el medico exporta.
  const { buildRecordPdf } = await import("./recordPdf");
  const bytes = await buildRecordPdf(data, kind);
  const saved = await call<{ path: string; sha256: string } | null>("save_export", {
    patientId,
    kind,
    suggestedName: suggestedName(data, kind),
    contentBase64: bytesToBase64(bytes)
  });
  return { path: saved?.path ?? null, missingDoctor: doctorHeader(data).missing };
}

export function exportMessage(outcome: ExportOutcome): string {
  if (!outcome.path) return "";
  const base = `PDF guardado en ${outcome.path}.`;
  return outcome.missingDoctor
    ? `${base} Falta tu nombre o cedula: completalos en tu cuenta MiDoc y sincroniza.`
    : base;
}
