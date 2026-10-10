// Modelo puro de los documentos del expediente (paso 28, rebanada 1). La
// decision final sobre el tipo la toma Rust por la firma del archivo; aqui solo
// se filtra antes de leer el archivo, para avisar rapido y no mandar por IPC
// algo que de todos modos se rechazaria.

export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

export const ACCEPTED_DOCUMENT_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

const ACCEPTED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".webp"];

/** Valor del atributo `accept` del selector de archivos. */
export const DOCUMENT_INPUT_ACCEPT = [...ACCEPTED_DOCUMENT_TYPES, ...ACCEPTED_EXTENSIONS].join(",");

export type DocumentCategory = "LABORATORIO" | "IMAGEN" | "REFERENCIA" | "CONSENTIMIENTO" | "OTRO";

export const DOCUMENT_CATEGORIES: Array<{ value: DocumentCategory; label: string }> = [
  { value: "LABORATORIO", label: "Laboratorio" },
  { value: "IMAGEN", label: "Imagen o radiografia" },
  { value: "REFERENCIA", label: "Referencia o interconsulta" },
  { value: "CONSENTIMIENTO", label: "Consentimiento" },
  { value: "OTRO", label: "Otro" }
];

export interface DocumentMeta {
  id: string;
  patient_id: string;
  encounter_id: string | null;
  encounter_opened_at: string | null;
  file_name: string;
  title: string | null;
  mime_type: string;
  category: string | null;
  size_bytes: number;
  sha256: string | null;
  source: string;
  received_at: string;
}

export interface CandidateFile {
  name: string;
  size: number;
  type: string;
}

export interface FileScreening<T extends CandidateFile> {
  accepted: T[];
  rejected: Array<{ file: T; reason: string }>;
}

function hasAcceptedExtension(name: string) {
  const lower = name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Separa los archivos que vale la pena leer de los que se rechazan ya. */
export function screenFiles<T extends CandidateFile>(files: T[]): FileScreening<T> {
  const result: FileScreening<T> = { accepted: [], rejected: [] };
  for (const file of files) {
    const typeOk = ACCEPTED_DOCUMENT_TYPES.includes(file.type) || (!file.type && hasAcceptedExtension(file.name));
    if (!typeOk) {
      result.rejected.push({ file, reason: "solo se admiten PDF, PNG, JPG y WEBP" });
    } else if (file.size === 0) {
      result.rejected.push({ file, reason: "el archivo esta vacio" });
    } else if (file.size > MAX_DOCUMENT_BYTES) {
      result.rejected.push({ file, reason: "supera el limite de 20 MB" });
    } else {
      result.accepted.push(file);
    }
  }
  return result;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function categoryLabel(category: string | null): string {
  return DOCUMENT_CATEGORIES.find((c) => c.value === category)?.label ?? "Sin categoria";
}

export interface DocumentGroup {
  /** Id de la consulta, o null para los documentos del expediente sin consulta. */
  encounterId: string | null;
  openedAt: string | null;
  documents: DocumentMeta[];
}

/**
 * Agrupa por consulta, de la mas reciente a la mas vieja, con los documentos
 * sin consulta al final. Si se indica `currentEncounterId`, ese grupo va
 * primero: en la consulta lo relevante es lo que se adjunto en ella.
 */
export function groupDocumentsByEncounter(
  documents: DocumentMeta[],
  currentEncounterId: string | null = null
): DocumentGroup[] {
  const groups = new Map<string, DocumentGroup>();
  const loose: DocumentGroup = { encounterId: null, openedAt: null, documents: [] };

  for (const doc of documents) {
    if (!doc.encounter_id) {
      loose.documents.push(doc);
      continue;
    }
    const group = groups.get(doc.encounter_id) ?? {
      encounterId: doc.encounter_id,
      openedAt: doc.encounter_opened_at,
      documents: []
    };
    group.documents.push(doc);
    groups.set(doc.encounter_id, group);
  }

  const ordered = [...groups.values()].sort((a, b) => {
    if (a.encounterId === currentEncounterId) return -1;
    if (b.encounterId === currentEncounterId) return 1;
    return (b.openedAt ?? "").localeCompare(a.openedAt ?? "");
  });
  return loose.documents.length > 0 ? [...ordered, loose] : ordered;
}
