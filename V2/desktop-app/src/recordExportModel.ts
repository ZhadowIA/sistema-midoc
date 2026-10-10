// Contenido de los PDF del expediente (paso 28, rebanada 4), como lista de
// bloques independiente del dibujo. Puro y probable sin pdf-lib.

import { displayCode, type CodedDiagnosis } from "./cie10Model.ts";
import { categoryLabel } from "./documentsModel.ts";
import { shortHash } from "./pdfText.ts";

export type ExportKind = "PDF_CONSULTA" | "PDF_EXPEDIENTE";

export interface RecordExport {
  generated_at: string;
  doctor: { name: string | null; license: string | null };
  patient: {
    id: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    email: string | null;
    birth_date: string | null;
    allergies: string | null;
    medical_background: string | null;
    family_background: string | null;
    is_minor: boolean;
    guardian: { name: string; relationship: string | null } | null;
  };
  sex: string | null;
  encounters: Array<{
    id: string;
    opened_at: string;
    status: string;
    signed_at: string | null;
    signed_hash: string | null;
    note_version: number | null;
    note: {
      subjective: string;
      objective: string;
      assessment: string;
      plan: string;
      diagnosis: string;
      instructions: string;
      coded_diagnoses?: CodedDiagnosis[];
    } | null;
    prescription: string | null;
  }>;
  documents: Array<{
    file_name: string;
    title: string | null;
    category: string | null;
    received_at: string;
    encounter_id: string | null;
    sha256: string | null;
  }>;
}

export type Block =
  | { type: "title"; text: string }
  | { type: "heading"; text: string }
  | { type: "meta"; text: string }
  | { type: "field"; label: string; text: string }
  | { type: "warning"; text: string }
  | { type: "signature"; lines: string[] }
  | { type: "spacer" };

const dateTime = new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeStyle: "short" });
const dateOnly = new Intl.DateTimeFormat("es-MX", { dateStyle: "long", timeZone: "UTC" });

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : dateTime.format(date);
}

function formatBirthDate(raw: string): string {
  const date = new Date(`${raw.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? raw : dateOnly.format(date);
}

export function ageInYears(birthDate: string | null, today: Date): number | null {
  if (!birthDate) return null;
  const [y, m, d] = birthDate.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  let age = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age -= 1;
  return age >= 0 ? age : null;
}

const SEX_LABELS: Record<string, string> = { F: "Femenino", M: "Masculino", O: "Otro" };

export function patientName(data: RecordExport): string {
  return `${data.patient.first_name} ${data.patient.last_name}`.trim();
}

/** Encabezado de cada pagina: medico y cedula, o el aviso de que faltan. */
export function doctorHeader(data: RecordExport): { lines: string[]; missing: boolean } {
  const name = data.doctor.name?.trim();
  const license = data.doctor.license?.trim();
  return {
    lines: [name || "Médico sin nombre registrado", license ? `Cédula profesional ${license}` : "Cédula profesional no registrada"],
    missing: !name || !license
  };
}

function codedLine(d: CodedDiagnosis): string {
  return `${displayCode(d.code)}  ${d.name}${d.principal ? "  (principal)" : ""}`;
}

function encounterBlocks(encounter: RecordExport["encounters"][number], kind: ExportKind): Block[] {
  const blocks: Block[] = [{ type: "heading", text: `Consulta del ${formatDateTime(encounter.opened_at)}` }];
  if (encounter.status === "SIGNED" && encounter.signed_at) {
    blocks.push({
      type: "meta",
      text: `Firmada el ${formatDateTime(encounter.signed_at)} · nota versión ${encounter.note_version ?? "-"} · huella ${shortHash(
        encounter.signed_hash
      )}`
    });
  } else {
    blocks.push({
      type: "warning",
      text: "Consulta abierta: la nota no está firmada y puede cambiar."
    });
  }

  const note = encounter.note;
  const field = (label: string, text: string | null | undefined) => {
    if (text && text.trim()) blocks.push({ type: "field", label, text: text.trim() });
  };
  if (note) {
    field("Subjetivo", note.subjective);
    field("Objetivo", note.objective);
    field("Análisis", note.assessment);
    const coded = note.coded_diagnoses ?? [];
    const diagnosisText = [...coded.map(codedLine), note.diagnosis.trim()].filter(Boolean).join("\n");
    field(coded.length > 0 ? "Diagnóstico (CIE-10)" : "Diagnóstico", diagnosisText);
    field("Plan", note.plan);
    field("Indicaciones", note.instructions);
  }
  field("Receta", encounter.prescription);
  if (!note && !encounter.prescription) {
    blocks.push({ type: "meta", text: "Sin nota registrada." });
  }
  if (kind === "PDF_CONSULTA") {
    blocks.push({ type: "signature", lines: [] });
  }
  blocks.push({ type: "spacer" });
  return blocks;
}

/** Bloques del PDF de una consulta o del expediente completo. */
export function buildBlocks(data: RecordExport, kind: ExportKind, today = new Date()): Block[] {
  const blocks: Block[] = [];
  const p = data.patient;
  const age = ageInYears(p.birth_date, today);
  const identity = [
    p.birth_date ? `Nacimiento: ${formatBirthDate(p.birth_date)}${age !== null ? ` (${age} años)` : ""}` : null,
    data.sex ? `Sexo: ${SEX_LABELS[data.sex] ?? data.sex}` : null,
    p.phone ? `Tel: ${p.phone}` : null
  ]
    .filter(Boolean)
    .join(" · ");

  blocks.push({ type: "title", text: kind === "PDF_CONSULTA" ? "Nota de consulta" : "Expediente clínico" });
  blocks.push({ type: "field", label: "Paciente", text: patientName(data) });
  if (identity) blocks.push({ type: "meta", text: identity });
  if (p.guardian) {
    blocks.push({
      type: "meta",
      text: `Responsable: ${p.guardian.name}${p.guardian.relationship ? ` (${p.guardian.relationship})` : ""}`
    });
  }
  blocks.push({ type: "field", label: "Alergias", text: p.allergies?.trim() || "No referidas" });
  if (kind === "PDF_EXPEDIENTE") {
    if (p.medical_background?.trim()) blocks.push({ type: "field", label: "Antecedentes personales", text: p.medical_background.trim() });
    if (p.family_background?.trim()) blocks.push({ type: "field", label: "Antecedentes familiares", text: p.family_background.trim() });
  }
  blocks.push({ type: "spacer" });

  if (data.encounters.length === 0) {
    blocks.push({ type: "meta", text: "El expediente no tiene consultas con nota." });
  }
  for (const encounter of data.encounters) blocks.push(...encounterBlocks(encounter, kind));

  if (data.documents.length > 0) {
    blocks.push({ type: "heading", text: kind === "PDF_CONSULTA" ? "Documentos de la consulta" : "Documentos del expediente" });
    for (const doc of data.documents) {
      blocks.push({
        type: "field",
        label: categoryLabel(doc.category),
        text: `${doc.title ?? doc.file_name}${doc.title ? ` (${doc.file_name})` : ""} · ${formatDateTime(doc.received_at)}${
          doc.sha256 ? ` · huella ${shortHash(doc.sha256)}` : ""
        }`
      });
    }
    blocks.push({
      type: "meta",
      text: "Los archivos no se incluyen en este PDF; viven cifrados en el expediente del médico."
    });
  }
  return blocks;
}

export function footerText(data: RecordExport, page: number, pages: number): string {
  return `Generado con MiDoc el ${formatDateTime(data.generated_at)} · ${patientName(data)} · Página ${page} de ${pages}`;
}

export function suggestedName(data: RecordExport, kind: ExportKind): string {
  const day = data.generated_at.slice(0, 10);
  const who = patientName(data);
  return kind === "PDF_CONSULTA" ? `Consulta ${who} ${day}` : `Expediente ${who} ${day}`;
}
