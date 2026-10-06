//! Documentos clinicos locales (paso 28, rebanada 1).
//!
//! Clase de residencia: CLINICO — los archivos (estudios, imagenes,
//! referencias, consentimientos) viven dentro de la base cifrada local y nunca
//! tocan la red. Sustituyen la entrada de archivos que hacia el buzon del
//! portal, ahora congelado: el medico los adjunta directo al expediente y,
//! si quiere, a la consulta en curso.
//!
//! El tipo se decide por los bytes (firma del archivo), no por la extension ni
//! por lo que diga el sistema operativo: solo entran PDF y las imagenes que el
//! visor de la app sabe mostrar. La auditoria guarda nombre y huella, jamas el
//! contenido.

use base64::{engine::general_purpose::STANDARD, Engine as _};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Debug, thiserror::Error)]
pub enum DocumentError {
    #[error("error de base de datos: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("{0}")]
    Invalid(String),
    #[error("documento no encontrado")]
    NotFound,
}

/// Tope por archivo. Un estudio escaneado o una radiografia caben de sobra; un
/// video no es un documento clinico.
pub const MAX_DOCUMENT_BYTES: usize = 20 * 1024 * 1024;

pub const CATEGORIES: &[&str] = &["LABORATORIO", "IMAGEN", "REFERENCIA", "CONSENTIMIENTO", "OTRO"];

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn audit(
    conn: &Connection,
    entity_id: &str,
    action: &str,
    details: Option<&str>,
) -> Result<(), DocumentError> {
    conn.execute(
        "INSERT INTO clinical_audit (entity, entity_id, action, at, details)
         VALUES ('document', ?1, ?2, ?3, ?4)",
        params![entity_id, action, now(), details],
    )?;
    Ok(())
}

/// Tipo real del archivo segun su firma. `None` si no es un formato admitido.
pub fn detect_mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"%PDF-") {
        Some("application/pdf")
    } else if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        Some("image/png")
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("image/jpeg")
    } else if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else {
        None
    }
}

/* ---------- Tipos ---------- */

#[derive(Debug, Deserialize)]
pub struct NewDocument {
    pub patient_id: String,
    pub encounter_id: Option<String>,
    pub file_name: String,
    pub category: String,
    pub title: Option<String>,
    /// Contenido en base64 (el IPC de Tauri viaja como JSON).
    pub content_base64: String,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct DocumentMeta {
    pub id: String,
    pub patient_id: String,
    pub encounter_id: Option<String>,
    /// Fecha de apertura de la consulta ligada, para agrupar sin otra consulta.
    pub encounter_opened_at: Option<String>,
    pub file_name: String,
    pub title: Option<String>,
    pub mime_type: String,
    pub category: Option<String>,
    pub size_bytes: i64,
    pub sha256: Option<String>,
    /// LOCAL (adjuntado en la app) o MAILBOX (llego por el buzon del portal).
    pub source: String,
    pub received_at: String,
}

#[derive(Debug, Serialize)]
pub struct DocumentContent {
    pub meta: DocumentMeta,
    pub content_base64: String,
}

/* ---------- Operaciones ---------- */

const META_COLUMNS: &str = "d.id, d.patient_id, d.encounter_id, e.opened_at, d.file_name, d.title,
     d.mime_type, d.category, d.size_bytes, d.sha256, d.source, d.received_at";

fn row_to_meta(row: &rusqlite::Row<'_>) -> rusqlite::Result<DocumentMeta> {
    Ok(DocumentMeta {
        id: row.get(0)?,
        patient_id: row.get(1)?,
        encounter_id: row.get(2)?,
        encounter_opened_at: row.get(3)?,
        file_name: row.get(4)?,
        title: row.get(5)?,
        mime_type: row.get(6)?,
        category: row.get(7)?,
        size_bytes: row.get(8)?,
        sha256: row.get(9)?,
        source: row.get(10)?,
        received_at: row.get(11)?,
    })
}

fn read_meta(conn: &Connection, document_id: &str) -> Result<DocumentMeta, DocumentError> {
    conn.query_row(
        &format!(
            "SELECT {META_COLUMNS} FROM documents d
             LEFT JOIN encounters e ON e.id = d.encounter_id
             WHERE d.id = ?1"
        ),
        params![document_id],
        row_to_meta,
    )
    .optional()?
    .ok_or(DocumentError::NotFound)
}

/// Nombre de archivo sin rutas ni caracteres de control, para mostrar y para
/// la exportacion. El nombre nunca decide el tipo.
fn clean_file_name(raw: &str) -> String {
    let base = raw.rsplit(['/', '\\']).next().unwrap_or(raw);
    let cleaned: String = base.chars().filter(|c| !c.is_control()).collect();
    let trimmed = cleaned.trim();
    if trimmed.is_empty() {
        "documento".to_string()
    } else {
        trimmed.chars().take(200).collect()
    }
}

pub fn add_document(conn: &Connection, input: &NewDocument) -> Result<DocumentMeta, DocumentError> {
    if !CATEGORIES.contains(&input.category.as_str()) {
        return Err(DocumentError::Invalid(format!(
            "categoria de documento no valida: {}",
            input.category
        )));
    }

    let patient_exists: bool = conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM patients WHERE id = ?1)",
        params![input.patient_id],
        |row| row.get(0),
    )?;
    if !patient_exists {
        return Err(DocumentError::Invalid("el paciente no existe".into()));
    }

    if let Some(encounter_id) = &input.encounter_id {
        let owner: Option<String> = conn
            .query_row(
                "SELECT patient_id FROM encounters WHERE id = ?1",
                params![encounter_id],
                |row| row.get(0),
            )
            .optional()?;
        match owner {
            None => return Err(DocumentError::Invalid("la consulta no existe".into())),
            Some(owner) if owner != input.patient_id => {
                return Err(DocumentError::Invalid(
                    "la consulta pertenece a otro paciente".into(),
                ))
            }
            Some(_) => {}
        }
    }

    let bytes = STANDARD
        .decode(input.content_base64.trim())
        .map_err(|_| DocumentError::Invalid("el contenido del archivo no es valido".into()))?;
    if bytes.is_empty() {
        return Err(DocumentError::Invalid("el archivo esta vacio".into()));
    }
    if bytes.len() > MAX_DOCUMENT_BYTES {
        return Err(DocumentError::Invalid(format!(
            "el archivo supera el limite de {} MB",
            MAX_DOCUMENT_BYTES / (1024 * 1024)
        )));
    }
    let mime_type = detect_mime(&bytes).ok_or_else(|| {
        DocumentError::Invalid("solo se admiten PDF, PNG, JPG y WEBP".into())
    })?;

    let sha256: String = Sha256::digest(&bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect();
    let duplicate: Option<String> = conn
        .query_row(
            "SELECT file_name FROM documents WHERE patient_id = ?1 AND sha256 = ?2",
            params![input.patient_id, sha256],
            |row| row.get(0),
        )
        .optional()?;
    if let Some(existing) = duplicate {
        return Err(DocumentError::Invalid(format!(
            "este archivo ya esta en el expediente como \"{existing}\""
        )));
    }

    let id = uuid::Uuid::new_v4().to_string();
    let file_name = clean_file_name(&input.file_name);
    let title = input
        .title
        .as_deref()
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .map(|t| t.chars().take(200).collect::<String>());

    conn.execute(
        "INSERT INTO documents
            (id, patient_id, appointment_id, encounter_id, file_name, title, mime_type,
             category, content, size_bytes, sha256, source, received_at)
         VALUES (?1, ?2, NULL, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 'LOCAL', ?11)",
        params![
            id,
            input.patient_id,
            input.encounter_id,
            file_name,
            title,
            mime_type,
            input.category,
            bytes,
            bytes.len() as i64,
            sha256,
            now()
        ],
    )?;
    audit(conn, &id, "added", Some(&format!("{file_name} sha256={sha256}")))?;
    read_meta(conn, &id)
}

/// Metadatos de los documentos del paciente, del mas reciente al mas viejo. No
/// carga contenido: la lista debe ser ligera aunque haya radiografias pesadas.
pub fn list_patient_documents(
    conn: &Connection,
    patient_id: &str,
) -> Result<Vec<DocumentMeta>, DocumentError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {META_COLUMNS} FROM documents d
         LEFT JOIN encounters e ON e.id = d.encounter_id
         WHERE d.patient_id = ?1
         ORDER BY d.received_at DESC, d.id"
    ))?;
    let rows = stmt
        .query_map(params![patient_id], row_to_meta)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn read_document(conn: &Connection, document_id: &str) -> Result<DocumentContent, DocumentError> {
    let meta = read_meta(conn, document_id)?;
    let bytes: Vec<u8> = conn.query_row(
        "SELECT content FROM documents WHERE id = ?1",
        params![document_id],
        |row| row.get(0),
    )?;
    audit(conn, document_id, "viewed", None)?;
    Ok(DocumentContent {
        meta,
        content_base64: STANDARD.encode(bytes),
    })
}

/// Retira un documento del expediente. Existe para corregir un archivo
/// adjuntado al paciente equivocado: dejarlo seria una fuga de datos de otra
/// persona. La auditoria conserva nombre y huella del retirado.
pub fn delete_document(conn: &Connection, document_id: &str) -> Result<(), DocumentError> {
    let meta = read_meta(conn, document_id)?;
    conn.execute("DELETE FROM documents WHERE id = ?1", params![document_id])?;
    audit(
        conn,
        document_id,
        "deleted",
        Some(&format!(
            "{} sha256={}",
            meta.file_name,
            meta.sha256.as_deref().unwrap_or("desconocido")
        )),
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_encrypted;

    const PDF: &[u8] = b"%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF";
    const PNG: &[u8] = &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13];

    fn test_conn(name: &str) -> Connection {
        let dir = std::env::temp_dir().join("midoc-documents-tests");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(format!("{name}-{}.db", uuid::Uuid::new_v4()));
        open_encrypted(&path, "frase-de-prueba-123").unwrap()
    }

    fn seed_patient(conn: &Connection, patient_id: &str) {
        conn.execute(
            "INSERT INTO patients (id, first_name, last_name, created_at, updated_at)
             VALUES (?1, 'Hugo', 'Paz', '2026-01-01', '2026-01-01')",
            params![patient_id],
        )
        .unwrap();
    }

    fn seed_encounter(conn: &Connection, encounter_id: &str, patient_id: &str) {
        conn.execute(
            "INSERT INTO encounters (id, appointment_id, patient_id, status, opened_at)
             VALUES (?1, NULL, ?2, 'OPEN', '2026-10-05T10:00:00Z')",
            params![encounter_id, patient_id],
        )
        .unwrap();
    }

    fn new_doc(patient_id: &str, encounter_id: Option<&str>, bytes: &[u8]) -> NewDocument {
        NewDocument {
            patient_id: patient_id.into(),
            encounter_id: encounter_id.map(String::from),
            file_name: "C:\\Users\\medico\\Descargas\\biometria.pdf".into(),
            category: "LABORATORIO".into(),
            title: Some("  Biometria hematica  ".into()),
            content_base64: STANDARD.encode(bytes),
        }
    }

    #[test]
    fn detects_supported_types_by_signature_only() {
        assert_eq!(detect_mime(PDF), Some("application/pdf"));
        assert_eq!(detect_mime(PNG), Some("image/png"));
        assert_eq!(detect_mime(&[0xFF, 0xD8, 0xFF, 0xE0]), Some("image/jpeg"));
        assert_eq!(detect_mime(b"RIFF\0\0\0\0WEBPVP8 "), Some("image/webp"));
        assert_eq!(detect_mime(b"MZ\x90\0"), None, "un ejecutable no entra");
        assert_eq!(detect_mime(b"<html>"), None);
        assert_eq!(detect_mime(&[]), None);
    }

    #[test]
    fn adds_a_document_linked_to_the_encounter_and_lists_it_without_content() {
        let conn = test_conn("add");
        seed_patient(&conn, "p1");
        seed_encounter(&conn, "e1", "p1");

        let meta = add_document(&conn, &new_doc("p1", Some("e1"), PDF)).unwrap();
        assert_eq!(meta.file_name, "biometria.pdf", "sin la ruta del equipo");
        assert_eq!(meta.title.as_deref(), Some("Biometria hematica"));
        assert_eq!(meta.mime_type, "application/pdf");
        assert_eq!(meta.encounter_id.as_deref(), Some("e1"));
        assert_eq!(meta.encounter_opened_at.as_deref(), Some("2026-10-05T10:00:00Z"));
        assert_eq!(meta.source, "LOCAL");
        assert_eq!(meta.size_bytes, PDF.len() as i64);

        let listed = list_patient_documents(&conn, "p1").unwrap();
        assert_eq!(listed, vec![meta]);

        let content = read_document(&conn, &listed[0].id).unwrap();
        assert_eq!(STANDARD.decode(content.content_base64).unwrap(), PDF);
    }

    #[test]
    fn a_document_can_live_in_the_record_without_an_encounter() {
        let conn = test_conn("no-encounter");
        seed_patient(&conn, "p1");
        let meta = add_document(&conn, &new_doc("p1", None, PNG)).unwrap();
        assert_eq!(meta.encounter_id, None);
        assert_eq!(meta.mime_type, "image/png");
    }

    #[test]
    fn rejects_unsupported_empty_oversized_and_duplicate_files() {
        let conn = test_conn("reject");
        seed_patient(&conn, "p1");

        let err = add_document(&conn, &new_doc("p1", None, b"MZ\x90\0ejecutable")).unwrap_err();
        assert!(err.to_string().contains("solo se admiten"), "{err}");

        let err = add_document(&conn, &new_doc("p1", None, b"")).unwrap_err();
        assert!(err.to_string().contains("vacio"), "{err}");

        let mut big = PDF.to_vec();
        big.resize(MAX_DOCUMENT_BYTES + 1, b' ');
        let err = add_document(&conn, &new_doc("p1", None, &big)).unwrap_err();
        assert!(err.to_string().contains("limite"), "{err}");

        add_document(&conn, &new_doc("p1", None, PDF)).unwrap();
        let err = add_document(&conn, &new_doc("p1", None, PDF)).unwrap_err();
        assert!(err.to_string().contains("ya esta en el expediente"), "{err}");

        let mut bad_category = new_doc("p1", None, PNG);
        bad_category.category = "VIDEO".into();
        assert!(add_document(&conn, &bad_category).is_err());
    }

    #[test]
    fn the_same_file_can_belong_to_two_different_patients() {
        let conn = test_conn("two-patients");
        seed_patient(&conn, "p1");
        seed_patient(&conn, "p2");
        add_document(&conn, &new_doc("p1", None, PDF)).unwrap();
        add_document(&conn, &new_doc("p2", None, PDF)).unwrap();
        assert_eq!(list_patient_documents(&conn, "p2").unwrap().len(), 1);
    }

    #[test]
    fn refuses_to_link_another_patients_encounter() {
        let conn = test_conn("wrong-encounter");
        seed_patient(&conn, "p1");
        seed_patient(&conn, "p2");
        seed_encounter(&conn, "e2", "p2");

        let err = add_document(&conn, &new_doc("p1", Some("e2"), PDF)).unwrap_err();
        assert!(err.to_string().contains("otro paciente"), "{err}");
        let err = add_document(&conn, &new_doc("p1", Some("nope"), PDF)).unwrap_err();
        assert!(err.to_string().contains("no existe"), "{err}");
        let err = add_document(&conn, &new_doc("nadie", None, PDF)).unwrap_err();
        assert!(err.to_string().contains("paciente no existe"), "{err}");
    }

    #[test]
    fn deleting_keeps_an_audit_trail_without_content() {
        let conn = test_conn("delete");
        seed_patient(&conn, "p1");
        let meta = add_document(&conn, &new_doc("p1", None, PDF)).unwrap();

        delete_document(&conn, &meta.id).unwrap();
        assert!(list_patient_documents(&conn, "p1").unwrap().is_empty());
        assert!(matches!(read_document(&conn, &meta.id), Err(DocumentError::NotFound)));

        let actions: Vec<(String, Option<String>)> = conn
            .prepare("SELECT action, details FROM clinical_audit WHERE entity = 'document' ORDER BY rowid")
            .unwrap()
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(actions.iter().map(|a| a.0.as_str()).collect::<Vec<_>>(), ["added", "deleted"]);
        let deleted_details = actions[1].1.as_deref().unwrap();
        assert!(deleted_details.contains("biometria.pdf"));
        assert!(deleted_details.contains(meta.sha256.as_deref().unwrap()));
        assert!(!deleted_details.contains("%PDF"), "la auditoria no guarda contenido");
    }

    #[test]
    fn mailbox_documents_from_before_the_migration_still_list() {
        let conn = test_conn("mailbox");
        seed_patient(&conn, "p1");
        conn.execute(
            "INSERT INTO documents (id, patient_id, file_name, mime_type, content, size_bytes, received_at)
             VALUES ('m1', 'p1', 'estudio.pdf', 'application/pdf', ?1, ?2, '2026-08-01T00:00:00Z')",
            params![PDF, PDF.len() as i64],
        )
        .unwrap();
        let listed = list_patient_documents(&conn, "p1").unwrap();
        assert_eq!(listed[0].source, "MAILBOX");
        assert_eq!(listed[0].sha256, None);
    }
}
