//! Derechos ARCO (paso 12): Acceso, Rectificacion, Cancelacion y Oposicion.
//! Por decision del inventario funcional, el medico atiende ARCO desde su app
//! local porque el expediente clinico es suyo y reside en este equipo cifrado;
//! la nube nunca tuvo el contenido clinico.
//!
//! Residencia: el expediente es CLINICO (solo local). El registro de la
//! solicitud (`arco_requests`) es OPERATIVO: guarda metadatos de la gestion,
//! nunca contenido clinico.
//!
//! Cancelacion (borrado): elimina el expediente clinico del paciente y
//! seudonimiza su identidad, pero preserva los registros contables (cobros y
//! recibos) por obligacion de retencion fiscal; esos solo guardan importes e
//! IDs, sin datos personales sensibles.

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum ArcoError {
    #[error("error de base de datos: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("{0}")]
    Invalid(String),
    #[error("no encontrado")]
    NotFound,
}

/// Tipos de solicitud ARCO. Se guardan como texto.
const REQUEST_TYPES: &[&str] = &["ACCESS", "RECTIFICATION", "CANCELLATION", "OPPOSITION"];
const ANON: &str = "[ELIMINADO]";

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn audit(
    conn: &Connection,
    entity_id: &str,
    action: &str,
    details: Option<&str>,
) -> Result<(), ArcoError> {
    conn.execute(
        "INSERT INTO clinical_audit (entity, entity_id, action, at, details)
         VALUES ('ArcoRequest', ?1, ?2, ?3, ?4)",
        params![entity_id, action, now(), details],
    )?;
    Ok(())
}

/* ---------- Tipos ---------- */

#[derive(Debug, Serialize)]
pub struct ArcoRequest {
    pub id: String,
    pub patient_id: String,
    pub request_type: String,
    pub status: String,
    pub notes: Option<String>,
    pub requested_at: String,
    pub fulfilled_at: Option<String>,
    pub result_summary: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct NoteExport {
    pub version: i64,
    pub subjective: String,
    pub objective: String,
    pub assessment: String,
    pub plan: String,
    pub diagnosis: String,
    pub instructions: String,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct EncounterExport {
    pub id: String,
    pub appointment_id: Option<String>,
    pub status: String,
    pub opened_at: String,
    pub signed_at: Option<String>,
    pub notes: Vec<NoteExport>,
    pub prescriptions: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct DocumentExport {
    pub id: String,
    pub file_name: String,
    pub mime_type: String,
    pub category: Option<String>,
    pub size_bytes: i64,
    pub received_at: String,
}

#[derive(Debug, Serialize)]
pub struct PatientDataExport {
    pub patient_id: String,
    pub first_name: String,
    pub last_name: String,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub birth_date: Option<String>,
    pub sex: Option<String>,
    pub allergies: Option<String>,
    pub medical_background: Option<String>,
    pub family_background: Option<String>,
    /// Responsable/tutor del paciente (paso 18). Para un menor, es quien ejerce
    /// sus derechos ARCO.
    pub guardian: Option<crate::clinical::Guardian>,
    /// Derivado de la fecha de nacimiento al momento de exportar.
    pub is_minor: bool,
    /// Nota explicita de quien ejerce los derechos ARCO cuando el paciente es
    /// menor de edad; ausente para pacientes mayores.
    pub rights_exercised_by: Option<String>,
    pub encounters: Vec<EncounterExport>,
    pub documents: Vec<DocumentExport>,
    pub generated_at: String,
}

#[derive(Debug, Serialize)]
pub struct CancellationResult {
    pub patient_id: String,
    pub deleted_encounters: usize,
    pub deleted_notes: usize,
    pub deleted_prescriptions: usize,
    pub deleted_documents: usize,
    pub deleted_ai_runs: usize,
    pub deleted_ai_consents: usize,
    pub deleted_precheckins: usize,
    pub anonymized_visits: usize,
    pub anonymized_appointments: usize,
}

fn ensure_patient(conn: &Connection, patient_id: &str) -> Result<(), ArcoError> {
    let exists: bool = conn
        .query_row(
            "SELECT 1 FROM patients WHERE id = ?1",
            params![patient_id],
            |_| Ok(true),
        )
        .optional()?
        .unwrap_or(false);
    if !exists {
        return Err(ArcoError::NotFound);
    }
    Ok(())
}

fn row_to_request(row: &rusqlite::Row) -> rusqlite::Result<ArcoRequest> {
    Ok(ArcoRequest {
        id: row.get(0)?,
        patient_id: row.get(1)?,
        request_type: row.get(2)?,
        status: row.get(3)?,
        notes: row.get(4)?,
        requested_at: row.get(5)?,
        fulfilled_at: row.get(6)?,
        result_summary: row.get(7)?,
    })
}

const REQUEST_COLUMNS: &str =
    "id, patient_id, request_type, status, notes, requested_at, fulfilled_at, result_summary";

/* ---------- Registro de solicitudes ---------- */

/// Registra una solicitud ARCO para un paciente. Estado inicial PENDING.
pub fn record_arco_request(
    conn: &Connection,
    patient_id: &str,
    request_type: &str,
    notes: Option<&str>,
) -> Result<ArcoRequest, ArcoError> {
    ensure_patient(conn, patient_id)?;
    if !REQUEST_TYPES.contains(&request_type) {
        return Err(ArcoError::Invalid(format!(
            "tipo de solicitud invalido: {request_type}"
        )));
    }

    let id = format!("arco-{}", uuid::Uuid::new_v4());
    let requested_at = now();
    conn.execute(
        "INSERT INTO arco_requests (id, patient_id, request_type, status, notes, requested_at)
         VALUES (?1, ?2, ?3, 'PENDING', ?4, ?5)",
        params![id, patient_id, request_type, notes, requested_at],
    )?;
    audit(conn, &id, "arco.request.recorded", Some(request_type))?;

    get_request(conn, &id)
}

pub fn get_request(conn: &Connection, request_id: &str) -> Result<ArcoRequest, ArcoError> {
    conn.query_row(
        &format!("SELECT {REQUEST_COLUMNS} FROM arco_requests WHERE id = ?1"),
        params![request_id],
        row_to_request,
    )
    .optional()?
    .ok_or(ArcoError::NotFound)
}

pub fn list_arco_requests(conn: &Connection) -> Result<Vec<ArcoRequest>, ArcoError> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {REQUEST_COLUMNS} FROM arco_requests ORDER BY requested_at DESC"
    ))?;
    let rows = stmt.query_map([], row_to_request)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// Marca una solicitud como atendida (para acceso, rectificacion u oposicion,
/// que el medico resuelve con el flujo clinico existente).
pub fn mark_fulfilled(
    conn: &Connection,
    request_id: &str,
    result_summary: &str,
) -> Result<ArcoRequest, ArcoError> {
    let affected = conn.execute(
        "UPDATE arco_requests SET status = 'FULFILLED', fulfilled_at = ?2, result_summary = ?3
         WHERE id = ?1 AND status = 'PENDING'",
        params![request_id, now(), result_summary],
    )?;
    if affected == 0 {
        return Err(ArcoError::NotFound);
    }
    audit(conn, request_id, "arco.request.fulfilled", None)?;
    get_request(conn, request_id)
}

/* ---------- Acceso / portabilidad ---------- */

/// Exporta todo el expediente clinico de un paciente (derecho de acceso y
/// portabilidad). Incluye datos personales, encuentros, notas, recetas y
/// metadatos de documentos.
pub fn export_patient_data(
    conn: &Connection,
    patient_id: &str,
) -> Result<PatientDataExport, ArcoError> {
    let patient = conn
        .query_row(
            "SELECT first_name, last_name, phone, email, birth_date, sex,
                    allergies, medical_background, family_background,
                    guardian_name, guardian_relationship, guardian_phone, guardian_email
             FROM patients WHERE id = ?1",
            params![patient_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, Option<String>>(7)?,
                    row.get::<_, Option<String>>(8)?,
                    row.get::<_, Option<String>>(9)?,
                    row.get::<_, Option<String>>(10)?,
                    row.get::<_, Option<String>>(11)?,
                    row.get::<_, Option<String>>(12)?,
                ))
            },
        )
        .optional()?
        .ok_or(ArcoError::NotFound)?;

    let mut encounters = Vec::new();
    let mut stmt = conn.prepare(
        "SELECT id, appointment_id, status, opened_at, signed_at
         FROM encounters WHERE patient_id = ?1 ORDER BY opened_at ASC",
    )?;
    let encounter_rows = stmt
        .query_map(params![patient_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<String>>(4)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    for (id, appointment_id, status, opened_at, signed_at) in encounter_rows {
        let mut notes_stmt = conn.prepare(
            "SELECT version, subjective, objective, assessment, plan, diagnosis,
                    instructions, created_at
             FROM note_versions WHERE encounter_id = ?1 ORDER BY version ASC",
        )?;
        let notes = notes_stmt
            .query_map(params![id], |row| {
                Ok(NoteExport {
                    version: row.get(0)?,
                    subjective: row.get(1)?,
                    objective: row.get(2)?,
                    assessment: row.get(3)?,
                    plan: row.get(4)?,
                    diagnosis: row.get(5)?,
                    instructions: row.get(6)?,
                    created_at: row.get(7)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        let mut presc_stmt =
            conn.prepare("SELECT content FROM prescriptions WHERE encounter_id = ?1")?;
        let prescriptions = presc_stmt
            .query_map(params![id], |row| row.get::<_, String>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;

        encounters.push(EncounterExport {
            id,
            appointment_id,
            status,
            opened_at,
            signed_at,
            notes,
            prescriptions,
        });
    }

    let mut docs_stmt = conn.prepare(
        "SELECT id, file_name, mime_type, category, size_bytes, received_at
         FROM documents WHERE patient_id = ?1 ORDER BY received_at ASC",
    )?;
    let documents = docs_stmt
        .query_map(params![patient_id], |row| {
            Ok(DocumentExport {
                id: row.get(0)?,
                file_name: row.get(1)?,
                mime_type: row.get(2)?,
                category: row.get(3)?,
                size_bytes: row.get(4)?,
                received_at: row.get(5)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    audit(conn, patient_id, "arco.data.exported", None)?;

    // El responsable, si existe, ejerce los derechos ARCO de un menor. Se hace
    // explicito en el export para que la entrega documente quien los ejerce.
    let guardian = crate::clinical::guardian_from(
        patient.9.clone(),
        patient.10.clone(),
        patient.11.clone(),
        patient.12.clone(),
    );
    let is_minor = crate::clinical::is_minor(patient.4.as_deref());
    let rights_exercised_by = if is_minor {
        Some(match &guardian {
            Some(g) => format!(
                "Paciente menor de edad; los derechos ARCO los ejerce su responsable: {}{}.",
                g.name,
                g.relationship
                    .as_deref()
                    .map(|r| format!(" ({r})"))
                    .unwrap_or_default()
            ),
            None => "Paciente menor de edad sin responsable registrado; verificar quien ejerce sus derechos ARCO.".to_string(),
        })
    } else {
        None
    };

    Ok(PatientDataExport {
        patient_id: patient_id.to_string(),
        first_name: patient.0,
        last_name: patient.1,
        phone: patient.2,
        email: patient.3,
        birth_date: patient.4,
        sex: patient.5,
        allergies: patient.6,
        medical_background: patient.7,
        family_background: patient.8,
        guardian,
        is_minor,
        rights_exercised_by,
        encounters,
        documents,
        generated_at: now(),
    })
}

/* ---------- Cancelacion (borrado) ---------- */

/// Atiende una solicitud de cancelacion: elimina el expediente clinico del
/// paciente y seudonimiza su identidad, preservando los registros contables.
/// Marca la solicitud como cumplida. Todo dentro de una transaccion.
pub fn fulfill_cancellation(
    conn: &mut Connection,
    request_id: &str,
) -> Result<CancellationResult, ArcoError> {
    let request = get_request(conn, request_id)?;
    if request.request_type != "CANCELLATION" {
        return Err(ArcoError::Invalid(
            "la solicitud no es de cancelacion".to_string(),
        ));
    }
    if request.status != "PENDING" {
        return Err(ArcoError::Invalid("la solicitud ya fue atendida".to_string()));
    }

    let patient_id = request.patient_id.clone();
    let tx = conn.transaction()?;

    // Orden respetando llaves foraneas (foreign_keys = ON).
    let deleted_ai_runs = tx.execute(
        "DELETE FROM ai_runs WHERE patient_id = ?1
         OR encounter_id IN (SELECT id FROM encounters WHERE patient_id = ?1)",
        params![patient_id],
    )?;
    let deleted_ai_consents =
        tx.execute("DELETE FROM ai_consents WHERE patient_id = ?1", params![patient_id])?;
    let deleted_prescriptions = tx.execute(
        "DELETE FROM prescriptions
         WHERE encounter_id IN (SELECT id FROM encounters WHERE patient_id = ?1)",
        params![patient_id],
    )?;
    let deleted_notes = tx.execute(
        "DELETE FROM note_versions
         WHERE encounter_id IN (SELECT id FROM encounters WHERE patient_id = ?1)",
        params![patient_id],
    )?;
    let deleted_encounters =
        tx.execute("DELETE FROM encounters WHERE patient_id = ?1", params![patient_id])?;
    let deleted_documents =
        tx.execute("DELETE FROM documents WHERE patient_id = ?1", params![patient_id])?;
    let deleted_precheckins = tx.execute(
        "DELETE FROM precheckins
         WHERE appointment_id IN (SELECT id FROM appointments WHERE patient_id = ?1)",
        params![patient_id],
    )?;

    // Seudonimizar registros operativos que se conservan por historial/contable.
    let anonymized_visits = tx.execute(
        "UPDATE visits SET patient_name = ?2, patient_phone = NULL, reason = NULL
         WHERE patient_id = ?1",
        params![patient_id, ANON],
    )?;
    let anonymized_appointments = tx.execute(
        "UPDATE appointments
         SET patient_first_name = ?2, patient_last_name = '', patient_phone = NULL,
             patient_email = NULL, reason = NULL
         WHERE patient_id = ?1",
        params![patient_id, ANON],
    )?;

    // Seudonimizar la ficha del paciente (se conserva el id para integridad de
    // los cobros, que solo referencian patient_id sin datos personales).
    tx.execute(
        "UPDATE patients
         SET first_name = ?2, last_name = '', phone = NULL, email = NULL,
             birth_date = NULL, sex = NULL, allergies = NULL,
             medical_background = NULL, family_background = NULL, updated_at = ?3
         WHERE id = ?1",
        params![patient_id, ANON, now()],
    )?;

    tx.execute(
        "UPDATE arco_requests
         SET status = 'FULFILLED', fulfilled_at = ?2,
             result_summary = 'Expediente clinico eliminado; identidad seudonimizada.'
         WHERE id = ?1",
        params![request_id, now()],
    )?;

    tx.execute(
        "INSERT INTO clinical_audit (entity, entity_id, action, at, details)
         VALUES ('ArcoRequest', ?1, 'arco.cancellation.fulfilled', ?2, ?3)",
        params![
            request_id,
            now(),
            format!("patient={patient_id}; encounters={deleted_encounters}")
        ],
    )?;

    tx.commit()?;

    Ok(CancellationResult {
        patient_id,
        deleted_encounters,
        deleted_notes,
        deleted_prescriptions,
        deleted_documents,
        deleted_ai_runs,
        deleted_ai_consents,
        deleted_precheckins,
        anonymized_visits,
        anonymized_appointments,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_encrypted;

    fn test_conn(name: &str) -> Connection {
        let dir = std::env::temp_dir().join("midoc-arco-tests");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(format!("{name}-{}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        open_encrypted(&path, "clave-de-prueba").unwrap()
    }

    /// Siembra un paciente con expediente completo y un cobro contable.
    fn seed_patient(conn: &Connection, patient_id: &str) {
        conn.execute(
            "INSERT INTO patients (id, first_name, last_name, phone, email,
                allergies, created_at, updated_at)
             VALUES (?1, 'Rosa', 'Lima', '6140002222', 'rosa@example.com',
                'penicilina', '0', '0')",
            params![patient_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO appointments (id, status, scheduled_start, scheduled_end,
                patient_id, patient_first_name, patient_last_name, patient_phone, updated_at)
             VALUES ('appt-1', 'CONFIRMED', '0', '0', ?1, 'Rosa', 'Lima', '6140002222', '0')",
            params![patient_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO precheckins (appointment_id, responses_json, received_at)
             VALUES ('appt-1', '{\"sintoma\":\"tos\"}', '0')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO encounters (id, appointment_id, patient_id, status, opened_at)
             VALUES ('enc-1', 'appt-1', ?1, 'SIGNED', '0')",
            params![patient_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO note_versions (encounter_id, version, subjective, diagnosis, created_at)
             VALUES ('enc-1', 1, 'tos seca', 'IRA', '0')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO prescriptions (id, encounter_id, content, created_at)
             VALUES ('rx-1', 'enc-1', 'paracetamol', '0')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO documents (id, patient_id, file_name, mime_type, content,
                size_bytes, received_at)
             VALUES ('doc-1', ?1, 'estudio.pdf', 'application/pdf', x'00', 1, '0')",
            params![patient_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO ai_consents (id, patient_id, scope, granted_at)
             VALUES ('cons-1', ?1, 'TEXT_ASSIST', '0')",
            params![patient_id],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO ai_runs (id, encounter_id, patient_id, usage_type, provider,
                prompt_version, status, created_at)
             VALUES ('run-1', 'enc-1', ?1, 'SOAP_ASSIST', 'fake', 'v1', 'APPROVED', '0')",
            params![patient_id],
        )
        .unwrap();
        // Registro contable que debe conservarse tras la cancelacion.
        conn.execute(
            "INSERT INTO cash_sessions (id, opened_at, opening_float_cents)
             VALUES ('cash-1', '0', 0)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO payments (id, cash_session_id, patient_id, amount_cents,
                method, kind, receipt_number, created_at)
             VALUES ('pay-1', 'cash-1', ?1, 50000, 'CASH', 'PAYMENT', 'R-000001', '0')",
            params![patient_id],
        )
        .unwrap();
    }

    #[test]
    fn export_returns_full_clinical_record() {
        let conn = test_conn("export");
        seed_patient(&conn, "pat-1");

        let export = export_patient_data(&conn, "pat-1").unwrap();
        assert_eq!(export.first_name, "Rosa");
        assert_eq!(export.encounters.len(), 1);
        assert_eq!(export.encounters[0].notes.len(), 1);
        assert_eq!(export.encounters[0].prescriptions, vec!["paracetamol"]);
        assert_eq!(export.documents.len(), 1);
    }

    #[test]
    fn export_of_a_minor_documents_who_exercises_their_rights() {
        let conn = test_conn("export-minor");
        conn.execute(
            "INSERT INTO patients (id, first_name, last_name, birth_date,
                guardian_name, guardian_relationship, guardian_phone, created_at, updated_at)
             VALUES ('pat-m', 'Lucia', 'Paz', '2018-03-04',
                'Hugo Paz', 'Padre', '6140002222', '0', '0')",
            [],
        )
        .unwrap();

        let export = export_patient_data(&conn, "pat-m").unwrap();
        assert!(export.is_minor);
        let guardian = export.guardian.expect("el responsable debe viajar");
        assert_eq!(guardian.name, "Hugo Paz");
        let note = export.rights_exercised_by.expect("debe documentar quien ejerce");
        assert!(note.contains("Hugo Paz"));
        assert!(note.contains("Padre"));
    }

    #[test]
    fn export_of_an_adult_has_no_minor_rights_note() {
        let conn = test_conn("export-adult");
        seed_patient(&conn, "pat-1");

        let export = export_patient_data(&conn, "pat-1").unwrap();
        assert!(!export.is_minor);
        assert!(export.rights_exercised_by.is_none());
    }

    #[test]
    fn export_unknown_patient_is_not_found() {
        let conn = test_conn("export-missing");
        assert!(matches!(
            export_patient_data(&conn, "nope"),
            Err(ArcoError::NotFound)
        ));
    }

    #[test]
    fn record_request_validates_type_and_patient() {
        let conn = test_conn("record");
        seed_patient(&conn, "pat-1");

        let req = record_arco_request(&conn, "pat-1", "ACCESS", Some("solicita copia")).unwrap();
        assert_eq!(req.status, "PENDING");
        assert_eq!(req.request_type, "ACCESS");

        assert!(matches!(
            record_arco_request(&conn, "pat-1", "WAT", None),
            Err(ArcoError::Invalid(_))
        ));
        assert!(matches!(
            record_arco_request(&conn, "ghost", "ACCESS", None),
            Err(ArcoError::NotFound)
        ));
    }

    #[test]
    fn cancellation_deletes_clinical_data_keeps_accounting() {
        let mut conn = test_conn("cancel");
        seed_patient(&conn, "pat-1");

        let req = record_arco_request(&conn, "pat-1", "CANCELLATION", None).unwrap();
        let result = fulfill_cancellation(&mut conn, &req.id).unwrap();

        assert_eq!(result.deleted_encounters, 1);
        assert_eq!(result.deleted_notes, 1);
        assert_eq!(result.deleted_prescriptions, 1);
        assert_eq!(result.deleted_documents, 1);
        assert_eq!(result.deleted_ai_runs, 1);
        assert_eq!(result.deleted_ai_consents, 1);
        assert_eq!(result.deleted_precheckins, 1);

        // El expediente clinico desaparecio.
        let encounters: i64 = conn
            .query_row("SELECT count(*) FROM encounters WHERE patient_id='pat-1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(encounters, 0);

        // La identidad quedo seudonimizada.
        let name: String = conn
            .query_row("SELECT first_name FROM patients WHERE id='pat-1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(name, ANON);

        // El registro contable se conserva intacto.
        let payments: i64 = conn
            .query_row("SELECT count(*) FROM payments WHERE patient_id='pat-1'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(payments, 1);

        // La solicitud quedo cumplida.
        let status: String = conn
            .query_row("SELECT status FROM arco_requests WHERE id=?1", params![req.id], |r| r.get(0))
            .unwrap();
        assert_eq!(status, "FULFILLED");
    }

    #[test]
    fn cancellation_rejects_non_cancellation_request() {
        let mut conn = test_conn("cancel-wrong");
        seed_patient(&conn, "pat-1");
        let req = record_arco_request(&conn, "pat-1", "ACCESS", None).unwrap();

        assert!(matches!(
            fulfill_cancellation(&mut conn, &req.id),
            Err(ArcoError::Invalid(_))
        ));
    }
}
