//! Bandeja de la preconsulta configurable, rebanada 3 (paso 32,
//! `V2/16_preconsulta_configurable.md`): lo que llega por el enlace general.
//!
//! El portal anuncia cada envio con `PRECONSULTA_SUBMITTED`; la app baja el
//! sobre sellado, lo abre con su llave y lo guarda aqui. Nunca se adjunta solo:
//! la identidad la declara quien llena el formulario, asi que el medico confirma
//! al adjuntarla a una consulta. Las no adjuntadas se borran al vencer el plazo
//! que elige el medico (60 dias por omision).
//!
//! Lo que llega por un enlace personal (rebanada 4) trae la referencia opaca
//! que esta app genero para un paciente: se liga a el sin pasar por la bandeja
//! y se adjunta sola a su siguiente consulta abierta.

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::sync::{self, SyncError};

const RETENTION_DAYS: &str = "preconsulta_retention_days";
pub const DEFAULT_RETENTION_DAYS: i64 = 60;
pub const RETENTION_OPTIONS: [i64; 5] = [30, 60, 90, 120, 180];
/// Prefijo con el que la conciliacion de antecedentes nombra a la preconsulta
/// como fuente (la columna `source_appointment_id` ya guardaba la cita).
pub const MEDICAL_HISTORY_SOURCE_PREFIX: &str = "preconsulta:";

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

/* ---------- Sobre ---------- */

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Identity {
    first_name: String,
    last_name: String,
    birth_date: String,
    phone_country: String,
    phone: String,
}

/// Lo que se lee del sobre; el resto viaja intacto en `envelope_json`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Envelope {
    kind: String,
    questionnaire_version: i64,
    submitted_at: String,
    identity: Identity,
    first_visit: bool,
    medical_history: Option<serde_json::Value>,
}

/// Guarda una preconsulta ya descifrada. Idempotente por id: una re-entrega
/// tras un ACK perdido no la duplica.
pub fn store(
    conn: &Connection,
    id: &str,
    plaintext: &[u8],
    questionnaire: Option<&serde_json::Value>,
    personal_ref: Option<&str>,
) -> Result<(), SyncError> {
    let (kind, content) = sync::parse_precheckin_envelope(plaintext)?;
    if kind != "preconsulta" {
        return Err(SyncError::Server("sobre de preconsulta desconocido".into()));
    }
    let envelope_json = String::from_utf8(content)
        .map_err(|_| SyncError::Server("preconsulta no es UTF-8".into()))?;
    let envelope: Envelope = serde_json::from_str(&envelope_json)
        .map_err(|_| SyncError::Server("preconsulta con forma invalida".into()))?;
    if envelope.kind != "preconsulta" {
        return Err(SyncError::Server("sobre de preconsulta desconocido".into()));
    }
    let identity = &envelope.identity;
    // Si la referencia no es de este equipo (otro equipo creo el enlace), cae
    // a la bandeja como una del enlace general.
    let patient_id: Option<String> = match personal_ref {
        Some(reference) => conn
            .query_row(
                "SELECT patient_id FROM preconsulta_personal_links WHERE ref = ?1",
                params![reference],
                |row| row.get(0),
            )
            .optional()?,
        None => None,
    };
    conn.execute(
        "INSERT INTO preconsulta_inbox (
            id, questionnaire_version, questionnaire_json, envelope_json, medical_history_json,
            first_name, last_name, birth_date, phone, first_visit, submitted_at, received_at,
            personal_ref, patient_id
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
         ON CONFLICT(id) DO NOTHING",
        params![
            id,
            envelope.questionnaire_version,
            questionnaire.map(|q| q.to_string()),
            envelope_json,
            envelope.medical_history.as_ref().map(|m| m.to_string()),
            identity.first_name.trim(),
            identity.last_name.trim(),
            identity.birth_date,
            format!("{}{}", identity.phone_country, identity.phone),
            envelope.first_visit,
            envelope.submitted_at,
            now(),
            personal_ref,
            patient_id
        ],
    )?;
    Ok(())
}

/* ---------- Retencion ---------- */

pub fn retention_days(conn: &Connection) -> Result<i64, SyncError> {
    Ok(sync::get_state(conn, RETENTION_DAYS)?
        .and_then(|value| value.parse().ok())
        .filter(|days| RETENTION_OPTIONS.contains(days))
        .unwrap_or(DEFAULT_RETENTION_DAYS))
}

pub fn set_retention_days(conn: &Connection, days: i64) -> Result<(), SyncError> {
    if !RETENTION_OPTIONS.contains(&days) {
        return Err(SyncError::Server("plazo de borrado invalido".into()));
    }
    sync::set_state(conn, RETENTION_DAYS, &days.to_string())
}

/// Borra las no adjuntadas que llegaron hace mas del plazo. Devuelve cuantas.
pub fn purge_expired(
    conn: &Connection,
    now: chrono::DateTime<chrono::Utc>,
) -> Result<usize, SyncError> {
    let cutoff = (now - chrono::Duration::days(retention_days(conn)?)).to_rfc3339();
    Ok(conn.execute(
        "DELETE FROM preconsulta_inbox
         WHERE encounter_id IS NULL AND patient_id IS NULL AND received_at < ?1",
        params![cutoff],
    )?)
}

/* ---------- Bandeja ---------- */

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct InboxItem {
    pub id: String,
    pub first_name: String,
    pub last_name: String,
    pub birth_date: String,
    pub phone: String,
    pub first_visit: bool,
    pub submitted_at: String,
    pub received_at: String,
    /// Aun no la abre el medico.
    pub is_new: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Inbox {
    pub items: Vec<InboxItem>,
    pub retention_days: i64,
    pub retention_options: Vec<i64>,
}

/// Las pendientes de adjuntar, la mas reciente primero (ya sin las vencidas).
pub fn list(conn: &Connection) -> Result<Inbox, SyncError> {
    purge_expired(conn, chrono::Utc::now())?;
    let mut statement = conn.prepare(
        "SELECT id, first_name, last_name, birth_date, phone, first_visit,
                submitted_at, received_at, seen_at IS NULL
         FROM preconsulta_inbox WHERE encounter_id IS NULL AND patient_id IS NULL
         ORDER BY submitted_at DESC",
    )?;
    let items = statement
        .query_map([], |row| {
            Ok(InboxItem {
                id: row.get(0)?,
                first_name: row.get(1)?,
                last_name: row.get(2)?,
                birth_date: row.get(3)?,
                phone: row.get(4)?,
                first_visit: row.get(5)?,
                submitted_at: row.get(6)?,
                received_at: row.get(7)?,
                is_new: row.get(8)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Inbox {
        items,
        retention_days: retention_days(conn)?,
        retention_options: RETENTION_OPTIONS.to_vec(),
    })
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Preconsulta {
    pub id: String,
    pub envelope_json: String,
    /// Definicion contestada; `None` si el medico la cambio antes de que llegara.
    pub questionnaire_json: Option<String>,
    pub submitted_at: String,
    pub attached_at: Option<String>,
}

fn preconsulta_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Preconsulta> {
    Ok(Preconsulta {
        id: row.get(0)?,
        envelope_json: row.get(1)?,
        questionnaire_json: row.get(2)?,
        submitted_at: row.get(3)?,
        attached_at: row.get(4)?,
    })
}

const PRECONSULTA_COLUMNS: &str =
    "id, envelope_json, questionnaire_json, submitted_at, attached_at";

/// Abre una de la bandeja y la marca como vista.
pub fn open(conn: &Connection, id: &str) -> Result<Preconsulta, SyncError> {
    let found = conn
        .query_row(
            &format!(
                "SELECT {PRECONSULTA_COLUMNS} FROM preconsulta_inbox
                 WHERE id = ?1 AND encounter_id IS NULL AND patient_id IS NULL"
            ),
            params![id],
            preconsulta_from_row,
        )
        .optional()?
        .ok_or_else(|| SyncError::Server("la preconsulta ya no esta en la bandeja".into()))?;
    conn.execute(
        "UPDATE preconsulta_inbox SET seen_at = COALESCE(seen_at, ?2) WHERE id = ?1",
        params![id, now()],
    )?;
    Ok(found)
}

/// La adjuntada a una consulta, si hay.
pub fn attached_to(conn: &Connection, encounter_id: &str) -> rusqlite::Result<Option<Preconsulta>> {
    conn.query_row(
        &format!("SELECT {PRECONSULTA_COLUMNS} FROM preconsulta_inbox WHERE encounter_id = ?1"),
        params![encounter_id],
        preconsulta_from_row,
    )
    .optional()
}

/// Parte 1 (antecedentes) de la preconsulta adjuntada a una consulta.
pub fn attached_medical_history(
    conn: &Connection,
    encounter_id: &str,
) -> rusqlite::Result<Option<(String, String)>> {
    conn.query_row(
        "SELECT id, medical_history_json FROM preconsulta_inbox
         WHERE encounter_id = ?1 AND medical_history_json IS NOT NULL",
        params![encounter_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .optional()
}

/// Parte 1 de una preconsulta por id, solo si esta adjuntada a esa consulta.
pub fn medical_history_for(
    conn: &Connection,
    preconsulta_id: &str,
    encounter_id: Option<&str>,
) -> rusqlite::Result<Option<String>> {
    conn.query_row(
        "SELECT medical_history_json FROM preconsulta_inbox
         WHERE id = ?1 AND encounter_id IS ?2 AND encounter_id IS NOT NULL",
        params![preconsulta_id, encounter_id],
        |row| row.get(0),
    )
    .optional()
    .map(Option::flatten)
}

fn audit(conn: &Connection, id: &str, action: &str, details: Option<&str>) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO clinical_audit (entity, entity_id, action, at, details)
         VALUES ('preconsulta', ?1, ?2, ?3, ?4)",
        params![id, action, now(), details],
    )?;
    Ok(())
}

/// Adjunta una preconsulta de la bandeja a una consulta abierta. A partir de
/// aqui es parte del expediente (CLINICO) y ya no vence.
pub fn attach(conn: &mut Connection, id: &str, encounter_id: &str) -> Result<(), SyncError> {
    let tx = conn.transaction()?;
    let encounter: Option<(String, String)> = tx
        .query_row(
            "SELECT patient_id, status FROM encounters WHERE id = ?1",
            params![encounter_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;
    let Some((patient_id, status)) = encounter else {
        return Err(SyncError::Server("la consulta no existe".into()));
    };
    if status == "SIGNED" {
        return Err(SyncError::Server(
            "la consulta ya esta firmada; adjunta la preconsulta a una consulta abierta".into(),
        ));
    }
    let taken: bool = tx.query_row(
        "SELECT EXISTS(SELECT 1 FROM preconsulta_inbox WHERE encounter_id = ?1)",
        params![encounter_id],
        |row| row.get(0),
    )?;
    if taken {
        return Err(SyncError::Server(
            "esta consulta ya tiene una preconsulta adjunta".into(),
        ));
    }
    let updated = tx.execute(
        "UPDATE preconsulta_inbox
         SET encounter_id = ?2, patient_id = ?3, attached_at = ?4, seen_at = COALESCE(seen_at, ?4)
         WHERE id = ?1 AND encounter_id IS NULL AND (patient_id IS NULL OR patient_id = ?3)",
        params![id, encounter_id, patient_id, now()],
    )?;
    if updated == 0 {
        return Err(SyncError::Server(
            "la preconsulta ya no esta en la bandeja".into(),
        ));
    }
    audit(
        &tx,
        id,
        "attached",
        Some(&format!("encounter_id={encounter_id}")),
    )?;
    tx.commit()?;
    Ok(())
}

/// Descarta una de la bandeja (spam, duplicada, de alguien que no llego).
/// Las adjuntadas son expediente y no se descartan desde aqui.
pub fn discard(conn: &Connection, id: &str) -> Result<(), SyncError> {
    let deleted = conn.execute(
        "DELETE FROM preconsulta_inbox WHERE id = ?1 AND encounter_id IS NULL AND patient_id IS NULL",
        params![id],
    )?;
    if deleted == 0 {
        return Err(SyncError::Server(
            "la preconsulta ya no esta en la bandeja".into(),
        ));
    }
    // Por referencia: ni nombre ni respuestas.
    audit(conn, id, "discarded", None)?;
    Ok(())
}

/* ---------- Enlace personal ---------- */

/// Referencia opaca para el portal: no deriva del paciente.
pub fn new_personal_ref() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}

pub fn record_personal_link(
    conn: &Connection,
    reference: &str,
    patient_id: &str,
    url: &str,
    expires_at: &str,
) -> Result<(), SyncError> {
    conn.execute(
        "INSERT INTO preconsulta_personal_links (ref, patient_id, url, created_at, expires_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![reference, patient_id, url, now(), expires_at],
    )?;
    Ok(())
}

pub fn patient_exists(conn: &Connection, patient_id: &str) -> Result<bool, SyncError> {
    Ok(conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM patients WHERE id = ?1)",
        params![patient_id],
        |row| row.get(0),
    )?)
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct PersonalLink {
    pub url: String,
    pub created_at: String,
    pub expires_at: String,
    /// Ya llego la respuesta (cuando).
    pub answered_at: Option<String>,
    /// La respuesta ya quedo en una consulta.
    pub attached: bool,
}

/// El enlace personal mas reciente del paciente, con lo que paso con el.
pub fn personal_link(
    conn: &Connection,
    patient_id: &str,
) -> Result<Option<PersonalLink>, SyncError> {
    Ok(conn
        .query_row(
            "SELECT l.url, l.created_at, l.expires_at, i.received_at, i.encounter_id IS NOT NULL
             FROM preconsulta_personal_links l
             LEFT JOIN preconsulta_inbox i ON i.personal_ref = l.ref
             WHERE l.patient_id = ?1
             ORDER BY l.created_at DESC LIMIT 1",
            params![patient_id],
            |row| {
                Ok(PersonalLink {
                    url: row.get(0)?,
                    created_at: row.get(1)?,
                    expires_at: row.get(2)?,
                    answered_at: row.get(3)?,
                    attached: row.get::<_, Option<bool>>(4)?.unwrap_or(false),
                })
            },
        )
        .optional()?)
}

/// Adjunta a una consulta abierta la preconsulta personal que espera a su
/// paciente (la mas reciente). Sin nada que hacer devuelve `false`.
pub fn attach_pending_personal(
    conn: &mut Connection,
    encounter_id: &str,
) -> Result<bool, SyncError> {
    let pending: Option<String> = conn
        .query_row(
            "SELECT i.id FROM preconsulta_inbox i
             JOIN encounters e ON e.id = ?1 AND e.patient_id = i.patient_id
             WHERE i.encounter_id IS NULL AND e.status != 'SIGNED'
               AND NOT EXISTS (SELECT 1 FROM preconsulta_inbox a WHERE a.encounter_id = ?1)
             ORDER BY i.submitted_at DESC LIMIT 1",
            params![encounter_id],
            |row| row.get(0),
        )
        .optional()?;
    match pending {
        Some(id) => attach(conn, &id, encounter_id).map(|_| true),
        None => Ok(false),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_encrypted;

    fn test_conn(name: &str) -> Connection {
        let dir = std::env::temp_dir().join(format!(
            "midoc-preconsulta-inbox-{name}-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        open_encrypted(&dir.join("test.db"), "clave-de-prueba").unwrap()
    }

    fn sealed_body(first_visit: bool) -> Vec<u8> {
        let meta = br#"{"kind":"preconsulta","version":1}"#;
        let mut body = serde_json::json!({
            "kind": "preconsulta",
            "version": 1,
            "questionnaireVersion": 2,
            "linkKind": "GENERAL",
            "submittedAt": "2026-10-20T15:00:00.000Z",
            "consentAt": "2026-10-20T15:00:00.000Z",
            "identity": {
                "firstName": " Ana ", "lastName": "Ruiz", "birthDate": "1990-05-01",
                "phoneCountry": "+52", "phone": "6140001111"
            },
            "firstVisit": first_visit,
            "answers": { "motivo": "Tos de tres dias" }
        });
        if first_visit {
            body["medicalHistory"] = serde_json::json!({ "allergies": "Penicilina" });
        }
        let mut bytes = (meta.len() as u32).to_be_bytes().to_vec();
        bytes.extend_from_slice(meta);
        bytes.extend_from_slice(body.to_string().as_bytes());
        bytes
    }

    fn open_encounter(conn: &Connection, id: &str, status: &str) {
        conn.execute(
            "INSERT OR IGNORE INTO patients (id, first_name, last_name, created_at, updated_at)
             VALUES ('pat-1', 'Ana', 'Ruiz', '2026-01-01', '2026-01-01')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO encounters (id, patient_id, status, opened_at) VALUES (?1, 'pat-1', ?2, '2026-10-20')",
            params![id, status],
        )
        .unwrap();
    }

    #[test]
    fn stores_idempotently_and_lists_as_new_until_opened() {
        let conn = test_conn("store");
        let questionnaire = serde_json::json!({ "schemaVersion": 1, "questions": [] });
        store(
            &conn,
            "sub-1",
            &sealed_body(true),
            Some(&questionnaire),
            None,
        )
        .unwrap();
        store(
            &conn,
            "sub-1",
            &sealed_body(true),
            Some(&questionnaire),
            None,
        )
        .unwrap();

        let inbox = list(&conn).unwrap();
        assert_eq!(inbox.items.len(), 1);
        let item = &inbox.items[0];
        assert_eq!(
            (item.first_name.as_str(), item.phone.as_str()),
            ("Ana", "+526140001111")
        );
        assert!(item.is_new && item.first_visit);
        assert_eq!(inbox.retention_days, 60);

        let opened = open(&conn, "sub-1").unwrap();
        assert!(opened.envelope_json.contains("Tos de tres dias"));
        assert!(opened.questionnaire_json.is_some());
        assert!(!list(&conn).unwrap().items[0].is_new);
    }

    #[test]
    fn rejects_envelopes_of_another_kind() {
        let conn = test_conn("kind");
        let meta = br#"{"kind":"medical-history"}"#;
        let mut bytes = (meta.len() as u32).to_be_bytes().to_vec();
        bytes.extend_from_slice(meta);
        bytes.extend_from_slice(b"{}");
        assert!(store(&conn, "sub-x", &bytes, None, None).is_err());
        assert!(store(&conn, "sub-y", b"xx", None, None).is_err());
    }

    #[test]
    fn attaches_to_an_open_encounter_only_once_and_keeps_part_one() {
        let mut conn = test_conn("attach");
        store(&conn, "sub-1", &sealed_body(true), None, None).unwrap();
        store(&conn, "sub-2", &sealed_body(false), None, None).unwrap();
        open_encounter(&conn, "enc-open", "OPEN");
        open_encounter(&conn, "enc-signed", "SIGNED");

        assert!(attach(&mut conn, "sub-1", "enc-signed").is_err());
        attach(&mut conn, "sub-1", "enc-open").unwrap();
        // Una por consulta, y la adjuntada ya no esta en la bandeja.
        assert!(attach(&mut conn, "sub-2", "enc-open").is_err());
        assert!(attach(&mut conn, "sub-1", "enc-open").is_err());
        assert_eq!(list(&conn).unwrap().items.len(), 1);

        assert_eq!(attached_to(&conn, "enc-open").unwrap().unwrap().id, "sub-1");
        let (source, history) = attached_medical_history(&conn, "enc-open")
            .unwrap()
            .unwrap();
        assert_eq!(source, "sub-1");
        assert!(history.contains("Penicilina"));
        assert_eq!(
            medical_history_for(&conn, "sub-1", Some("enc-open"))
                .unwrap()
                .as_deref(),
            Some(history.as_str())
        );
        assert_eq!(
            medical_history_for(&conn, "sub-1", Some("enc-signed")).unwrap(),
            None
        );
        // Adjuntada es expediente: no se descarta desde la bandeja.
        assert!(discard(&conn, "sub-1").is_err());
    }

    #[test]
    fn discards_and_purges_unattached_after_the_chosen_period() {
        let mut conn = test_conn("purge");
        store(&conn, "old", &sealed_body(false), None, None).unwrap();
        store(&conn, "kept", &sealed_body(false), None, None).unwrap();
        store(&conn, "spam", &sealed_body(false), None, None).unwrap();
        conn.execute(
            "UPDATE preconsulta_inbox SET received_at = '2026-01-01T00:00:00+00:00' WHERE id IN ('old', 'kept')",
            [],
        )
        .unwrap();
        open_encounter(&conn, "enc-1", "OPEN");
        attach(&mut conn, "kept", "enc-1").unwrap();

        discard(&conn, "spam").unwrap();
        assert!(discard(&conn, "spam").is_err());

        assert!(set_retention_days(&conn, 45).is_err());
        set_retention_days(&conn, 90).unwrap();
        let now = chrono::DateTime::parse_from_rfc3339("2026-03-15T00:00:00+00:00")
            .unwrap()
            .to_utc();
        assert_eq!(purge_expired(&conn, now).unwrap(), 0);
        let later = chrono::DateTime::parse_from_rfc3339("2026-04-15T00:00:00+00:00")
            .unwrap()
            .to_utc();
        assert_eq!(purge_expired(&conn, later).unwrap(), 1);
        // La adjuntada sigue: es parte del expediente.
        assert!(attached_to(&conn, "enc-1").unwrap().is_some());
    }

    #[test]
    fn a_personal_link_answer_skips_the_inbox_and_attaches_to_the_next_open_encounter() {
        let mut conn = test_conn("personal");
        open_encounter(&conn, "enc-signed", "SIGNED");
        let reference = new_personal_ref();
        record_personal_link(
            &conn,
            &reference,
            "pat-1",
            "https://midoc/preconsulta/x",
            "2026-11-25T00:00:00Z",
        )
        .unwrap();
        assert_eq!(
            personal_link(&conn, "pat-1").unwrap().unwrap().answered_at,
            None
        );

        store(&conn, "sub-p", &sealed_body(false), None, Some(&reference)).unwrap();
        // De otro equipo: la referencia no se conoce y va a la bandeja.
        store(
            &conn,
            "sub-otro",
            &sealed_body(false),
            None,
            Some("desconocida"),
        )
        .unwrap();
        let inbox = list(&conn).unwrap();
        assert_eq!(
            inbox
                .items
                .iter()
                .map(|i| i.id.as_str())
                .collect::<Vec<_>>(),
            vec!["sub-otro"]
        );
        // No se descarta ni se abre desde la bandeja: ya es del paciente.
        assert!(discard(&conn, "sub-p").is_err());
        // Tampoco vence.
        conn.execute(
            "UPDATE preconsulta_inbox SET received_at = '2020-01-01T00:00:00+00:00'",
            [],
        )
        .unwrap();
        purge_expired(&conn, chrono::Utc::now()).unwrap();

        let status = personal_link(&conn, "pat-1").unwrap().unwrap();
        assert!(status.answered_at.is_some() && !status.attached);

        // Una consulta firmada no la recibe; la siguiente abierta si, una vez.
        assert!(!attach_pending_personal(&mut conn, "enc-signed").unwrap());
        open_encounter(&conn, "enc-open", "OPEN");
        assert!(attach_pending_personal(&mut conn, "enc-open").unwrap());
        assert!(!attach_pending_personal(&mut conn, "enc-open").unwrap());
        assert_eq!(attached_to(&conn, "enc-open").unwrap().unwrap().id, "sub-p");
        assert!(personal_link(&conn, "pat-1").unwrap().unwrap().attached);
    }
}
