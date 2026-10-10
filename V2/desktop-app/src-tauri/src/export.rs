//! Salida del expediente (paso 28, rebanadas 4 a 6).
//!
//! Clase de residencia: CLINICO. Arma los datos de una consulta o del
//! expediente completo para que la interfaz los pinte como PDF o para que
//! `fhir.rs` los convierta en un Bundle FHIR R4, y escribe el archivo que el
//! medico eligio con "Guardar como". Escribir fuera de la base
//! cifrada es una salida deliberada del medico: queda en la bitacora con el
//! tipo, el nombre del archivo y su huella, nunca con el contenido.
//!
//! El nombre y la cedula del medico vienen de su cuenta en el portal y se
//! guardan en el equipo al vincular y al sincronizar.

use base64::{engine::general_purpose::STANDARD, Engine as _};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::clinical::{self, NoteContent, PatientRecord};

#[derive(Debug, thiserror::Error)]
pub enum ExportError {
    #[error("error de base de datos: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("{0}")]
    Clinical(#[from] clinical::ClinicalError),
    #[error("{0}")]
    Invalid(String),
    #[error("no se pudo escribir el archivo: {0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Medication(#[from] crate::medication::MedicationError),
}

/// Tipos de salida que reconoce la bitacora.
pub const EXPORT_KINDS: &[&str] =
    &["PDF_CONSULTA", "PDF_EXPEDIENTE", "FHIR_CONSULTA", "FHIR_EXPEDIENTE", "CSV_DIRECTORIO"];

#[derive(Debug, Serialize)]
pub struct ExportDoctor {
    pub name: Option<String>,
    pub license: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ExportEncounter {
    pub id: String,
    pub opened_at: String,
    pub status: String,
    pub signed_at: Option<String>,
    pub signed_hash: Option<String>,
    pub note_version: Option<i64>,
    /// Cuando se guardo la version vigente de la nota.
    pub note_saved_at: Option<String>,
    pub note: Option<NoteContent>,
    pub prescription: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ExportDocument {
    pub id: String,
    pub file_name: String,
    pub mime_type: String,
    pub size_bytes: i64,
    pub title: Option<String>,
    pub category: Option<String>,
    pub received_at: String,
    pub encounter_id: Option<String>,
    pub sha256: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RecordExport {
    pub generated_at: String,
    pub doctor: ExportDoctor,
    pub patient: PatientRecord,
    pub sex: Option<String>,
    pub encounters: Vec<ExportEncounter>,
    pub documents: Vec<ExportDocument>,
}

fn state(conn: &Connection, key: &str) -> Result<Option<String>, ExportError> {
    Ok(conn
        .query_row("SELECT value FROM sync_state WHERE key = ?1", params![key], |row| row.get(0))
        .optional()?)
}

/// Datos para el PDF. Con `encounter_id` solo esa consulta (y sus documentos);
/// sin el, todas las consultas con nota, de la mas antigua a la mas reciente.
pub fn record_export(
    conn: &Connection,
    patient_id: &str,
    encounter_id: Option<&str>,
) -> Result<RecordExport, ExportError> {
    let profile = clinical::get_patient_profile(conn, patient_id)?;
    let sex: Option<String> = conn
        .query_row("SELECT sex FROM patients WHERE id = ?1", params![patient_id], |row| row.get(0))
        .optional()?
        .flatten();

    let ids: Vec<String> = match encounter_id {
        Some(id) => {
            let owner: Option<String> = conn
                .query_row("SELECT patient_id FROM encounters WHERE id = ?1", params![id], |row| row.get(0))
                .optional()?;
            if owner.as_deref() != Some(patient_id) {
                return Err(ExportError::Invalid("la consulta no pertenece a este paciente".into()));
            }
            vec![id.to_string()]
        }
        None => conn
            .prepare("SELECT id FROM encounters WHERE patient_id = ?1 ORDER BY opened_at ASC")?
            .query_map(params![patient_id], |row| row.get(0))?
            .collect::<Result<_, _>>()?,
    };

    let mut encounters = Vec::new();
    for id in ids {
        let detail = clinical::get_encounter_detail(conn, &id)?;
        // Una consulta abierta y vacia no dice nada en el expediente impreso.
        if detail.note.is_none() && detail.prescription.is_none() && encounter_id.is_none() {
            continue;
        }
        encounters.push(ExportEncounter {
            id: detail.encounter.id,
            opened_at: detail.encounter.opened_at,
            status: detail.encounter.status,
            signed_at: detail.encounter.signed_at,
            signed_hash: detail.encounter.signed_hash,
            note_version: detail.note.as_ref().map(|n| n.version),
            note_saved_at: detail.note.as_ref().map(|n| n.created_at.clone()),
            note: detail.note.map(|n| n.content),
            prescription: detail.prescription,
        });
    }

    let documents = conn
        .prepare(
            "SELECT id, file_name, mime_type, size_bytes, title, category, received_at, encounter_id, sha256
             FROM documents WHERE patient_id = ?1 AND (?2 IS NULL OR encounter_id = ?2)
             ORDER BY received_at ASC, id",
        )?
        .query_map(params![patient_id, encounter_id], |row| {
            Ok(ExportDocument {
                id: row.get(0)?,
                file_name: row.get(1)?,
                mime_type: row.get(2)?,
                size_bytes: row.get(3)?,
                title: row.get(4)?,
                category: row.get(5)?,
                received_at: row.get(6)?,
                encounter_id: row.get(7)?,
                sha256: row.get(8)?,
            })
        })?
        .collect::<Result<_, _>>()?;

    Ok(RecordExport {
        generated_at: chrono::Utc::now().to_rfc3339(),
        doctor: ExportDoctor { name: state(conn, "doctor_name")?, license: state(conn, "doctor_license")? },
        patient: profile.patient,
        sex,
        encounters,
        documents,
    })
}

/// Nombre de archivo seguro para sugerir en "Guardar como".
pub fn suggested_file_name(stem: &str, extension: &str) -> String {
    let cleaned: String = stem
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
        .collect();
    let compact = cleaned
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    let stem = if compact.is_empty() { "expediente".to_string() } else { compact };
    format!("{}.{extension}", stem.chars().take(80).collect::<String>())
}

/// Escribe la exportacion que llega de la interfaz (base64) en la ruta elegida
/// y la deja en la bitacora.
pub fn write_export(
    conn: &Connection,
    path: &std::path::Path,
    patient_id: &str,
    kind: &str,
    content_base64: &str,
) -> Result<String, ExportError> {
    let bytes = STANDARD
        .decode(content_base64.trim())
        .map_err(|_| ExportError::Invalid("el contenido de la exportacion no es valido".into()))?;
    write_export_bytes(conn, path, patient_id, kind, &bytes)
}

/// Valida que el contenido corresponda al tipo, lo escribe y lo deja en la
/// bitacora con nombre de archivo y huella, nunca con el contenido. Para el
/// directorio, `patient_id` es "directorio".
pub fn write_export_bytes(
    conn: &Connection,
    path: &std::path::Path,
    patient_id: &str,
    kind: &str,
    bytes: &[u8],
) -> Result<String, ExportError> {
    if !EXPORT_KINDS.contains(&kind) {
        return Err(ExportError::Invalid(format!("tipo de exportacion no valido: {kind}")));
    }
    if kind.starts_with("PDF") && !bytes.starts_with(b"%PDF-") {
        return Err(ExportError::Invalid("el contenido no es un PDF".into()));
    }
    if kind.starts_with("FHIR") {
        let is_bundle = serde_json::from_slice::<serde_json::Value>(bytes)
            .map(|value| value["resourceType"] == "Bundle")
            .unwrap_or(false);
        if !is_bundle {
            return Err(ExportError::Invalid("el contenido no es un Bundle FHIR".into()));
        }
    }
    if kind.starts_with("CSV") && std::str::from_utf8(bytes).is_err() {
        return Err(ExportError::Invalid("el contenido no es un CSV en UTF-8".into()));
    }
    std::fs::write(path, bytes)?;
    let sha256: String = Sha256::digest(bytes).iter().map(|b| format!("{b:02x}")).collect();
    let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("exportacion");
    conn.execute(
        "INSERT INTO clinical_audit (entity, entity_id, action, at, details)
         VALUES ('export', ?1, ?2, ?3, ?4)",
        params![patient_id, kind, chrono::Utc::now().to_rfc3339(), format!("{file_name} sha256={sha256}")],
    )?;
    Ok(sha256)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clinical::{CodedDiagnosis, NoteContent};
    use crate::db::open_encrypted;

    fn test_conn(name: &str) -> Connection {
        let dir = std::env::temp_dir().join("midoc-export-tests");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(format!("{name}-{}.db", uuid::Uuid::new_v4()));
        open_encrypted(&path, "frase-de-prueba-123").unwrap()
    }

    fn seed(conn: &Connection) -> (String, String) {
        conn.execute(
            "INSERT INTO patients (id, first_name, last_name, sex, birth_date, allergies, created_at, updated_at)
             VALUES ('p1', 'Ana', 'Ruiz', 'F', '1990-05-01', 'Penicilina', '2026-01-01', '2026-01-01'),
                    ('p2', 'Otro', 'Paciente', NULL, NULL, NULL, '2026-01-01', '2026-01-01')",
            [],
        )
        .unwrap();
        crate::sync::set_state(conn, "doctor_name", "Dra. Eva Soto").unwrap();
        crate::sync::set_state(conn, "doctor_license", "1234567").unwrap();

        let first = clinical::open_encounter_for_patient(conn, "p1").unwrap();
        clinical::save_note(
            conn,
            &first.id,
            &NoteContent {
                subjective: "Tos".into(),
                coded_diagnoses: vec![CodedDiagnosis { code: "J459".into(), name: String::new(), principal: true }],
                ..Default::default()
            },
        )
        .unwrap();
        clinical::save_prescription(conn, &first.id, "Salbutamol").unwrap();
        clinical::sign_encounter(conn, &first.id).unwrap();

        // Consulta abierta y vacia: no debe salir en el expediente completo.
        clinical::open_encounter_for_patient(conn, "p1").unwrap();

        let second = clinical::open_encounter_for_patient(conn, "p1").unwrap();
        clinical::save_note(conn, &second.id, &NoteContent { plan: "Control".into(), ..Default::default() }).unwrap();
        (first.id, second.id)
    }

    #[test]
    fn exports_the_whole_record_with_doctor_identity_and_signed_hash() {
        let conn = test_conn("record");
        let (first, second) = seed(&conn);
        let export = record_export(&conn, "p1", None).unwrap();

        assert_eq!(export.doctor.name.as_deref(), Some("Dra. Eva Soto"));
        assert_eq!(export.doctor.license.as_deref(), Some("1234567"));
        assert_eq!(export.patient.first_name, "Ana");
        assert_eq!(export.sex.as_deref(), Some("F"));
        assert_eq!(
            export.encounters.iter().map(|e| e.id.as_str()).collect::<Vec<_>>(),
            vec![first.as_str(), second.as_str()],
            "en orden y sin la consulta vacia"
        );
        let signed = &export.encounters[0];
        assert_eq!(signed.status, "SIGNED");
        assert!(signed.signed_hash.is_some());
        assert_eq!(signed.prescription.as_deref(), Some("Salbutamol"));
        assert_eq!(signed.note.as_ref().unwrap().coded_diagnoses[0].code, "J459");
    }

    #[test]
    fn exports_a_single_encounter_and_refuses_other_patients() {
        let conn = test_conn("single");
        let (first, _) = seed(&conn);
        let export = record_export(&conn, "p1", Some(&first)).unwrap();
        assert_eq!(export.encounters.len(), 1);
        assert_eq!(export.encounters[0].note_version, Some(1));

        let err = record_export(&conn, "p2", Some(&first)).unwrap_err();
        assert!(err.to_string().contains("no pertenece"), "{err}");
    }

    #[test]
    fn writes_the_file_and_audits_without_content() {
        let conn = test_conn("write");
        seed(&conn);
        let dir = std::env::temp_dir().join("midoc-export-tests");
        let path = dir.join(format!("salida-{}.pdf", uuid::Uuid::new_v4()));
        let pdf = b"%PDF-1.7\nexpediente de Ana";

        let sha = write_export(&conn, &path, "p1", "PDF_EXPEDIENTE", &STANDARD.encode(pdf)).unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), pdf);

        let (action, details): (String, String) = conn
            .query_row(
                "SELECT action, details FROM clinical_audit WHERE entity = 'export' AND entity_id = 'p1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(action, "PDF_EXPEDIENTE");
        assert!(details.contains(&sha));
        assert!(!details.contains("Ana"), "la bitacora no guarda contenido");

        assert!(write_export(&conn, &path, "p1", "PDF_CONSULTA", &STANDARD.encode(b"no es pdf")).is_err());
        assert!(write_export(&conn, &path, "p1", "OTRA_COSA", &STANDARD.encode(pdf)).is_err());
        assert!(write_export_bytes(&conn, &path, "p1", "FHIR_EXPEDIENTE", pdf).is_err(), "un FHIR debe ser JSON");
        assert!(
            write_export_bytes(&conn, &path, "p1", "FHIR_EXPEDIENTE", br#"{"resourceType":"Patient"}"#).is_err(),
            "un FHIR debe ser un Bundle"
        );
        assert!(write_export_bytes(&conn, &path, "p1", "FHIR_EXPEDIENTE", br#"{"resourceType":"Bundle"}"#).is_ok());
    }

    #[test]
    fn suggests_safe_file_names() {
        assert_eq!(suggested_file_name("Expediente Ana Ruiz 2026-10-06", "pdf"), "Expediente-Ana-Ruiz-2026-10-06.pdf");
        assert_eq!(suggested_file_name("../../etc/passwd", "pdf"), "etc-passwd.pdf");
        assert_eq!(suggested_file_name("***", "pdf"), "expediente.pdf");
    }
}
