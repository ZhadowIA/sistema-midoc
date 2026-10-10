//! Busqueda dentro de los expedientes (paso 28, rebanada 3).
//!
//! Clase de residencia: CLINICO, todo local. Busca en la version vigente de
//! cada nota (campos SOAP, diagnostico libre e indicaciones), en los
//! diagnosticos CIE-10, en la receta y en los documentos (titulo y nombre). La
//! comparacion ignora acentos, mayusculas y puntuacion; una clave CIE-10 busca
//! por prefijo, y un medicamento conocido se expande a los nombres que
//! comparten su ingrediente (buscar "paracetamol" encuentra "Tempra").
//!
//! Recorre en memoria lo que devuelve SQLite: con miles de notas por medico
//! sigue siendo inmediato. Si un consultorio llega a cientos de miles, el
//! siguiente paso es un indice FTS5 dentro de la misma base cifrada.

use rusqlite::{params, Connection};
use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum SearchError {
    #[error("error de base de datos: {0}")]
    Sqlite(#[from] rusqlite::Error),
}

pub const MAX_HITS: usize = 100;

#[derive(Debug, Serialize, PartialEq)]
pub struct SearchHit {
    pub patient_id: String,
    pub patient_name: String,
    pub encounter_id: Option<String>,
    pub encounter_opened_at: Option<String>,
    pub encounter_status: Option<String>,
    /// DIAGNOSTICO, NOTA, RECETA o DOCUMENTO.
    pub kind: String,
    /// Campo donde coincidio, para mostrar ("Subjetivo", "Receta", ...).
    pub field: String,
    pub snippet: String,
    /// Documento que coincidio (para abrirlo).
    pub document_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SearchResults {
    pub hits: Vec<SearchHit>,
    pub truncated: bool,
    /// Nombres de medicamento con el mismo ingrediente que tambien se buscaron.
    pub expanded_terms: Vec<String>,
}

/* ---------- Comparacion sin acentos, alineada por caracter ---------- */

/// Pliega un caracter a mayuscula sin acento; lo que no es letra ni numero se
/// vuelve espacio. Uno a uno, para que los indices del texto plegado sirvan
/// para recortar el original.
fn fold(c: char) -> char {
    match c {
        'á' | 'à' | 'ä' | 'â' | 'Á' | 'À' | 'Ä' | 'Â' => 'A',
        'é' | 'è' | 'ë' | 'ê' | 'É' | 'È' | 'Ë' | 'Ê' => 'E',
        'í' | 'ì' | 'ï' | 'î' | 'Í' | 'Ì' | 'Ï' | 'Î' => 'I',
        'ó' | 'ò' | 'ö' | 'ô' | 'Ó' | 'Ò' | 'Ö' | 'Ô' => 'O',
        'ú' | 'ù' | 'ü' | 'û' | 'Ú' | 'Ù' | 'Ü' | 'Û' => 'U',
        'ñ' | 'Ñ' => 'N',
        c if c.is_alphanumeric() => c.to_uppercase().next().unwrap_or(c),
        _ => ' ',
    }
}

fn folded_chars(text: &str) -> Vec<char> {
    text.chars().map(fold).collect()
}

fn find_chars(hay: &[char], needle: &[char]) -> Option<usize> {
    if needle.is_empty() || needle.len() > hay.len() {
        return None;
    }
    (0..=hay.len() - needle.len()).find(|&i| hay[i..i + needle.len()] == *needle)
}

/// Un termino de busqueda: palabras que deben aparecer todas en el mismo campo.
type Alternative = Vec<Vec<char>>;

fn tokens_of(text: &str) -> Alternative {
    folded_chars(text)
        .split(|c| *c == ' ')
        .filter(|t| !t.is_empty())
        .map(|t| t.to_vec())
        .collect()
}

/// Posicion de la primera coincidencia si alguna alternativa aparece completa.
fn match_position(text: &str, alternatives: &[Alternative]) -> Option<(usize, usize)> {
    let hay = folded_chars(text);
    alternatives.iter().find_map(|alternative| {
        let mut first: Option<(usize, usize)> = None;
        for token in alternative {
            let at = find_chars(&hay, token)?;
            if first.is_none_or(|(start, _)| at < start) {
                first = Some((at, token.len()));
            }
        }
        first
    })
}

/// Fragmento del texto original alrededor de la coincidencia.
fn snippet(text: &str, (start, len): (usize, usize)) -> String {
    const BEFORE: usize = 50;
    const AFTER: usize = 90;
    let chars: Vec<char> = text.chars().collect();
    let from = start.saturating_sub(BEFORE);
    let to = (start + len + AFTER).min(chars.len());
    let body: String = chars[from..to].iter().collect();
    let body = body.split_whitespace().collect::<Vec<_>>().join(" ");
    format!(
        "{}{}{}",
        if from > 0 { "…" } else { "" },
        body,
        if to < chars.len() { "…" } else { "" }
    )
}

/// Clave CIE-10 escrita por el medico ("j45", "J45.9"), o None si no lo parece.
fn code_query(query: &str) -> Option<String> {
    let code = crate::cie10::normalize_code(query);
    let mut chars = code.chars();
    let first = chars.next()?;
    let rest: String = chars.collect();
    let valid = first.is_ascii_alphabetic()
        && (2..=3).contains(&rest.len())
        && rest.chars().all(|c| c.is_ascii_digit());
    valid.then_some(code)
}

/// Si lo escrito es un medicamento de la referencia, los demas nombres con el
/// mismo ingrediente (marcas y genericos).
fn medication_synonyms(conn: &Connection, query: &str) -> Result<Vec<String>, SearchError> {
    let folded: String = folded_chars(query).into_iter().collect::<String>();
    let folded = folded.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut stmt = conn.prepare(
        "SELECT r2.display_name, r2.name FROM medication_reference r1
         JOIN medication_reference r2 ON r2.ingredient = r1.ingredient
         WHERE upper(r1.name) = ?1",
    )?;
    let rows = stmt
        .query_map(params![folded], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut names: Vec<String> = Vec::new();
    for (display, name) in rows {
        for candidate in [display, name] {
            let key: String = folded_chars(&candidate).into_iter().collect();
            if key.trim() != folded
                && !names
                    .iter()
                    .any(|n| folded_chars(n) == folded_chars(&candidate))
            {
                names.push(candidate);
            }
        }
    }
    names.sort();
    Ok(names)
}

/* ---------- Busqueda ---------- */

struct NoteRow {
    patient_id: String,
    patient_name: String,
    encounter_id: String,
    opened_at: String,
    status: String,
    fields: Vec<(&'static str, String)>,
    coded: Vec<crate::clinical::CodedDiagnosis>,
    prescription: Option<String>,
}

fn load_notes(conn: &Connection, patient_id: Option<&str>) -> Result<Vec<NoteRow>, SearchError> {
    let mut stmt = conn.prepare(
        "SELECT e.patient_id, trim(p.first_name || ' ' || p.last_name), e.id, e.opened_at, e.status,
                n.subjective, n.objective, n.assessment, n.plan, n.diagnosis, n.instructions,
                n.coded_diagnoses, rx.content
         FROM encounters e
         JOIN patients p ON p.id = e.patient_id
         LEFT JOIN note_versions n ON n.encounter_id = e.id
              AND n.version = (SELECT MAX(version) FROM note_versions WHERE encounter_id = e.id)
         LEFT JOIN prescriptions rx ON rx.encounter_id = e.id
         WHERE ?1 IS NULL OR e.patient_id = ?1
         ORDER BY e.opened_at DESC",
    )?;
    let rows = stmt
        .query_map(params![patient_id], |row| {
            let text = |i: usize| -> rusqlite::Result<String> {
                Ok(row.get::<_, Option<String>>(i)?.unwrap_or_default())
            };
            let coded_raw = text(11)?;
            Ok(NoteRow {
                patient_id: row.get(0)?,
                patient_name: row.get(1)?,
                encounter_id: row.get(2)?,
                opened_at: row.get(3)?,
                status: row.get(4)?,
                fields: vec![
                    ("Subjetivo", text(5)?),
                    ("Objetivo", text(6)?),
                    ("Analisis", text(7)?),
                    ("Plan", text(8)?),
                    ("Diagnostico", text(9)?),
                    ("Indicaciones", text(10)?),
                ],
                coded: serde_json::from_str(&coded_raw).unwrap_or_default(),
                prescription: row.get(12)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn search_records(
    conn: &Connection,
    query: &str,
    patient_id: Option<&str>,
) -> Result<SearchResults, SearchError> {
    let base = tokens_of(query);
    if base.is_empty() {
        return Ok(SearchResults {
            hits: Vec::new(),
            truncated: false,
            expanded_terms: Vec::new(),
        });
    }
    let expanded_terms = medication_synonyms(conn, query)?;
    let mut alternatives = vec![base];
    alternatives.extend(expanded_terms.iter().map(|term| tokens_of(term)));
    let code = code_query(query);

    let mut hits: Vec<SearchHit> = Vec::new();
    let hit = |row: &NoteRow, kind: &str, field: &str, snippet: String| SearchHit {
        patient_id: row.patient_id.clone(),
        patient_name: row.patient_name.clone(),
        encounter_id: Some(row.encounter_id.clone()),
        encounter_opened_at: Some(row.opened_at.clone()),
        encounter_status: Some(row.status.clone()),
        kind: kind.into(),
        field: field.into(),
        snippet,
        document_id: None,
    };

    for row in load_notes(conn, patient_id)? {
        for diagnosis in &row.coded {
            let label = format!(
                "{} {}",
                crate::cie10::display_code(&diagnosis.code),
                diagnosis.name
            );
            let by_code = code
                .as_deref()
                .is_some_and(|c| diagnosis.code.starts_with(c));
            if by_code || match_position(&diagnosis.name, &alternatives).is_some() {
                let field = if diagnosis.principal {
                    "CIE-10 principal"
                } else {
                    "CIE-10"
                };
                hits.push(hit(&row, "DIAGNOSTICO", field, label));
            }
        }
        for (field, text) in &row.fields {
            if let Some(position) = match_position(text, &alternatives) {
                hits.push(hit(&row, "NOTA", field, snippet(text, position)));
            }
        }
        if let Some(text) = &row.prescription {
            if let Some(position) = match_position(text, &alternatives) {
                hits.push(hit(&row, "RECETA", "Receta", snippet(text, position)));
            }
        }
    }

    let mut docs = conn.prepare(
        "SELECT d.id, d.patient_id, trim(p.first_name || ' ' || p.last_name), d.encounter_id,
                e.opened_at, e.status, coalesce(d.title, ''), d.file_name
         FROM documents d
         JOIN patients p ON p.id = d.patient_id
         LEFT JOIN encounters e ON e.id = d.encounter_id
         WHERE ?1 IS NULL OR d.patient_id = ?1
         ORDER BY d.received_at DESC",
    )?;
    let documents = docs
        .query_map(params![patient_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, String>(7)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    for (id, pid, name, encounter_id, opened_at, status, title, file_name) in documents {
        let label = if title.is_empty() {
            file_name.clone()
        } else {
            format!("{title} ({file_name})")
        };
        if match_position(&label, &alternatives).is_some() {
            hits.push(SearchHit {
                patient_id: pid,
                patient_name: name,
                encounter_id,
                encounter_opened_at: opened_at,
                encounter_status: status,
                kind: "DOCUMENTO".into(),
                field: "Documento".into(),
                snippet: label,
                document_id: Some(id),
            });
        }
    }

    let truncated = hits.len() > MAX_HITS;
    hits.truncate(MAX_HITS);
    Ok(SearchResults {
        hits,
        truncated,
        expanded_terms,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clinical::{self, CodedDiagnosis, NoteContent};
    use crate::db::open_encrypted;

    fn test_conn(name: &str) -> Connection {
        let dir = std::env::temp_dir().join("midoc-search-tests");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(format!("{name}-{}.db", uuid::Uuid::new_v4()));
        let conn = open_encrypted(&path, "frase-de-prueba-123").unwrap();
        crate::medication::ensure_bundled_reference_installed(&conn).unwrap();
        conn
    }

    fn patient(conn: &Connection, id: &str, first: &str, last: &str) {
        conn.execute(
            "INSERT INTO patients (id, first_name, last_name, created_at, updated_at)
             VALUES (?1, ?2, ?3, '2026-01-01', '2026-01-01')",
            params![id, first, last],
        )
        .unwrap();
    }

    fn consult(
        conn: &Connection,
        patient_id: &str,
        note: NoteContent,
        prescription: &str,
    ) -> String {
        let encounter = clinical::open_encounter_for_patient(conn, patient_id).unwrap();
        clinical::save_note(conn, &encounter.id, &note).unwrap();
        if !prescription.is_empty() {
            clinical::save_prescription(conn, &encounter.id, prescription).unwrap();
        }
        encounter.id
    }

    fn seed(conn: &Connection) -> (String, String) {
        patient(conn, "p1", "Ana", "Ruiz");
        patient(conn, "p2", "Hugo", "Paz");
        let asthma = consult(
            conn,
            "p1",
            NoteContent {
                subjective: "Disnea nocturna y sibilancias desde hace una semana.".into(),
                diagnosis: "Crisis asmática leve".into(),
                coded_diagnoses: vec![CodedDiagnosis {
                    code: "J459".into(),
                    name: String::new(),
                    principal: true,
                }],
                ..Default::default()
            },
            "Salbutamol inhalado 2 disparos c/6h\nTempra 500 mg c/8h por 3 dias",
        );
        let back = consult(
            conn,
            "p2",
            NoteContent {
                subjective: "Dolor lumbar al cargar peso.".into(),
                plan: "Reposo relativo y ejercicios.".into(),
                coded_diagnoses: vec![CodedDiagnosis {
                    code: "M545".into(),
                    name: String::new(),
                    principal: true,
                }],
                ..Default::default()
            },
            "Naproxeno 250 mg c/12h",
        );
        (asthma, back)
    }

    fn kinds(results: &SearchResults) -> Vec<(String, String)> {
        results
            .hits
            .iter()
            .map(|h| (h.patient_id.clone(), h.kind.clone()))
            .collect()
    }

    #[test]
    fn finds_a_note_by_cie10_code_prefix() {
        let conn = test_conn("code");
        let (asthma, _) = seed(&conn);
        let results = search_records(&conn, "j45", None).unwrap();
        assert_eq!(kinds(&results), vec![("p1".into(), "DIAGNOSTICO".into())]);
        assert_eq!(
            results.hits[0].encounter_id.as_deref(),
            Some(asthma.as_str())
        );
        assert_eq!(results.hits[0].snippet, "J45.9 ASMA, NO ESPECIFICADO");
        assert_eq!(results.hits[0].field, "CIE-10 principal");
        assert_eq!(search_records(&conn, "J45.9", None).unwrap().hits.len(), 1);
    }

    #[test]
    fn finds_by_note_text_ignoring_accents_and_case() {
        let conn = test_conn("text");
        seed(&conn);
        let results = search_records(&conn, "ASMATICA", None).unwrap();
        assert_eq!(kinds(&results), vec![("p1".into(), "NOTA".into())]);
        assert_eq!(results.hits[0].field, "Diagnostico");

        let results = search_records(&conn, "sibilancias nocturna", None).unwrap();
        assert_eq!(
            results.hits[0].field, "Subjetivo",
            "todas las palabras en el mismo campo"
        );
        assert!(results.hits[0].snippet.contains("sibilancias"));

        assert!(search_records(&conn, "sibilancias lumbar", None)
            .unwrap()
            .hits
            .is_empty());
    }

    #[test]
    fn finds_by_drug_including_brands_with_the_same_ingredient() {
        let conn = test_conn("drug");
        seed(&conn);
        let results = search_records(&conn, "paracetamol", None).unwrap();
        assert_eq!(kinds(&results), vec![("p1".into(), "RECETA".into())]);
        assert!(
            results.hits[0].snippet.contains("Tempra"),
            "{}",
            results.hits[0].snippet
        );
        assert!(results
            .expanded_terms
            .iter()
            .any(|t| t.eq_ignore_ascii_case("tempra")));

        let results = search_records(&conn, "naproxeno", None).unwrap();
        assert_eq!(kinds(&results), vec![("p2".into(), "RECETA".into())]);
    }

    #[test]
    fn can_be_limited_to_one_patient() {
        let conn = test_conn("patient");
        seed(&conn);
        assert_eq!(search_records(&conn, "dolor", None).unwrap().hits.len(), 1);
        assert!(search_records(&conn, "dolor", Some("p1"))
            .unwrap()
            .hits
            .is_empty());
    }

    #[test]
    fn finds_documents_by_title_or_file_name() {
        let conn = test_conn("docs");
        let (asthma, _) = seed(&conn);
        crate::documents::add_document(
            &conn,
            &crate::documents::NewDocument {
                patient_id: "p1".into(),
                encounter_id: Some(asthma.clone()),
                file_name: "espirometria-octubre.pdf".into(),
                category: "LABORATORIO".into(),
                title: None,
                content_base64: base64::Engine::encode(
                    &base64::engine::general_purpose::STANDARD,
                    b"%PDF-1.4 x",
                ),
            },
        )
        .unwrap();
        let results = search_records(&conn, "espirometria", None).unwrap();
        assert_eq!(results.hits.len(), 1);
        assert_eq!(results.hits[0].kind, "DOCUMENTO");
        assert_eq!(
            results.hits[0].encounter_id.as_deref(),
            Some(asthma.as_str())
        );
        assert!(results.hits[0].document_id.is_some());
    }

    #[test]
    fn only_the_latest_note_version_counts() {
        let conn = test_conn("versions");
        patient(&conn, "p1", "Ana", "Ruiz");
        let encounter = clinical::open_encounter_for_patient(&conn, "p1").unwrap();
        clinical::save_note(
            &conn,
            &encounter.id,
            &NoteContent {
                plan: "Amoxicilina".into(),
                ..Default::default()
            },
        )
        .unwrap();
        clinical::save_note(
            &conn,
            &encounter.id,
            &NoteContent {
                plan: "Solo vigilancia".into(),
                ..Default::default()
            },
        )
        .unwrap();
        assert!(search_records(&conn, "amoxicilina", None)
            .unwrap()
            .hits
            .is_empty());
        assert_eq!(
            search_records(&conn, "vigilancia", None)
                .unwrap()
                .hits
                .len(),
            1
        );
    }

    #[test]
    fn empty_queries_return_nothing_and_snippets_are_trimmed() {
        let conn = test_conn("empty");
        seed(&conn);
        assert!(search_records(&conn, "  .,; ", None)
            .unwrap()
            .hits
            .is_empty());

        let long = format!("{} hallazgo clave {}", "a ".repeat(80), "b ".repeat(80));
        let position = match_position(&long, &[tokens_of("hallazgo")]).unwrap();
        let cut = snippet(&long, position);
        assert!(cut.starts_with('…') && cut.ends_with('…') && cut.contains("hallazgo clave"));
    }

    #[test]
    fn recognizes_cie10_codes_but_not_plain_words() {
        assert_eq!(code_query("j45"), Some("J45".into()));
        assert_eq!(code_query("K02.1"), Some("K021".into()));
        assert_eq!(code_query("asma"), None);
        assert_eq!(code_query("J4"), None);
    }
}
