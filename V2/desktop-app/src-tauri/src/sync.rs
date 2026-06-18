//! Cliente de sincronizacion (fase A del contrato, `13_contrato_sincronizacion.md`).
//!
//! Pull-only: la app descarga eventos del buzon del portal con un cursor
//! monotono, los aplica de forma idempotente a la base local cifrada y
//! confirma con ACK (momento en el que la nube purga el contenido clinico).

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

#[derive(Debug, thiserror::Error)]
pub enum SyncError {
    #[error("error de red: {0}")]
    Http(#[from] reqwest::Error),
    #[error("error de base de datos: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("{0}")]
    Server(String),
}

#[derive(Debug, Deserialize)]
pub struct InboxEvent {
    // El orden lo dirige `nextCursor` de la respuesta, no el seq individual;
    // se deserializa para completitud del contrato y uso en pruebas.
    #[allow(dead_code)]
    pub seq: i64,
    #[serde(rename = "type")]
    pub event_type: String,
    pub payload: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct InboxResponse {
    pub events: Vec<InboxEvent>,
    #[serde(rename = "nextCursor")]
    pub next_cursor: i64,
}

#[derive(Debug, Serialize)]
pub struct SyncSummary {
    pub applied_events: u64,
    pub cursor: i64,
    pub ai_usage_reported: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AiUsageReportSummary {
    pub reported: u64,
}

/// Metadatos del perfil del medico que la agenda usa: perfil clinico, tamano de
/// bloque (duracion de cita) y ventana de horario laboral. Se obtienen al
/// vincular y se refrescan en cada sincronizacion.
#[derive(Debug, Default)]
pub struct ProfileMetadata {
    pub clinical_profile: Option<String>,
    pub slot_minutes: Option<i64>,
    pub work_start_minutes: Option<i64>,
    pub work_end_minutes: Option<i64>,
}

#[derive(Debug)]
pub struct LinkAccountResult {
    pub device_token: String,
    pub metadata: ProfileMetadata,
}

/* ---------- Estado local ---------- */

pub fn get_state(conn: &Connection, key: &str) -> Result<Option<String>, SyncError> {
    let value = conn
        .query_row(
            "SELECT value FROM sync_state WHERE key = ?1",
            params![key],
            |row| row.get::<_, String>(0),
        )
        .map(Some)
        .or_else(|err| match err {
            rusqlite::Error::QueryReturnedNoRows => Ok(None),
            other => Err(other),
        })?;
    Ok(value)
}

pub fn set_state(conn: &Connection, key: &str, value: &str) -> Result<(), SyncError> {
    conn.execute(
        "INSERT INTO sync_state (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

pub fn delete_state(conn: &Connection, key: &str) -> Result<(), SyncError> {
    conn.execute("DELETE FROM sync_state WHERE key = ?1", params![key])?;
    Ok(())
}

pub fn get_cursor(conn: &Connection) -> Result<i64, SyncError> {
    Ok(get_state(conn, "cursor")?
        .and_then(|value| value.parse().ok())
        .unwrap_or(0))
}

/* ---------- Aplicacion de eventos (idempotente) ---------- */

fn text(value: &serde_json::Value, key: &str) -> Option<String> {
    value.get(key).and_then(|v| v.as_str()).map(String::from)
}

pub fn apply_event(conn: &Connection, event: &InboxEvent) -> Result<(), SyncError> {
    let Some(payload) = &event.payload else {
        // Evento ya purgado en nube (re-entrega tras un ACK perdido): nada que aplicar.
        return Ok(());
    };
    let now = chrono_now();

    match event.event_type.as_str() {
        "APPOINTMENT_BOOKED" => {
            let patient = payload.get("patient").cloned().unwrap_or_default();
            // El responsable (tutor) llega como entidad aparte: nombre, parentesco
            // y su contacto. Es CONTACTO, jamas se mezcla con el paciente.
            let responsible = payload.get("responsible").cloned().unwrap_or_default();
            conn.execute(
                "INSERT INTO appointments (
                    id, status, scheduled_start, scheduled_end, service_name, reason,
                    patient_id, patient_first_name, patient_last_name, patient_phone,
                    patient_email, patient_birth_date, guardian_name, guardian_relationship,
                    guardian_phone, guardian_email, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
                 ON CONFLICT(id) DO UPDATE SET
                    status = excluded.status,
                    scheduled_start = excluded.scheduled_start,
                    scheduled_end = excluded.scheduled_end,
                    patient_birth_date = COALESCE(excluded.patient_birth_date, patient_birth_date),
                    guardian_name = COALESCE(excluded.guardian_name, guardian_name),
                    guardian_relationship = COALESCE(excluded.guardian_relationship, guardian_relationship),
                    guardian_phone = COALESCE(excluded.guardian_phone, guardian_phone),
                    guardian_email = COALESCE(excluded.guardian_email, guardian_email),
                    updated_at = excluded.updated_at",
                params![
                    text(payload, "appointmentId"),
                    text(payload, "status"),
                    text(payload, "scheduledStart"),
                    text(payload, "scheduledEnd"),
                    text(payload, "serviceName"),
                    text(payload, "reason"),
                    text(&patient, "id"),
                    text(&patient, "firstName").unwrap_or_default(),
                    text(&patient, "lastName").unwrap_or_default(),
                    text(&patient, "phone"),
                    text(&patient, "email"),
                    text(&patient, "birthDate"),
                    text(&responsible, "name"),
                    text(&responsible, "relationship"),
                    text(&responsible, "phone"),
                    text(&responsible, "email"),
                    now
                ],
            )?;
        }
        "APPOINTMENT_CONFIRMED" | "APPOINTMENT_CANCELLED" => {
            conn.execute(
                "UPDATE appointments
                 SET status = ?2, cancellation_reason = COALESCE(?3, cancellation_reason), updated_at = ?4
                 WHERE id = ?1",
                params![
                    text(payload, "appointmentId"),
                    text(payload, "status"),
                    text(payload, "cancellationReason"),
                    now
                ],
            )?;
        }
        "APPOINTMENT_RESCHEDULED" => {
            conn.execute(
                "UPDATE appointments
                 SET status = ?2, scheduled_start = ?3, scheduled_end = ?4, updated_at = ?5
                 WHERE id = ?1",
                params![
                    text(payload, "appointmentId"),
                    text(payload, "status"),
                    text(payload, "scheduledStart"),
                    text(payload, "scheduledEnd"),
                    now
                ],
            )?;
        }
        // Antecedentes sellados (sealed box): el contenido NO viaja en el
        // payload; se descarga y descifra aparte (store_mailbox_precheckin), por
        // lo que este evento no hace nada aqui (no pisarlo con "{}").
        "PRECHECKIN_SUBMITTED"
            if payload.get("sealed").and_then(|v| v.as_bool()) == Some(true) => {}
        "PRECHECKIN_SUBMITTED" => {
            let responses = payload
                .get("responses")
                .map(|value| value.to_string())
                .unwrap_or_else(|| "{}".to_string());
            conn.execute(
                "INSERT INTO precheckins (appointment_id, responses_json, received_at)
                 VALUES (?1, ?2, ?3)
                 ON CONFLICT(appointment_id) DO UPDATE SET
                    responses_json = excluded.responses_json,
                    received_at = excluded.received_at",
                params![text(payload, "appointmentId"), responses, now],
            )?;
        }
        _ => {
            // Tipo desconocido (version mas nueva del portal): se ignora sin
            // romper; el evento queda confirmado para no atorar la cola.
        }
    }

    Ok(())
}

pub fn apply_batch(conn: &mut Connection, events: &[InboxEvent]) -> Result<(), SyncError> {
    let tx = conn.transaction()?;
    for event in events {
        apply_event(&tx, event)?;
    }
    tx.commit()?;
    Ok(())
}

fn chrono_now() -> String {
    // RFC3339 sin dependencia extra: SQLite formatea UTC.
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_default()
}

/* ---------- HTTP ---------- */

async fn error_from_response(response: reqwest::Response) -> SyncError {
    let status = response.status();
    let message = response
        .json::<serde_json::Value>()
        .await
        .ok()
        .and_then(|body| body.get("error").and_then(|v| v.as_str()).map(String::from))
        .unwrap_or_else(|| format!("el servidor respondio {status}"));
    SyncError::Server(message)
}

fn extract_clinical_profile(body: &serde_json::Value) -> Option<String> {
    let specialty = body
        .get("profile")
        .and_then(|profile| profile.get("specialty"))
        .and_then(|value| value.as_str())?;

    match specialty {
        "GENERAL_MEDICINE" | "ODONTOLOGY" => Some(specialty.to_string()),
        _ => None,
    }
}

/// Duracion de cita configurada por el medico (`consultationDuration` del
/// perfil). Define el tamano de bloque de la agenda semanal en la app.
fn extract_slot_minutes(body: &serde_json::Value) -> Option<i64> {
    body.get("profile")
        .and_then(|profile| profile.get("consultationDuration"))
        .and_then(|value| value.as_i64())
        .filter(|minutes| *minutes > 0)
}

/// Convierte "HH:MM" a minutos desde medianoche.
fn parse_hhmm_to_minutes(value: &str) -> Option<i64> {
    let (h, m) = value.trim().split_once(':')?;
    let h: i64 = h.trim().parse().ok()?;
    let m: i64 = m.trim().parse().ok()?;
    if (0..=24).contains(&h) && (0..=59).contains(&m) {
        Some(h * 60 + m)
    } else {
        None
    }
}

/// Ventana de horario laboral del medico tomada de sus reglas de disponibilidad
/// (`availabilityRules` del perfil): el inicio mas temprano y el fin mas tardio
/// entre las reglas activas. Define el rango de bloques que muestra la agenda.
fn extract_working_hours(body: &serde_json::Value) -> (Option<i64>, Option<i64>) {
    let Some(rules) = body
        .get("profile")
        .and_then(|profile| profile.get("availabilityRules"))
        .and_then(|rules| rules.as_array())
    else {
        return (None, None);
    };

    let mut start: Option<i64> = None;
    let mut end: Option<i64> = None;
    for rule in rules {
        // Saltar reglas explicitamente inactivas.
        if rule.get("isActive").and_then(|v| v.as_bool()) == Some(false) {
            continue;
        }
        if let Some(s) = rule
            .get("startTime")
            .and_then(|v| v.as_str())
            .and_then(parse_hhmm_to_minutes)
        {
            start = Some(start.map_or(s, |cur| cur.min(s)));
        }
        if let Some(e) = rule
            .get("endTime")
            .and_then(|v| v.as_str())
            .and_then(parse_hhmm_to_minutes)
        {
            end = Some(end.map_or(e, |cur| cur.max(e)));
        }
    }
    (start, end)
}

/// Reune los metadatos del perfil (perfil clinico, duracion de cita y horario
/// laboral) desde una respuesta con el campo `profile`. Mismo shape en
/// `/api/admin/profile` (al vincular) y `/api/sync/profile` (al sincronizar).
fn profile_metadata_from_body(body: &serde_json::Value) -> ProfileMetadata {
    let (work_start_minutes, work_end_minutes) = extract_working_hours(body);
    ProfileMetadata {
        clinical_profile: extract_clinical_profile(body),
        slot_minutes: extract_slot_minutes(body),
        work_start_minutes,
        work_end_minutes,
    }
}

/// Trae los metadatos del perfil del medico con el device token (sin sesion),
/// para refrescar agenda/perfil en cada sincronizacion.
pub async fn fetch_profile_metadata(
    server_url: &str,
    device_token: &str,
) -> Result<ProfileMetadata, SyncError> {
    let client = reqwest::Client::new();
    let base = server_url.trim_end_matches('/');
    let response = client
        .get(format!("{base}/api/sync/profile"))
        .bearer_auth(device_token)
        .send()
        .await?;

    if !response.status().is_success() {
        return Err(error_from_response(response).await);
    }

    Ok(profile_metadata_from_body(&response.json().await?))
}

/// Inicia sesion en el portal y registra este equipo como dispositivo de
/// sincronizacion. Devuelve el device token (se guarda en la base cifrada).
pub async fn link_account(
    server_url: &str,
    email: &str,
    password: &str,
    device_name: &str,
    document_public_key: &str,
) -> Result<LinkAccountResult, SyncError> {
    let client = reqwest::Client::builder().cookie_store(true).build()?;
    let base = server_url.trim_end_matches('/');

    let login = client
        .post(format!("{base}/api/auth/login"))
        .json(&serde_json::json!({ "email": email, "password": password }))
        .send()
        .await?;

    if !login.status().is_success() {
        return Err(error_from_response(login).await);
    }

    let profile = client
        .get(format!("{base}/api/admin/profile"))
        .send()
        .await?;

    if !profile.status().is_success() {
        return Err(error_from_response(profile).await);
    }

    let metadata = profile_metadata_from_body(&profile.json::<serde_json::Value>().await?);

    // La llave publica del medico viaja al vincular: el portal la entrega a la
    // pagina de carga del paciente para cifrar documentos (sealed box).
    let device = client
        .post(format!("{base}/api/sync/devices"))
        .json(&serde_json::json!({
            "deviceName": device_name,
            "documentPublicKey": document_public_key
        }))
        .send()
        .await?;

    if !device.status().is_success() {
        return Err(error_from_response(device).await);
    }

    let body: serde_json::Value = device.json().await?;
    let device_token = body
        .get("deviceToken")
        .and_then(|v| v.as_str())
        .map(String::from)
        .ok_or_else(|| SyncError::Server("respuesta sin deviceToken".into()))?;

    Ok(LinkAccountResult {
        device_token,
        metadata,
    })
}

pub async fn fetch_inbox(
    server_url: &str,
    device_token: &str,
    cursor: i64,
) -> Result<InboxResponse, SyncError> {
    let client = reqwest::Client::new();
    let base = server_url.trim_end_matches('/');

    let response = client
        .get(format!("{base}/api/sync/inbox?cursor={cursor}"))
        .bearer_auth(device_token)
        .send()
        .await?;

    if !response.status().is_success() {
        return Err(error_from_response(response).await);
    }

    Ok(response.json().await?)
}

pub async fn send_ack(server_url: &str, device_token: &str, cursor: i64) -> Result<(), SyncError> {
    let client = reqwest::Client::new();
    let base = server_url.trim_end_matches('/');

    let response = client
        .post(format!("{base}/api/sync/ack"))
        .bearer_auth(device_token)
        .json(&serde_json::json!({ "cursor": cursor }))
        .send()
        .await?;

    if !response.status().is_success() {
        return Err(error_from_response(response).await);
    }

    Ok(())
}

/// Descarga el ciphertext (sealed box, base64) de un documento del buzon. Se
/// descifra localmente con la llave del medico (`crypto::unseal_document`).
pub async fn fetch_document(
    server_url: &str,
    device_token: &str,
    document_id: &str,
) -> Result<String, SyncError> {
    let client = reqwest::Client::new();
    let base = server_url.trim_end_matches('/');

    let response = client
        .get(format!("{base}/api/sync/documents/{document_id}"))
        .bearer_auth(device_token)
        .send()
        .await?;

    if !response.status().is_success() {
        return Err(error_from_response(response).await);
    }

    let body: serde_json::Value = response.json().await?;
    body.get("ciphertext")
        .and_then(|v| v.as_str())
        .map(String::from)
        .ok_or_else(|| SyncError::Server("respuesta sin ciphertext".into()))
}

/// Descarga el ciphertext (sealed box, base64) de los antecedentes de un
/// paciente. Se descifra localmente con la llave del medico, igual que un
/// documento del buzon.
pub async fn fetch_precheckin(
    server_url: &str,
    device_token: &str,
    precheckin_id: &str,
) -> Result<String, SyncError> {
    let client = reqwest::Client::new();
    let base = server_url.trim_end_matches('/');

    let response = client
        .get(format!("{base}/api/sync/precheckins/{precheckin_id}"))
        .bearer_auth(device_token)
        .send()
        .await?;

    if !response.status().is_success() {
        return Err(error_from_response(response).await);
    }

    let body: serde_json::Value = response.json().await?;
    body.get("ciphertext")
        .and_then(|v| v.as_str())
        .map(String::from)
        .ok_or_else(|| SyncError::Server("respuesta sin ciphertext".into()))
}

/// Publica un resumen autorizado cifrado al portal (app -> nube). El payload es
/// `nonce||mac||ciphertext`; la nube lo guarda sin poder abrirlo. Devuelve la
/// URL de descarga (sin la llave, que el llamador agrega en el fragmento).
pub async fn publish_summary(
    server_url: &str,
    device_token: &str,
    patient_id: &str,
    appointment_id: Option<&str>,
    title: Option<&str>,
    payload: &[u8],
) -> Result<String, SyncError> {
    let client = reqwest::Client::new();
    let base = server_url.trim_end_matches('/');

    let response = client
        .post(format!("{base}/api/sync/summaries"))
        .bearer_auth(device_token)
        .json(&serde_json::json!({
            "patientId": patient_id,
            "appointmentId": appointment_id,
            "title": title,
            "ciphertext": BASE64.encode(payload)
        }))
        .send()
        .await?;

    if !response.status().is_success() {
        return Err(error_from_response(response).await);
    }

    let body: serde_json::Value = response.json().await?;
    body.get("downloadUrl")
        .and_then(|v| v.as_str())
        .map(String::from)
        .ok_or_else(|| SyncError::Server("respuesta sin downloadUrl".into()))
}

/// Reporta al portal solo metadatos/referencias de uso IA. El contenido
/// clinico, prompts redactados y salidas permanecen en la base local cifrada.
pub async fn report_ai_usage(
    server_url: &str,
    device_token: &str,
    reports: &[crate::ai::AiUsageReport],
) -> Result<AiUsageReportSummary, SyncError> {
    let client = reqwest::Client::new();
    let base = server_url.trim_end_matches('/');

    let response = client
        .post(format!("{base}/api/sync/ai-usage"))
        .bearer_auth(device_token)
        .json(&serde_json::json!({ "runs": reports }))
        .send()
        .await?;

    if !response.status().is_success() {
        return Err(error_from_response(response).await);
    }

    Ok(response.json().await?)
}

/// Sobre [metaLen u32 BE | metaJSON | bytes]. El metaJSON lleva nombre y tipo
/// del archivo; el contenido es el resto. Mismo formato que cifra el navegador
/// del paciente.
fn parse_envelope(bytes: &[u8]) -> Result<(String, String, Option<String>, Vec<u8>), SyncError> {
    if bytes.len() < 4 {
        return Err(SyncError::Server("documento corrupto".into()));
    }
    let meta_len = u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) as usize;
    if bytes.len() < 4 + meta_len {
        return Err(SyncError::Server("documento corrupto".into()));
    }
    let meta: serde_json::Value = serde_json::from_slice(&bytes[4..4 + meta_len])
        .map_err(|e| SyncError::Server(format!("metadatos invalidos: {e}")))?;
    let file_name = text(&meta, "fileName").unwrap_or_default();
    let mime_type = text(&meta, "mimeType").unwrap_or_default();
    let category = text(&meta, "category");
    let content = bytes[4 + meta_len..].to_vec();
    Ok((file_name, mime_type, category, content))
}

/// Guarda un documento ya descifrado en la base local. Idempotente por id
/// (re-entrega tras un ACK perdido no duplica).
pub fn store_mailbox_document(
    conn: &Connection,
    id: &str,
    patient_id: Option<&str>,
    appointment_id: Option<&str>,
    plaintext: &[u8],
) -> Result<(), SyncError> {
    let (file_name, mime_type, category, content) = parse_envelope(plaintext)?;
    conn.execute(
        "INSERT INTO documents (
            id, patient_id, appointment_id, file_name, mime_type, category,
            content, size_bytes, received_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(id) DO NOTHING",
        params![
            id,
            patient_id,
            appointment_id,
            file_name,
            mime_type,
            category,
            content,
            content.len() as i64,
            chrono_now()
        ],
    )?;
    Ok(())
}

/// Guarda los antecedentes (historia clinica) ya descifrados en la base local.
/// El sobre lleva en el meta `{kind:"medical-history"}` (antecedentes) o
/// `{kind:"ai-preconsulta"}` (resultado de la IA), y el JSON de respuestas como
/// contenido. Idempotente por appointment_id (re-entrega no duplica; reenvio del
/// paciente actualiza). CLINICO: vive solo aqui.
pub fn store_mailbox_precheckin(
    conn: &Connection,
    appointment_id: &str,
    plaintext: &[u8],
) -> Result<(), SyncError> {
    let (kind, content) = parse_precheckin_envelope(plaintext)?;
    let responses_json = String::from_utf8(content)
        .map_err(|e| SyncError::Server(format!("preconsulta no es UTF-8: {e}")))?;
    conn.execute(
        "INSERT INTO precheckins (appointment_id, responses_json, kind, received_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(appointment_id) DO UPDATE SET
            responses_json = excluded.responses_json,
            kind = excluded.kind,
            received_at = excluded.received_at",
        params![appointment_id, responses_json, kind, chrono_now()],
    )?;
    Ok(())
}

/// Lee `kind` del meta del sobre y el contenido. Default `medical-history` por
/// compatibilidad con sobres sin `kind`.
fn parse_precheckin_envelope(bytes: &[u8]) -> Result<(String, Vec<u8>), SyncError> {
    if bytes.len() < 4 {
        return Err(SyncError::Server("preconsulta corrupta".into()));
    }
    let meta_len = u32::from_be_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]) as usize;
    if bytes.len() < 4 + meta_len {
        return Err(SyncError::Server("preconsulta corrupta".into()));
    }
    let meta: serde_json::Value = serde_json::from_slice(&bytes[4..4 + meta_len])
        .map_err(|e| SyncError::Server(format!("metadatos invalidos: {e}")))?;
    let kind = text(&meta, "kind").unwrap_or_else(|| "medical-history".into());
    let content = bytes[4 + meta_len..].to_vec();
    Ok((kind, content))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_encrypted;

    fn test_conn(name: &str) -> Connection {
        let dir = std::env::temp_dir().join("midoc-sync-tests");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(format!("{name}-{}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        open_encrypted(&path, "clave-de-prueba").unwrap()
    }

    fn booked_event(seq: i64, id: &str) -> InboxEvent {
        InboxEvent {
            seq,
            event_type: "APPOINTMENT_BOOKED".into(),
            payload: Some(serde_json::json!({
                "appointmentId": id,
                "status": "PENDING",
                "scheduledStart": "2026-06-22T15:00:00.000Z",
                "scheduledEnd": "2026-06-22T15:30:00.000Z",
                "serviceName": "Consulta",
                "reason": "Control",
                "patient": {
                    "id": "pat-1",
                    "firstName": "Hugo",
                    "lastName": "Paz",
                    "phone": "6140001111",
                    "email": null
                }
            })),
        }
    }

    #[test]
    fn applies_booked_confirmed_and_precheckin_idempotently() {
        let mut conn = test_conn("apply");

        let events = vec![
            booked_event(1, "appt-1"),
            InboxEvent {
                seq: 2,
                event_type: "APPOINTMENT_CONFIRMED".into(),
                payload: Some(serde_json::json!({
                    "appointmentId": "appt-1",
                    "status": "CONFIRMED"
                })),
            },
            InboxEvent {
                seq: 3,
                event_type: "PRECHECKIN_SUBMITTED".into(),
                payload: Some(serde_json::json!({
                    "appointmentId": "appt-1",
                    "precheckinId": "pre-1",
                    "responses": { "motivo": "Dolor lumbar" }
                })),
            },
        ];

        apply_batch(&mut conn, &events).unwrap();
        // Re-aplicar el mismo lote (re-entrega tras ACK perdido) no duplica.
        apply_batch(&mut conn, &events).unwrap();

        let (count, status): (i64, String) = conn
            .query_row(
                "SELECT count(*), max(status) FROM appointments WHERE id = 'appt-1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(count, 1);
        assert_eq!(status, "CONFIRMED");

        let responses: String = conn
            .query_row(
                "SELECT responses_json FROM precheckins WHERE appointment_id = 'appt-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(responses.contains("Dolor lumbar"));
    }

    #[test]
    fn booking_for_a_minor_carries_the_guardian_as_its_own_entity() {
        let mut conn = test_conn("guardian");

        let event = InboxEvent {
            seq: 1,
            event_type: "APPOINTMENT_BOOKED".into(),
            payload: Some(serde_json::json!({
                "appointmentId": "appt-minor",
                "status": "PENDING",
                "scheduledStart": "2026-07-01T15:00:00.000Z",
                "scheduledEnd": "2026-07-01T15:30:00.000Z",
                "serviceName": "Consulta",
                "reason": "Control del nino",
                "patient": {
                    "id": "pat-minor",
                    "firstName": "Lucia",
                    "lastName": "Paz",
                    "birthDate": "2018-03-04",
                    // Contacto de la cita = el del tutor (el menor no tiene propio).
                    "phone": "6140002222",
                    "email": null
                },
                "responsible": {
                    "name": "Hugo Paz",
                    "relationship": "Padre",
                    "phone": "6140002222",
                    "email": "hugo@example.com"
                }
            })),
        };

        apply_batch(&mut conn, &[event]).unwrap();

        let (first, birth, g_name, g_rel, g_email): (
            String,
            Option<String>,
            Option<String>,
            Option<String>,
            Option<String>,
        ) = conn
            .query_row(
                "SELECT patient_first_name, patient_birth_date, guardian_name,
                        guardian_relationship, guardian_email
                 FROM appointments WHERE id = 'appt-minor'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
            )
            .unwrap();

        // La identidad del paciente es la del menor, no la del tutor.
        assert_eq!(first, "Lucia");
        assert_eq!(birth.as_deref(), Some("2018-03-04"));
        // El responsable viaja como entidad propia.
        assert_eq!(g_name.as_deref(), Some("Hugo Paz"));
        assert_eq!(g_rel.as_deref(), Some("Padre"));
        assert_eq!(g_email.as_deref(), Some("hugo@example.com"));
    }

    #[test]
    fn reschedule_updates_times_and_unknown_events_are_ignored() {
        let mut conn = test_conn("reschedule");

        apply_batch(&mut conn, &[booked_event(1, "appt-2")]).unwrap();
        apply_batch(
            &mut conn,
            &[
                InboxEvent {
                    seq: 2,
                    event_type: "APPOINTMENT_RESCHEDULED".into(),
                    payload: Some(serde_json::json!({
                        "appointmentId": "appt-2",
                        "status": "PENDING",
                        "scheduledStart": "2026-06-29T16:00:00.000Z",
                        "scheduledEnd": "2026-06-29T16:30:00.000Z"
                    })),
                },
                InboxEvent {
                    seq: 3,
                    event_type: "FUTURE_EVENT_TYPE".into(),
                    payload: Some(serde_json::json!({})),
                },
                InboxEvent {
                    seq: 4,
                    event_type: "PRECHECKIN_SUBMITTED".into(),
                    payload: None, // purgado en nube: no debe romper
                },
            ],
        )
        .unwrap();

        let start: String = conn
            .query_row(
                "SELECT scheduled_start FROM appointments WHERE id = 'appt-2'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(start, "2026-06-29T16:00:00.000Z");
    }

    fn envelope(file_name: &str, mime: &str, content: &[u8]) -> Vec<u8> {
        let meta = serde_json::json!({ "fileName": file_name, "mimeType": mime }).to_string();
        let meta_bytes = meta.as_bytes();
        let mut out = Vec::new();
        out.extend_from_slice(&(meta_bytes.len() as u32).to_be_bytes());
        out.extend_from_slice(meta_bytes);
        out.extend_from_slice(content);
        out
    }

    #[test]
    fn stores_mailbox_document_and_is_idempotent() {
        let conn = test_conn("documents");
        let content = b"%PDF-1.4 contenido del estudio";
        let plaintext = envelope("estudio.pdf", "application/pdf", content);

        store_mailbox_document(&conn, "doc-1", Some("pat-1"), Some("appt-1"), &plaintext).unwrap();
        // Re-entrega tras un ACK perdido: no duplica ni cambia el contenido.
        store_mailbox_document(&conn, "doc-1", Some("pat-1"), Some("appt-1"), &plaintext).unwrap();

        let (count, file_name, mime, size, stored): (i64, String, String, i64, Vec<u8>) = conn
            .query_row(
                "SELECT count(*), max(file_name), max(mime_type), max(size_bytes), max(content)
                 FROM documents WHERE id = 'doc-1'",
                [],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                    ))
                },
            )
            .unwrap();
        assert_eq!(count, 1);
        assert_eq!(file_name, "estudio.pdf");
        assert_eq!(mime, "application/pdf");
        assert_eq!(size, content.len() as i64);
        assert_eq!(stored, content);
    }

    #[test]
    fn rejects_corrupt_envelope() {
        let conn = test_conn("corrupt-envelope");
        // metaLen mayor que el buffer disponible.
        let bad = vec![0u8, 0, 1, 0, 1, 2];
        assert!(store_mailbox_document(&conn, "doc-x", None, None, &bad).is_err());
    }

    fn precheckin_envelope(content: &[u8]) -> Vec<u8> {
        precheckin_envelope_kind("medical-history", content)
    }

    fn precheckin_envelope_kind(kind: &str, content: &[u8]) -> Vec<u8> {
        let meta = serde_json::json!({ "kind": kind }).to_string();
        let meta_bytes = meta.as_bytes();
        let mut out = Vec::new();
        out.extend_from_slice(&(meta_bytes.len() as u32).to_be_bytes());
        out.extend_from_slice(meta_bytes);
        out.extend_from_slice(content);
        out
    }

    #[test]
    fn stores_sealed_precheckin_as_medical_history_and_is_idempotent() {
        let conn = test_conn("precheckin-mh");
        let json = r#"{"sex":"F","allergies":"penicilina"}"#;
        let plaintext = precheckin_envelope(json.as_bytes());

        store_mailbox_precheckin(&conn, "appt-1", &plaintext).unwrap();
        // Reenvio del paciente: actualiza, no duplica (PK por appointment_id).
        let json2 = r#"{"sex":"F","allergies":"ninguna"}"#;
        store_mailbox_precheckin(&conn, "appt-1", &precheckin_envelope(json2.as_bytes())).unwrap();

        let (count, responses, kind): (i64, String, String) = conn
            .query_row(
                "SELECT count(*), max(responses_json), max(kind)
                 FROM precheckins WHERE appointment_id = 'appt-1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(count, 1);
        assert_eq!(kind, "medical-history");
        // El contenido clinico se guarda tal cual (el JSON descifrado), no "{}".
        assert_eq!(responses, json2);
    }

    #[test]
    fn stores_sealed_ai_preconsulta_with_kind_from_envelope() {
        let conn = test_conn("precheckin-ai");
        let json = r#"{"motivo":"tos","conversation":[{"question":"q","answer":"a"}]}"#;
        let plaintext = precheckin_envelope_kind("ai-preconsulta", json.as_bytes());

        store_mailbox_precheckin(&conn, "appt-ai", &plaintext).unwrap();

        let (responses, kind): (String, String) = conn
            .query_row(
                "SELECT responses_json, kind FROM precheckins WHERE appointment_id = 'appt-ai'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(kind, "ai-preconsulta");
        assert_eq!(responses, json);
    }

    #[test]
    fn sync_state_roundtrip_and_cursor_default() {
        let conn = test_conn("state");

        assert_eq!(get_cursor(&conn).unwrap(), 0);
        set_state(&conn, "cursor", "42").unwrap();
        assert_eq!(get_cursor(&conn).unwrap(), 42);
        set_state(&conn, "cursor", "43").unwrap();
        assert_eq!(get_cursor(&conn).unwrap(), 43);
    }

    #[test]
    fn delete_state_clears_link_so_relinking_is_possible() {
        let conn = test_conn("unlink");

        set_state(&conn, "device_token", "tok-123").unwrap();
        set_state(&conn, "server_url", "http://localhost:3000").unwrap();
        set_state(&conn, "cursor", "57").unwrap();

        delete_state(&conn, "device_token").unwrap();
        delete_state(&conn, "server_url").unwrap();
        delete_state(&conn, "cursor").unwrap();

        assert_eq!(get_state(&conn, "device_token").unwrap(), None);
        assert_eq!(get_state(&conn, "server_url").unwrap(), None);
        // Cursor vuelve al default (0) para que el re-vinculo baje desde cero.
        assert_eq!(get_cursor(&conn).unwrap(), 0);
        // Borrar algo inexistente no falla (idempotente).
        delete_state(&conn, "device_token").unwrap();
    }

    #[test]
    fn extracts_clinical_profile_from_portal_workspace_response() {
        let body = serde_json::json!({
            "profile": {
                "specialty": "ODONTOLOGY"
            }
        });

        assert_eq!(
            extract_clinical_profile(&body).as_deref(),
            Some("ODONTOLOGY")
        );
    }

    #[test]
    fn ignores_unknown_or_missing_clinical_profile_values() {
        let missing = serde_json::json!({ "profile": {} });
        let invalid = serde_json::json!({
            "profile": {
                "specialty": "CARDIOLOGY"
            }
        });

        assert_eq!(extract_clinical_profile(&missing), None);
        assert_eq!(extract_clinical_profile(&invalid), None);
    }

    #[test]
    fn extracts_slot_minutes_from_portal_workspace_response() {
        let body = serde_json::json!({
            "profile": {
                "consultationDuration": 20
            }
        });
        assert_eq!(extract_slot_minutes(&body), Some(20));

        // Ausente o no positivo => sin valor (se usara el default en el front).
        assert_eq!(extract_slot_minutes(&serde_json::json!({ "profile": {} })), None);
        assert_eq!(
            extract_slot_minutes(&serde_json::json!({ "profile": { "consultationDuration": 0 } })),
            None
        );
    }

    #[test]
    fn extracts_working_hours_window_from_active_rules() {
        let body = serde_json::json!({
            "profile": {
                "availabilityRules": [
                    { "startTime": "09:00", "endTime": "13:00", "isActive": true },
                    { "startTime": "16:00", "endTime": "20:00", "isActive": true },
                    { "startTime": "07:00", "endTime": "08:00", "isActive": false }
                ]
            }
        });
        // Inicio mas temprano y fin mas tardio entre las reglas ACTIVAS.
        assert_eq!(extract_working_hours(&body), (Some(9 * 60), Some(20 * 60)));

        // Sin reglas => sin ventana (el front usa un horario por defecto).
        assert_eq!(
            extract_working_hours(&serde_json::json!({ "profile": {} })),
            (None, None)
        );
    }

    #[test]
    fn builds_profile_metadata_from_body() {
        let body = serde_json::json!({
            "profile": {
                "specialty": "ODONTOLOGY",
                "consultationDuration": 20,
                "availabilityRules": [
                    { "startTime": "09:00", "endTime": "13:00", "isActive": true },
                    { "startTime": "16:00", "endTime": "20:00", "isActive": true }
                ]
            }
        });
        let meta = profile_metadata_from_body(&body);
        assert_eq!(meta.clinical_profile.as_deref(), Some("ODONTOLOGY"));
        assert_eq!(meta.slot_minutes, Some(20));
        assert_eq!(meta.work_start_minutes, Some(9 * 60));
        assert_eq!(meta.work_end_minutes, Some(20 * 60));
    }

    // ---------- E2E contra portal vivo (Capa 2) ----------
    //
    // Requiere el portal corriendo en SERVER (por defecto http://localhost:3000)
    // con su base Postgres. Por eso esta #[ignore]: no corre en la suite normal.
    //   cargo test --release sync::tests::e2e -- --ignored --nocapture
    // Prueba el contrato completo entre procesos: reserva publica en el portal,
    // descarga a la base cifrada local, y purga del contenido clinico en nube.

    fn server_url() -> String {
        std::env::var("MIDOC_E2E_SERVER").unwrap_or_else(|_| "http://localhost:3000".into())
    }

    async fn post_json(
        client: &reqwest::Client,
        url: &str,
        body: serde_json::Value,
    ) -> serde_json::Value {
        let response = client.post(url).json(&body).send().await.unwrap();
        let status = response.status();
        let json: serde_json::Value = response.json().await.unwrap_or_default();
        assert!(status.is_success(), "POST {url} -> {status}: {json}");
        json
    }

    #[tokio::test]
    #[ignore = "necesita el portal vivo en localhost:3000"]
    async fn e2e_booking_reaches_encrypted_db_and_purges_cloud() {
        use chrono::{Datelike, Duration, Utc};

        let base = server_url();
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let email = format!("e2e-{nanos}@example.com");
        let password = "E2ePass!2026xy";
        let slug = format!("dra-e2e-{}", nanos % 100_000_000);

        // Cliente con cookies para registro + operaciones admin del medico.
        let client = reqwest::Client::builder()
            .cookie_store(true)
            .build()
            .unwrap();

        // 1) Registrar medico y abrir sesion.
        post_json(
            &client,
            &format!("{base}/api/auth/register"),
            serde_json::json!({
                "email": email, "password": password,
                "firstName": "Eva", "lastName": "Sync",
                "professionalName": "Dra. Eva Sync", "specialty": "GENERAL_MEDICINE"
            }),
        )
        .await;
        post_json(
            &client,
            &format!("{base}/api/auth/login"),
            serde_json::json!({ "email": email, "password": password }),
        )
        .await;

        // 2) Publicar perfil, servicio y disponibilidad.
        post_json_put(
            &client,
            &format!("{base}/api/admin/profile"),
            serde_json::json!({ "publicSlug": slug, "isPublic": true }),
        )
        .await;
        let service = post_json(
            &client,
            &format!("{base}/api/admin/services"),
            serde_json::json!({ "name": "Consulta", "priceCents": 50000, "durationMinutes": 30 }),
        )
        .await;
        let service_id = service["service"]["id"].as_str().unwrap().to_string();

        // Regla para un dia ~3 dias adelante (evita slots en el pasado).
        let target = Utc::now() + Duration::days(3);
        post_json(
            &client,
            &format!("{base}/api/admin/availability"),
            serde_json::json!({
                "dayOfWeek": target.weekday().num_days_from_sunday(),
                "startTime": "09:00", "endTime": "12:00"
            }),
        )
        .await;

        // 3) Reservar como paciente (hold -> cita) y enviar preconsulta.
        let date_from = Utc::now().format("%Y-%m-%d").to_string();
        let availability: serde_json::Value = client
            .get(format!(
                "{base}/api/public/doctors/{slug}/availability?serviceId={service_id}&dateFrom={date_from}&days=14"
            ))
            .send()
            .await
            .unwrap()
            .json()
            .await
            .unwrap();
        let slot_start = availability["slots"][0]["slotStart"]
            .as_str()
            .expect("debe haber al menos un slot disponible")
            .to_string();

        let hold = post_json(
            &client,
            &format!("{base}/api/public/doctors/{slug}/holds"),
            serde_json::json!({ "serviceId": service_id, "slotStart": slot_start }),
        )
        .await;
        let hold_token = hold["hold"]["token"].as_str().unwrap().to_string();

        let booking = post_json(
            &client,
            &format!("{base}/api/public/appointments"),
            serde_json::json!({
                "holdToken": hold_token,
                "patient": { "firstName": "Hugo", "lastName": "Paz", "phone": "6140001111" },
                "legal": { "acceptedTerms": true, "acceptedPrivacy": true }
            }),
        )
        .await;
        let confirmation_token = booking["appointment"]["confirmationToken"]
            .as_str()
            .unwrap()
            .to_string();

        post_json_put(
            &client,
            &format!("{base}/api/public/appointments/{confirmation_token}/precheckin"),
            serde_json::json!({ "responses": { "motivo": "Dolor lumbar e2e" } }),
        )
        .await;

        // 4) Vincular la app y sincronizar contra la base cifrada local.
        let mut conn = test_conn("e2e");
        let public_key = crate::crypto::ensure_keypair(&conn).unwrap();
        let link = link_account(&base, &email, password, "PC e2e", &public_key)
            .await
            .unwrap();
        let device_token = link.device_token;
        let mut cursor = 0i64;
        loop {
            let inbox = fetch_inbox(&base, &device_token, cursor).await.unwrap();
            if inbox.events.is_empty() {
                break;
            }
            apply_batch(&mut conn, &inbox.events).unwrap();
            send_ack(&base, &device_token, inbox.next_cursor)
                .await
                .unwrap();
            cursor = inbox.next_cursor;
        }

        // 5) La cita llego a la base cifrada local.
        let (patient, status): (String, String) = conn
            .query_row(
                "SELECT patient_first_name, status FROM appointments LIMIT 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(patient, "Hugo");
        assert_eq!(status, "PENDING");

        // 6) La preconsulta clinica vive localmente...
        let responses: String = conn
            .query_row(
                "SELECT responses_json FROM precheckins LIMIT 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(responses.contains("Dolor lumbar e2e"));

        // 7) ...y ya NO en la nube: el evento de preconsulta vuelve sin payload.
        let after: InboxResponse = fetch_inbox(&base, &device_token, 0).await.unwrap();
        let precheckin_event = after
            .events
            .iter()
            .find(|event| event.event_type == "PRECHECKIN_SUBMITTED")
            .expect("el evento debe seguir, pero purgado");
        assert!(
            precheckin_event.payload.is_none(),
            "el contenido clinico debe estar purgado en nube tras el ACK"
        );
    }

    async fn post_json_put(
        client: &reqwest::Client,
        url: &str,
        body: serde_json::Value,
    ) -> serde_json::Value {
        let response = client.put(url).json(&body).send().await.unwrap();
        let status = response.status();
        let json: serde_json::Value = response.json().await.unwrap_or_default();
        assert!(status.is_success(), "PUT {url} -> {status}: {json}");
        json
    }
}
