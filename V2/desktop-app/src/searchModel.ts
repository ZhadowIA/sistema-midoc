// Presentacion de la busqueda en expedientes (paso 28, rebanada 3). La
// busqueda en si corre en Rust; aqui se agrupan resultados y se resalta.

export interface SearchHit {
  patient_id: string;
  patient_name: string;
  encounter_id: string | null;
  encounter_opened_at: string | null;
  encounter_status: string | null;
  kind: "DIAGNOSTICO" | "NOTA" | "RECETA" | "DOCUMENTO";
  field: string;
  snippet: string;
  document_id: string | null;
}

export interface SearchResults {
  hits: SearchHit[];
  truncated: boolean;
  expanded_terms: string[];
}

export interface EncounterGroup {
  encounterId: string | null;
  openedAt: string | null;
  status: string | null;
  hits: SearchHit[];
}

export interface PatientGroup {
  patientId: string;
  patientName: string;
  encounters: EncounterGroup[];
}

export const KIND_LABELS: Record<SearchHit["kind"], string> = {
  DIAGNOSTICO: "Diagnostico",
  NOTA: "Nota",
  RECETA: "Receta",
  DOCUMENTO: "Documento"
};

/** Agrupa por paciente y consulta respetando el orden que llega de Rust. */
export function groupHits(hits: SearchHit[]): PatientGroup[] {
  const patients: PatientGroup[] = [];
  for (const hit of hits) {
    let patient = patients.find((p) => p.patientId === hit.patient_id);
    if (!patient) {
      patient = { patientId: hit.patient_id, patientName: hit.patient_name, encounters: [] };
      patients.push(patient);
    }
    let encounter = patient.encounters.find((e) => e.encounterId === hit.encounter_id);
    if (!encounter) {
      encounter = {
        encounterId: hit.encounter_id,
        openedAt: hit.encounter_opened_at,
        status: hit.encounter_status,
        hits: []
      };
      patient.encounters.push(encounter);
    }
    encounter.hits.push(hit);
  }
  return patients;
}

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

export interface Segment {
  text: string;
  match: boolean;
}

/**
 * Parte el fragmento en tramos resaltados donde aparece alguno de los terminos,
 * sin importar acentos ni mayusculas. NFD sobre una sola letra acentuada da la
 * letra mas su marca; al quitar la marca los indices se corren, por eso se
 * compara caracter por caracter con el texto ya plegado.
 */
export function highlight(snippet: string, terms: string[]): Segment[] {
  const chars = [...snippet];
  const folded = chars.map((c) => fold(c));
  const words = terms
    .flatMap((term) => fold(term).split(/[^A-Z0-9Ñ]+/))
    .filter((w) => w.length >= 2);
  const marked = new Array<boolean>(chars.length).fill(false);
  for (const word of words) {
    for (let i = 0; i + word.length <= chars.length; i += 1) {
      if (folded.slice(i, i + word.length).join("") === word) {
        for (let j = i; j < i + word.length; j += 1) marked[j] = true;
      }
    }
  }
  const segments: Segment[] = [];
  chars.forEach((c, i) => {
    const last = segments[segments.length - 1];
    if (last && last.match === marked[i]) last.text += c;
    else segments.push({ text: c, match: marked[i] });
  });
  return segments;
}
