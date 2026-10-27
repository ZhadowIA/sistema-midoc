//! Preconsulta configurable, rebanada 1 (paso 32, `V2/16_preconsulta_configurable.md`):
//! el medico arma la parte 2 del cuestionario, la publica en el portal y
//! administra su enlace general.
//!
//! Clase OPERATIVO: preguntas y el enlace, nunca respuestas. El borrador vive en
//! la base cifrada del perfil (`sync_state`); el portal valida la definicion con
//! su contrato Zod al publicar y la app la valida antes con el espejo
//! `src/preconsultaQuestionnaire.ts`. El enlace general solo lo entrega el
//! portal al crearlo, asi que la app guarda su URL; si otro equipo lo regenera,
//! esta app ya no la conoce y lo dice.

use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::sync::{self, SyncError};

const DRAFT: &str = "preconsulta_draft";
const PUBLISHED_VERSION: &str = "preconsulta_published_version";
const PUBLISHED_AT: &str = "preconsulta_published_at";
const LINK_URL: &str = "preconsulta_link_url";
const LINK_CREATED_AT: &str = "preconsulta_link_created_at";

/// Tope del borrador: 40 preguntas caben de sobra.
const MAX_DRAFT_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct LinkStatus {
    /// ACTIVE | PAUSED.
    pub status: String,
    #[serde(rename(deserialize = "createdAt"))]
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct GeneralLink {
    /// La URL para compartir, si este equipo la conoce.
    pub url: Option<String>,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct PreconsultaState {
    /// Borrador local (lo que se esta editando).
    pub draft: Option<serde_json::Value>,
    /// Lo publicado en el portal: version, fecha y definicion.
    pub published_version: Option<i64>,
    pub published_at: Option<String>,
    pub published: Option<serde_json::Value>,
    pub link: Option<GeneralLink>,
    /// Hay cuenta vinculada (sin ella no se publica).
    pub linked: bool,
    /// No se pudo hablar con el portal; lo mostrado es lo ultimo conocido.
    pub offline: bool,
}

/// Lo que responde el portal en `GET /api/sync/preconsulta`.
#[derive(Debug, Deserialize)]
struct RemoteStatus {
    questionnaire: Option<RemoteQuestionnaire>,
    #[serde(rename = "generalLink")]
    general_link: Option<LinkStatus>,
}

#[derive(Debug, Deserialize)]
struct RemoteQuestionnaire {
    version: i64,
    #[serde(rename = "publishedAt")]
    published_at: String,
    definition: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct Published {
    version: i64,
    #[serde(rename = "publishedAt")]
    published_at: String,
}

#[derive(Debug, Deserialize)]
struct NewLink {
    url: String,
    status: String,
    #[serde(rename = "createdAt")]
    created_at: String,
}

/* ---------- Local ---------- */

fn validate_draft(definition: &serde_json::Value) -> Result<String, SyncError> {
    if !definition.is_object() {
        return Err(SyncError::Server(
            "el cuestionario no tiene forma valida".into(),
        ));
    }
    let json = definition.to_string();
    if json.len() > MAX_DRAFT_BYTES {
        return Err(SyncError::Server(
            "el cuestionario es demasiado grande".into(),
        ));
    }
    Ok(json)
}

pub fn save_draft(conn: &Connection, definition: &serde_json::Value) -> Result<(), SyncError> {
    let json = validate_draft(definition)?;
    sync::set_state(conn, DRAFT, &json)
}

pub fn load_draft(conn: &Connection) -> Result<Option<serde_json::Value>, SyncError> {
    Ok(sync::get_state(conn, DRAFT)?.and_then(|raw| serde_json::from_str(&raw).ok()))
}

fn local_link(
    conn: &Connection,
    remote: Option<&LinkStatus>,
) -> Result<Option<GeneralLink>, SyncError> {
    let url = sync::get_state(conn, LINK_URL)?;
    let known_created = sync::get_state(conn, LINK_CREATED_AT)?;
    Ok(remote.map(|remote| GeneralLink {
        // La URL guardada solo vale si es la del enlace vigente.
        url: url.filter(|_| known_created.as_deref() == Some(remote.created_at.as_str())),
        status: remote.status.clone(),
        created_at: remote.created_at.clone(),
    }))
}

/// Estado con lo que dijo el portal, o con lo ultimo conocido si no hubo conexion.
pub fn compose_state(
    conn: &Connection,
    linked: bool,
    remote: Option<&RemoteStatusView>,
) -> Result<PreconsultaState, SyncError> {
    let draft = load_draft(conn)?;
    match remote {
        Some(remote) => {
            if let Some(q) = &remote.questionnaire {
                // Tambien la que publico otro equipo.
                record_version(conn, q.0, &q.2)?;
                sync::set_state(conn, PUBLISHED_VERSION, &q.0.to_string())?;
                sync::set_state(conn, PUBLISHED_AT, &q.1)?;
            }
            Ok(PreconsultaState {
                draft,
                published_version: remote.questionnaire.as_ref().map(|q| q.0),
                published_at: remote.questionnaire.as_ref().map(|q| q.1.clone()),
                published: remote.questionnaire.as_ref().map(|q| q.2.clone()),
                link: local_link(conn, remote.general_link.as_ref())?,
                linked,
                offline: false,
            })
        }
        None => {
            let created_at = sync::get_state(conn, LINK_CREATED_AT)?;
            Ok(PreconsultaState {
                draft,
                published_version: sync::get_state(conn, PUBLISHED_VERSION)?
                    .and_then(|v| v.parse().ok()),
                published_at: sync::get_state(conn, PUBLISHED_AT)?,
                published: None,
                link: created_at.map(|created_at| GeneralLink {
                    url: sync::get_state(conn, LINK_URL).ok().flatten(),
                    status: "DESCONOCIDO".into(),
                    created_at,
                }),
                linked,
                offline: linked,
            })
        }
    }
}

/// Lo que importa del estado remoto, ya separado del formato HTTP.
#[derive(Debug, Clone)]
pub struct RemoteStatusView {
    /// (version, publishedAt, definicion).
    pub questionnaire: Option<(i64, String, serde_json::Value)>,
    pub general_link: Option<LinkStatus>,
}

/// Guarda la definicion de una version publicada. El portal solo conserva la
/// vigente; con esta copia una preconsulta contestada con una version anterior
/// se sigue leyendo con sus preguntas. Lo que diga el portal manda.
pub fn record_version(
    conn: &Connection,
    version: i64,
    definition: &serde_json::Value,
) -> Result<(), SyncError> {
    conn.execute(
        "INSERT INTO preconsulta_questionnaire_versions (version, definition_json, recorded_at)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(version) DO UPDATE SET
            definition_json = excluded.definition_json,
            recorded_at = excluded.recorded_at",
        rusqlite::params![
            version,
            definition.to_string(),
            chrono::Utc::now().to_rfc3339()
        ],
    )?;
    Ok(())
}

pub fn record_published(
    conn: &Connection,
    definition: &serde_json::Value,
    version: i64,
    at: &str,
) -> Result<(), SyncError> {
    record_version(conn, version, definition)?;
    save_draft(conn, definition)?;
    sync::set_state(conn, PUBLISHED_VERSION, &version.to_string())?;
    sync::set_state(conn, PUBLISHED_AT, at)
}

pub fn record_new_link(conn: &Connection, url: &str, created_at: &str) -> Result<(), SyncError> {
    sync::set_state(conn, LINK_URL, url)?;
    sync::set_state(conn, LINK_CREATED_AT, created_at)
}

/* ---------- Portal ---------- */

async fn error_text(response: reqwest::Response) -> SyncError {
    let status = response.status();
    let message = response
        .json::<serde_json::Value>()
        .await
        .ok()
        .and_then(|body| body.get("error").and_then(|v| v.as_str()).map(String::from))
        .unwrap_or_else(|| format!("el servidor respondio {status}"));
    SyncError::Server(message)
}

pub async fn fetch_status(
    server_url: &str,
    device_token: &str,
) -> Result<RemoteStatusView, SyncError> {
    let base = server_url.trim_end_matches('/');
    let response = reqwest::Client::new()
        .get(format!("{base}/api/sync/preconsulta"))
        .bearer_auth(device_token)
        .send()
        .await?;
    if !response.status().is_success() {
        return Err(error_text(response).await);
    }
    let remote: RemoteStatus = response.json().await?;
    Ok(RemoteStatusView {
        questionnaire: remote
            .questionnaire
            .map(|q| (q.version, q.published_at, q.definition)),
        general_link: remote.general_link,
    })
}

/// Publica la definicion; devuelve (version, publishedAt).
pub async fn publish(
    server_url: &str,
    device_token: &str,
    definition: &serde_json::Value,
) -> Result<(i64, String), SyncError> {
    validate_draft(definition)?;
    let base = server_url.trim_end_matches('/');
    let response = reqwest::Client::new()
        .put(format!("{base}/api/sync/preconsulta"))
        .bearer_auth(device_token)
        .json(&serde_json::json!({ "definition": definition }))
        .send()
        .await?;
    if !response.status().is_success() {
        return Err(error_text(response).await);
    }
    let published: Published = response.json().await?;
    Ok((published.version, published.published_at))
}

/// Crea o regenera el enlace general; devuelve (url, status, createdAt).
pub async fn regenerate_link(
    server_url: &str,
    device_token: &str,
) -> Result<(String, String, String), SyncError> {
    let base = server_url.trim_end_matches('/');
    let response = reqwest::Client::new()
        .post(format!("{base}/api/sync/preconsulta/link"))
        .bearer_auth(device_token)
        .send()
        .await?;
    if !response.status().is_success() {
        return Err(error_text(response).await);
    }
    let link: NewLink = response.json().await?;
    Ok((link.url, link.status, link.created_at))
}

/// Pide al portal un enlace personal; devuelve (url, expiresAt).
pub async fn create_personal_link(
    server_url: &str,
    device_token: &str,
    patient_ref: &str,
) -> Result<(String, String), SyncError> {
    let base = server_url.trim_end_matches('/');
    let response = reqwest::Client::new()
        .post(format!("{base}/api/sync/preconsulta/personal-link"))
        .bearer_auth(device_token)
        .json(&serde_json::json!({ "patientRef": patient_ref }))
        .send()
        .await?;
    if !response.status().is_success() {
        return Err(error_text(response).await);
    }
    let body: serde_json::Value = response.json().await?;
    let field = |key: &str| {
        body.get(key)
            .and_then(|v| v.as_str())
            .map(String::from)
            .ok_or_else(|| SyncError::Server(format!("respuesta sin {key}")))
    };
    Ok((field("url")?, field("expiresAt")?))
}

pub async fn set_link_status(
    server_url: &str,
    device_token: &str,
    status: &str,
) -> Result<LinkStatus, SyncError> {
    if !matches!(status, "ACTIVE" | "PAUSED") {
        return Err(SyncError::Server("estado de enlace invalido".into()));
    }
    let base = server_url.trim_end_matches('/');
    let response = reqwest::Client::new()
        .patch(format!("{base}/api/sync/preconsulta/link"))
        .bearer_auth(device_token)
        .json(&serde_json::json!({ "status": status }))
        .send()
        .await?;
    if !response.status().is_success() {
        return Err(error_text(response).await);
    }
    Ok(response.json().await?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_encrypted;

    fn test_conn(name: &str) -> Connection {
        let dir = std::env::temp_dir().join("midoc-preconsulta-tests");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(format!("{name}-{}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        open_encrypted(&path, "clave-de-prueba").unwrap()
    }

    fn definition() -> serde_json::Value {
        serde_json::json!({
            "schemaVersion": 1,
            "questions": [{ "id": "motivo", "label": "Motivo", "type": "long_text", "required": true }]
        })
    }

    #[test]
    fn keeps_the_draft_locally() {
        let conn = test_conn("draft");
        assert_eq!(load_draft(&conn).unwrap(), None);
        save_draft(&conn, &definition()).unwrap();
        assert_eq!(load_draft(&conn).unwrap(), Some(definition()));
        assert!(save_draft(&conn, &serde_json::json!([1, 2])).is_err());
        let huge = serde_json::json!({ "x": "a".repeat(MAX_DRAFT_BYTES) });
        assert!(save_draft(&conn, &huge).is_err());
    }

    #[test]
    fn the_saved_link_url_only_shows_for_the_current_link() {
        let conn = test_conn("link");
        record_new_link(
            &conn,
            "https://midoc.test/preconsulta/abc",
            "2026-10-25T10:00:00.000Z",
        )
        .unwrap();
        let current = RemoteStatusView {
            questionnaire: Some((3, "2026-10-25T09:00:00.000Z".into(), definition())),
            general_link: Some(LinkStatus {
                status: "PAUSED".into(),
                created_at: "2026-10-25T10:00:00.000Z".into(),
            }),
        };
        let state = compose_state(&conn, true, Some(&current)).unwrap();
        // La version que publico otro equipo tambien queda guardada.
        let kept: String = conn
            .query_row(
                "SELECT definition_json FROM preconsulta_questionnaire_versions WHERE version = 3",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&kept).unwrap(),
            definition()
        );
        let link = state.link.unwrap();
        assert_eq!(
            link.url.as_deref(),
            Some("https://midoc.test/preconsulta/abc")
        );
        assert_eq!(link.status, "PAUSED");
        assert_eq!(state.published_version, Some(3));
        assert!(!state.offline);

        // Otro equipo lo regenero: esta app ya no conoce la URL vigente.
        let regenerated = RemoteStatusView {
            general_link: Some(LinkStatus {
                status: "ACTIVE".into(),
                created_at: "2026-10-26T10:00:00.000Z".into(),
            }),
            ..current
        };
        let state = compose_state(&conn, true, Some(&regenerated)).unwrap();
        assert_eq!(state.link.unwrap().url, None);
    }

    #[test]
    fn without_connection_it_shows_the_last_known_state() {
        let conn = test_conn("offline");
        record_published(&conn, &definition(), 2, "2026-10-25T09:00:00.000Z").unwrap();
        record_new_link(
            &conn,
            "https://midoc.test/preconsulta/abc",
            "2026-10-25T10:00:00.000Z",
        )
        .unwrap();
        let state = compose_state(&conn, true, None).unwrap();
        assert!(state.offline);
        assert_eq!(state.published_version, Some(2));
        assert_eq!(state.draft, Some(definition()));
        assert_eq!(
            state.link.unwrap().url.as_deref(),
            Some("https://midoc.test/preconsulta/abc")
        );
        // Sin cuenta vinculada no es "sin conexion": simplemente no hay portal.
        assert!(!compose_state(&conn, false, None).unwrap().offline);
    }
}
