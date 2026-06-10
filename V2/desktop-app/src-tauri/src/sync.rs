//! Cliente de sincronizacion (fase A del contrato, `13_contrato_sincronizacion.md`).
//!
//! Pull-only: la app descarga eventos del buzon del portal con un cursor
//! monotono, los aplica de forma idempotente a la base local cifrada y
//! confirma con ACK (momento en el que la nube purga el contenido clinico).

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
    #[error("la app no esta vinculada a una cuenta")]
    NotLinked,
}

#[derive(Debug, Deserialize)]
pub struct InboxEvent {
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
            conn.execute(
                "INSERT INTO appointments (
                    id, status, scheduled_start, scheduled_end, service_name, reason,
                    patient_id, patient_first_name, patient_last_name, patient_phone,
                    patient_email, updated_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
                 ON CONFLICT(id) DO UPDATE SET
                    status = excluded.status,
                    scheduled_start = excluded.scheduled_start,
                    scheduled_end = excluded.scheduled_end,
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

/// Inicia sesion en el portal y registra este equipo como dispositivo de
/// sincronizacion. Devuelve el device token (se guarda en la base cifrada).
pub async fn link_account(
    server_url: &str,
    email: &str,
    password: &str,
    device_name: &str,
) -> Result<String, SyncError> {
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

    let device = client
        .post(format!("{base}/api/sync/devices"))
        .json(&serde_json::json!({ "deviceName": device_name }))
        .send()
        .await?;

    if !device.status().is_success() {
        return Err(error_from_response(device).await);
    }

    let body: serde_json::Value = device.json().await?;
    body.get("deviceToken")
        .and_then(|v| v.as_str())
        .map(String::from)
        .ok_or_else(|| SyncError::Server("respuesta sin deviceToken".into()))
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

pub async fn send_ack(
    server_url: &str,
    device_token: &str,
    cursor: i64,
) -> Result<(), SyncError> {
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

    #[test]
    fn sync_state_roundtrip_and_cursor_default() {
        let conn = test_conn("state");

        assert_eq!(get_cursor(&conn).unwrap(), 0);
        set_state(&conn, "cursor", "42").unwrap();
        assert_eq!(get_cursor(&conn).unwrap(), 42);
        set_state(&conn, "cursor", "43").unwrap();
        assert_eq!(get_cursor(&conn).unwrap(), 43);
    }
}
