mod ai;
mod arco;
mod audio;
mod clinical;
mod cloud_transcription;
mod consultation_templates;
mod crypto;
mod db;
mod diarization;
mod diarization_model;
// Diarizacion local con sherpa-onnx: binding nativo tras el feature
// `diarization-local`; sin el feature, un stub degrada sin separar hablantes.
mod sherpa_diarization;
mod medication;
mod operations;
mod sync;
mod transcription;
mod transcription_model;
#[cfg(feature = "whisper-local")]
mod whisper_provider;

#[cfg(test)]
mod consultation_e2e;

#[cfg(test)]
mod restore_drill;

use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use base64::Engine;
use tauri::Manager;

/// Open database connection, held for the lifetime of the unlocked session.
struct AppDb(Mutex<Option<rusqlite::Connection>>);

/// Progreso de descarga de modelos Whisper por `model_id`. Vive fuera de la base
/// cifrada: los pesos son REFERENCIA publica, no datos clinicos. El frontend lo
/// consulta por sondeo (`transcription_model_status`) mientras descarga.
#[derive(Clone, Default)]
struct DownloadProgress {
    downloaded: u64,
    total: u64,
    done: bool,
    error: Option<String>,
}

struct ModelDownloads(Mutex<HashMap<String, DownloadProgress>>);

const DEFAULT_PROFILE_ID: &str = "default";
const PROFILE_REGISTRY_FILE: &str = "doctor_profiles.json";

#[derive(Clone, serde::Deserialize, serde::Serialize)]
struct DoctorProfile {
    id: String,
    display_name: String,
    created_at: String,
    last_used_at: Option<String>,
}

#[derive(serde::Serialize)]
struct UnlockResult {
    schema_version: i64,
    db_path: String,
    backup_path: String,
    profile: DoctorProfile,
}

#[derive(serde::Serialize)]
struct SyncStatus {
    linked: bool,
    server_url: Option<String>,
    cursor: i64,
    clinical_profile: Option<String>,
    slot_minutes: Option<i64>,
    work_start_minutes: Option<i64>,
    work_end_minutes: Option<i64>,
}

#[derive(serde::Serialize)]
struct AppointmentRow {
    id: String,
    status: String,
    scheduled_start: String,
    scheduled_end: String,
    service_name: Option<String>,
    reason: Option<String>,
    patient_name: String,
    patient_phone: Option<String>,
    has_precheckin: bool,
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn default_profile() -> DoctorProfile {
    DoctorProfile {
        id: DEFAULT_PROFILE_ID.into(),
        display_name: "Medico principal".into(),
        created_at: now_iso(),
        last_used_at: None,
    }
}

fn validate_profile_id(profile_id: &str) -> Result<(), String> {
    if profile_id.is_empty() || profile_id.len() > 64 {
        return Err("perfil medico invalido".into());
    }
    if !profile_id
        .bytes()
        .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err("perfil medico invalido".into());
    }
    Ok(())
}

fn profile_database_path(base_dir: &Path, profile_id: &str) -> Result<PathBuf, String> {
    validate_profile_id(profile_id)?;
    if profile_id == DEFAULT_PROFILE_ID {
        return Ok(base_dir.join("midoc.db"));
    }
    Ok(base_dir.join("profiles").join(profile_id).join("midoc.db"))
}

fn profile_backup_path(base_dir: &Path, profile_id: &str) -> Result<PathBuf, String> {
    validate_profile_id(profile_id)?;
    let stamp = chrono::Utc::now().format("%Y%m%dT%H%M%SZ");
    if profile_id == DEFAULT_PROFILE_ID {
        return Ok(base_dir.join("backups").join(format!("midoc-{stamp}.db")));
    }
    Ok(base_dir
        .join("profiles")
        .join(profile_id)
        .join("backups")
        .join(format!("midoc-{stamp}.db")))
}

fn profile_registry_path(base_dir: &Path) -> PathBuf {
    base_dir.join(PROFILE_REGISTRY_FILE)
}

fn load_profiles_from_dir(base_dir: &Path) -> Result<Vec<DoctorProfile>, String> {
    let path = profile_registry_path(base_dir);
    if !path.exists() {
        return Ok(vec![default_profile()]);
    }
    let text = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let mut profiles: Vec<DoctorProfile> = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    if !profiles.iter().any(|profile| profile.id == DEFAULT_PROFILE_ID) {
        profiles.insert(0, default_profile());
    }
    profiles.sort_by(|a, b| {
        let a_default = a.id == DEFAULT_PROFILE_ID;
        let b_default = b.id == DEFAULT_PROFILE_ID;
        b_default
            .cmp(&a_default)
            .then_with(|| a.display_name.to_lowercase().cmp(&b.display_name.to_lowercase()))
    });
    Ok(profiles)
}

fn save_profiles_to_dir(base_dir: &Path, profiles: &[DoctorProfile]) -> Result<(), String> {
    fs::create_dir_all(base_dir).map_err(|e| e.to_string())?;
    let text = serde_json::to_string_pretty(profiles).map_err(|e| e.to_string())?;
    fs::write(profile_registry_path(base_dir), text).map_err(|e| e.to_string())
}

fn profile_id_from_display_name(display_name: &str, existing: &[DoctorProfile]) -> String {
    let mut id = String::new();
    let mut last_was_dash = false;
    for ch in display_name.chars().flat_map(|ch| ch.to_lowercase()) {
        if ch.is_ascii_alphanumeric() {
            id.push(ch);
            last_was_dash = false;
        } else if !last_was_dash && !id.is_empty() {
            id.push('-');
            last_was_dash = true;
        }
    }
    while id.ends_with('-') {
        id.pop();
    }
    if id.is_empty() {
        id = "medico".into();
    }
    if id.len() > 48 {
        id.truncate(48);
        while id.ends_with('-') {
            id.pop();
        }
    }

    let base = id.clone();
    let mut suffix = 2;
    while existing.iter().any(|profile| profile.id == id) {
        id = format!("{base}-{suffix}");
        suffix += 1;
    }
    id
}

fn app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path().app_data_dir().map_err(|e| e.to_string())
}

fn backup_path(app: &tauri::AppHandle, profile_id: &str) -> Result<PathBuf, String> {
    profile_backup_path(&app_data_dir(app)?, profile_id)
}

#[tauri::command]
fn list_doctor_profiles(app: tauri::AppHandle) -> Result<Vec<DoctorProfile>, String> {
    load_profiles_from_dir(&app_data_dir(&app)?)
}

#[tauri::command]
fn create_doctor_profile(
    app: tauri::AppHandle,
    display_name: String,
) -> Result<DoctorProfile, String> {
    let name = display_name.trim();
    if name.is_empty() {
        return Err("escribe el nombre del medico".into());
    }

    let base_dir = app_data_dir(&app)?;
    let mut profiles = load_profiles_from_dir(&base_dir)?;
    let profile = DoctorProfile {
        id: profile_id_from_display_name(name, &profiles),
        display_name: name.into(),
        created_at: now_iso(),
        last_used_at: None,
    };
    profiles.push(profile.clone());
    save_profiles_to_dir(&base_dir, &profiles)?;
    fs::create_dir_all(
        profile_database_path(&base_dir, &profile.id)?
            .parent()
            .ok_or("ruta de perfil invalida")?,
    )
    .map_err(|e| e.to_string())?;
    Ok(profile)
}

/// Politica de passphrase: los expedientes NUEVOS exigen 12+ caracteres (la
/// passphrase es la unica barrera si roban el archivo .db). Las bases ya
/// existentes siguen aceptando 8+ para no dejar fuera a medicos con
/// passphrases creadas bajo la politica anterior.
fn validate_passphrase(passphrase: &str, is_new_database: bool) -> Result<(), String> {
    let minimum = if is_new_database { 12 } else { 8 };
    if passphrase.chars().count() < minimum {
        return Err(format!(
            "la frase de seguridad debe tener al menos {minimum} caracteres"
        ));
    }
    Ok(())
}

/// Opens (or creates) the encrypted clinical database with the doctor's
/// passphrase. The passphrase only lives in memory for the duration of the
/// call; SQLCipher keeps the derived key inside the connection.
#[tauri::command]
fn unlock_database(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppDb>,
    profile_id: Option<String>,
    passphrase: String,
) -> Result<UnlockResult, String> {
    let base_dir = app_data_dir(&app)?;
    let selected_profile_id = profile_id.unwrap_or_else(|| DEFAULT_PROFILE_ID.into());
    validate_profile_id(&selected_profile_id)?;
    let path = profile_database_path(&base_dir, &selected_profile_id)?;
    validate_passphrase(&passphrase, !path.exists())?;
    let mut profiles = load_profiles_from_dir(&base_dir)?;
    let profile_index = profiles
        .iter()
        .position(|profile| profile.id == selected_profile_id)
        .ok_or("perfil medico no encontrado")?;
    profiles[profile_index].last_used_at = Some(now_iso());
    let profile = profiles[profile_index].clone();
    save_profiles_to_dir(&base_dir, &profiles)?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let conn = db::open_encrypted(&path, &passphrase).map_err(|e| e.to_string())?;
    let schema_version = db::schema_version(&conn).map_err(|e| e.to_string())?;
    // Primer arranque: instala el catalogo real de medicamentos empaquetado si la
    // base sigue en la version sembrada. No debe bloquear el acceso al expediente,
    // por eso se ignora un eventual fallo (la base sembrada sigue siendo usable).
    let _ = medication::ensure_bundled_reference_installed(&conn);
    let backup_path = backup_path(&app, &profile.id)?;
    db::create_encrypted_backup(&conn, &backup_path).map_err(|e| e.to_string())?;
    *state.0.lock().unwrap() = Some(conn);
    Ok(UnlockResult {
        schema_version,
        db_path: path.display().to_string(),
        backup_path: backup_path.display().to_string(),
        profile,
    })
}

#[tauri::command]
fn lock_database(state: tauri::State<'_, AppDb>) {
    *state.0.lock().unwrap() = None;
}

#[tauri::command]
fn sync_status(state: tauri::State<'_, AppDb>) -> Result<SyncStatus, String> {
    let guard = state.0.lock().unwrap();
    let conn = guard.as_ref().ok_or("la base esta bloqueada")?;

    let server_url = sync::get_state(conn, "server_url").map_err(|e| e.to_string())?;
    let linked = sync::get_state(conn, "device_token")
        .map_err(|e| e.to_string())?
        .is_some();
    let cursor = sync::get_cursor(conn).map_err(|e| e.to_string())?;
    let clinical_profile = sync::get_state(conn, "clinical_profile").map_err(|e| e.to_string())?;
    let parse_minutes = |key: &str| -> Result<Option<i64>, String> {
        Ok(sync::get_state(conn, key)
            .map_err(|e| e.to_string())?
            .and_then(|value| value.parse::<i64>().ok()))
    };
    let slot_minutes = parse_minutes("slot_minutes")?;
    let work_start_minutes = parse_minutes("work_start_minutes")?;
    let work_end_minutes = parse_minutes("work_end_minutes")?;

    Ok(SyncStatus {
        linked,
        server_url,
        cursor,
        clinical_profile,
        slot_minutes,
        work_start_minutes,
        work_end_minutes,
    })
}

/// Desvincula este equipo de la cuenta del portal: borra el device token, la URL
/// del servidor y el cursor de sincronizacion de la base local cifrada. NO toca
/// los datos clinicos (expediente, citas, notas): solo el vinculo de sync. Sirve
/// para re-vincular tras cambiar de servidor, reinstalar el portal o si el
/// dispositivo fue revocado (el token local queda huerfano y el sync da 401).
/// El cursor se limpia para que el proximo vinculo baje el buzon desde cero.
#[tauri::command]
fn unlink_device(state: tauri::State<'_, AppDb>) -> Result<(), String> {
    let guard = state.0.lock().unwrap();
    let conn = guard.as_ref().ok_or("la base esta bloqueada")?;
    sync::delete_state(conn, "device_token").map_err(|e| e.to_string())?;
    sync::delete_state(conn, "server_url").map_err(|e| e.to_string())?;
    sync::delete_state(conn, "cursor").map_err(|e| e.to_string())?;
    Ok(())
}

/// Vincula la app con la cuenta del medico en el portal. El device token se
/// guarda dentro de la base cifrada; la contrasena no se persiste.
#[tauri::command]
async fn link_account(
    state: tauri::State<'_, AppDb>,
    server_url: String,
    email: String,
    password: String,
) -> Result<(), String> {
    let device_name = format!(
        "Escritorio {}",
        std::env::var("COMPUTERNAME").unwrap_or_else(|_| "MiDoc".into())
    );

    // Generar (si no existe) el par de llaves del medico y publicar la publica
    // sin retener el lock durante la llamada de red.
    let document_public_key = {
        let guard = state.0.lock().unwrap();
        let conn = guard.as_ref().ok_or("la base esta bloqueada")?;
        crypto::ensure_keypair(conn).map_err(|e| e.to_string())?
    };

    let link = sync::link_account(
        &server_url,
        &email,
        &password,
        &device_name,
        &document_public_key,
    )
    .await
    .map_err(|e| e.to_string())?;

    let guard = state.0.lock().unwrap();
    let conn = guard.as_ref().ok_or("la base esta bloqueada")?;
    sync::set_state(conn, "server_url", server_url.trim_end_matches('/'))
        .map_err(|e| e.to_string())?;
    sync::set_state(conn, "device_token", &link.device_token).map_err(|e| e.to_string())?;
    sync::set_state(conn, "cursor", "0").map_err(|e| e.to_string())?;
    persist_profile_metadata(conn, &link.metadata)?;
    Ok(())
}

/// Guarda en el estado local los metadatos del perfil (perfil clinico, duracion
/// de cita y horario laboral) que alimentan la agenda. Solo escribe los valores
/// presentes, para no pisar con vacio lo ya conocido.
fn persist_profile_metadata(
    conn: &rusqlite::Connection,
    metadata: &sync::ProfileMetadata,
) -> Result<(), String> {
    if let Some(clinical_profile) = metadata.clinical_profile.as_deref() {
        sync::set_state(conn, "clinical_profile", clinical_profile).map_err(|e| e.to_string())?;
    }
    if let Some(slot_minutes) = metadata.slot_minutes {
        sync::set_state(conn, "slot_minutes", &slot_minutes.to_string())
            .map_err(|e| e.to_string())?;
    }
    if let Some(work_start) = metadata.work_start_minutes {
        sync::set_state(conn, "work_start_minutes", &work_start.to_string())
            .map_err(|e| e.to_string())?;
    }
    if let Some(work_end) = metadata.work_end_minutes {
        sync::set_state(conn, "work_end_minutes", &work_end.to_string())
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Descarga eventos pendientes del buzon, los aplica a la base local y
/// confirma con ACK (la nube purga el contenido clinico entregado).
#[tauri::command]
async fn sync_now(state: tauri::State<'_, AppDb>) -> Result<sync::SyncSummary, String> {
    // Leer credenciales sin retener el lock durante las llamadas de red.
    let (server_url, token, mut cursor) = {
        let guard = state.0.lock().unwrap();
        let conn = guard.as_ref().ok_or("la base esta bloqueada")?;
        let server_url = sync::get_state(conn, "server_url")
            .map_err(|e| e.to_string())?
            .ok_or("la app no esta vinculada a una cuenta")?;
        let token = sync::get_state(conn, "device_token")
            .map_err(|e| e.to_string())?
            .ok_or("la app no esta vinculada a una cuenta")?;
        let cursor = sync::get_cursor(conn).map_err(|e| e.to_string())?;
        (server_url, token, cursor)
    };

    let mut applied: u64 = 0;

    loop {
        let inbox = sync::fetch_inbox(&server_url, &token, cursor)
            .await
            .map_err(|e| e.to_string())?;

        if inbox.events.is_empty() {
            break;
        }

        // Descargar los documentos del buzon (red, sin retener el lock) ANTES
        // de avanzar el cursor: si la descarga falla aqui, el cursor no se
        // mueve y el proximo sync re-entrega el lote completo (idempotente).
        let mut documents: Vec<(String, Option<String>, Option<String>, String)> = Vec::new();
        // Antecedentes sellados: (appointmentId, ciphertext base64).
        let mut precheckins: Vec<(String, String)> = Vec::new();
        for event in &inbox.events {
            let Some(payload) = &event.payload else {
                continue; // Evento ya purgado en nube: nada que descargar.
            };
            match event.event_type.as_str() {
                "DOCUMENT_UPLOADED" => {
                    let Some(doc_id) = payload.get("mailboxDocumentId").and_then(|v| v.as_str())
                    else {
                        continue;
                    };
                    let ciphertext = sync::fetch_document(&server_url, &token, doc_id)
                        .await
                        .map_err(|e| e.to_string())?;
                    let patient_id = payload
                        .get("patientId")
                        .and_then(|v| v.as_str())
                        .map(String::from);
                    let appointment_id = payload
                        .get("appointmentId")
                        .and_then(|v| v.as_str())
                        .map(String::from);
                    documents.push((doc_id.to_string(), patient_id, appointment_id, ciphertext));
                }
                "PRECHECKIN_SUBMITTED"
                    if payload.get("sealed").and_then(|v| v.as_bool()) == Some(true) =>
                {
                    let (Some(precheckin_id), Some(appointment_id)) = (
                        payload.get("precheckinId").and_then(|v| v.as_str()),
                        payload.get("appointmentId").and_then(|v| v.as_str()),
                    ) else {
                        continue;
                    };
                    let ciphertext = sync::fetch_precheckin(&server_url, &token, precheckin_id)
                        .await
                        .map_err(|e| e.to_string())?;
                    precheckins.push((appointment_id.to_string(), ciphertext));
                }
                _ => {}
            }
        }

        {
            let mut guard = state.0.lock().unwrap();
            let conn = guard.as_mut().ok_or("la base esta bloqueada")?;
            sync::apply_batch(conn, &inbox.events).map_err(|e| e.to_string())?;
            // Descifrar y guardar los documentos descargados.
            for (doc_id, patient_id, appointment_id, ciphertext) in &documents {
                let plaintext =
                    crypto::unseal_document(conn, ciphertext).map_err(|e| e.to_string())?;
                sync::store_mailbox_document(
                    conn,
                    doc_id,
                    patient_id.as_deref(),
                    appointment_id.as_deref(),
                    &plaintext,
                )
                .map_err(|e| e.to_string())?;
            }
            // Descifrar y guardar los antecedentes sellados.
            for (appointment_id, ciphertext) in &precheckins {
                let plaintext =
                    crypto::unseal_document(conn, ciphertext).map_err(|e| e.to_string())?;
                sync::store_mailbox_precheckin(conn, appointment_id, &plaintext)
                    .map_err(|e| e.to_string())?;
            }
            sync::set_state(conn, "cursor", &inbox.next_cursor.to_string())
                .map_err(|e| e.to_string())?;
        }

        // ACK despues de persistir localmente: si la red falla aqui, el
        // proximo sync re-entrega y la aplicacion es idempotente.
        sync::send_ack(&server_url, &token, inbox.next_cursor)
            .await
            .map_err(|e| e.to_string())?;

        applied += inbox.events.len() as u64;
        cursor = inbox.next_cursor;
    }

    let mut ai_usage_reported = 0u64;
    loop {
        let reports = {
            let guard = state.0.lock().unwrap();
            let conn = guard.as_ref().ok_or("la base esta bloqueada")?;
            ai::pending_usage_reports(conn, 100).map_err(|e| e.to_string())?
        };

        if reports.is_empty() {
            break;
        }

        let result = sync::report_ai_usage(&server_url, &token, &reports)
            .await
            .map_err(|e| e.to_string())?;
        let run_ids: Vec<String> = reports
            .iter()
            .map(|report| report.external_run_id.clone())
            .collect();
        {
            let guard = state.0.lock().unwrap();
            let conn = guard.as_ref().ok_or("la base esta bloqueada")?;
            ai::mark_usage_reports_sent(conn, &run_ids).map_err(|e| e.to_string())?;
        }
        ai_usage_reported += result.reported;
    }

    // Refrescar el perfil de la agenda (perfil clinico, duracion de cita y
    // horario laboral) en cada sincronizacion, no solo al vincular.
    let metadata = sync::fetch_profile_metadata(&server_url, &token)
        .await
        .map_err(|e| e.to_string())?;
    {
        let guard = state.0.lock().unwrap();
        let conn = guard.as_ref().ok_or("la base esta bloqueada")?;
        persist_profile_metadata(conn, &metadata)?;
    }

    Ok(sync::SyncSummary {
        applied_events: applied,
        cursor,
        ai_usage_reported,
    })
}

#[derive(serde::Serialize)]
struct SyncPending {
    /// Hay eventos del portal por bajar (peek del buzon, sin aplicar).
    pending_download: bool,
    /// Hay reportes de uso de IA locales por subir.
    pending_upload: bool,
}

/// Indica si hay cambios pendientes para alimentar el badge del boton
/// "Sincronizar", sin aplicar nada. La consulta de bajada es un peek de red
/// (best-effort): si no hay red, no se marca pendiente para no alarmar offline.
#[tauri::command]
async fn sync_pending(state: tauri::State<'_, AppDb>) -> Result<SyncPending, String> {
    let (server_url, token, cursor, pending_upload) = {
        let guard = state.0.lock().unwrap();
        let conn = guard.as_ref().ok_or("la base esta bloqueada")?;
        let server_url = sync::get_state(conn, "server_url").map_err(|e| e.to_string())?;
        let token = sync::get_state(conn, "device_token").map_err(|e| e.to_string())?;
        let (Some(server_url), Some(token)) = (server_url, token) else {
            // Sin vincular: nada pendiente.
            return Ok(SyncPending {
                pending_download: false,
                pending_upload: false,
            });
        };
        let cursor = sync::get_cursor(conn).map_err(|e| e.to_string())?;
        let pending_upload = !ai::pending_usage_reports(conn, 1)
            .map_err(|e| e.to_string())?
            .is_empty();
        (server_url, token, cursor, pending_upload)
    };

    // Peek de red sin retener el lock ni avanzar el cursor (no hace ACK).
    let pending_download = match sync::fetch_inbox(&server_url, &token, cursor).await {
        Ok(inbox) => !inbox.events.is_empty(),
        Err(_) => false,
    };

    Ok(SyncPending {
        pending_download,
        pending_upload,
    })
}

/// Publica un resumen autorizado para el paciente: cifra el contenido con una
/// llave nueva (secretbox), lo sube al portal y devuelve el enlace temporal con
/// la llave en el fragmento. La llave nunca llega al servidor.
#[tauri::command]
async fn publish_authorized_summary(
    state: tauri::State<'_, AppDb>,
    patient_id: String,
    appointment_id: Option<String>,
    title: Option<String>,
    content_base64: String,
) -> Result<String, String> {
    use base64::{engine::general_purpose::STANDARD as B64, Engine};

    let content = B64
        .decode(content_base64.trim())
        .map_err(|_| "contenido del resumen invalido".to_string())?;
    let (key_b64url, payload) = crypto::seal_summary(&content);

    let (server_url, token) = {
        let guard = state.0.lock().unwrap();
        let conn = guard.as_ref().ok_or("la base esta bloqueada")?;
        let server_url = sync::get_state(conn, "server_url")
            .map_err(|e| e.to_string())?
            .ok_or("la app no esta vinculada a una cuenta")?;
        let token = sync::get_state(conn, "device_token")
            .map_err(|e| e.to_string())?
            .ok_or("la app no esta vinculada a una cuenta")?;
        (server_url, token)
    };

    let download_url = sync::publish_summary(
        &server_url,
        &token,
        &patient_id,
        appointment_id.as_deref(),
        title.as_deref(),
        &payload,
    )
    .await
    .map_err(|e| e.to_string())?;

    // La llave viaja en el fragmento (#k=...): nunca se envia al servidor.
    Ok(format!("{download_url}#k={key_b64url}"))
}

#[tauri::command]
fn list_appointments(state: tauri::State<'_, AppDb>) -> Result<Vec<AppointmentRow>, String> {
    let guard = state.0.lock().unwrap();
    let conn = guard.as_ref().ok_or("la base esta bloqueada")?;
    load_appointments(conn)
}

fn load_appointments(conn: &rusqlite::Connection) -> Result<Vec<AppointmentRow>, String> {
    let mut statement = conn
        .prepare(
            "SELECT a.id, a.status, a.scheduled_start, a.scheduled_end, a.service_name,
                    a.reason, a.patient_first_name, a.patient_last_name, a.patient_phone,
                    EXISTS(
                        SELECT 1
                        FROM precheckins p
                        WHERE p.appointment_id = a.id
                    ) AS has_precheckin
             FROM appointments a
             ORDER BY a.scheduled_start ASC",
        )
        .map_err(|e| e.to_string())?;

    let rows = statement
        .query_map([], |row| {
            Ok(AppointmentRow {
                id: row.get(0)?,
                status: row.get(1)?,
                scheduled_start: row.get(2)?,
                scheduled_end: row.get(3)?,
                service_name: row.get(4)?,
                reason: row.get(5)?,
                patient_name: format!("{} {}", row.get::<_, String>(6)?, row.get::<_, String>(7)?),
                patient_phone: row.get(8)?,
                has_precheckin: row.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(rows)
}

/* ---------- Atencion clinica (paso 4) ---------- */

fn with_conn<T>(
    state: &tauri::State<'_, AppDb>,
    f: impl FnOnce(&rusqlite::Connection) -> Result<T, clinical::ClinicalError>,
) -> Result<T, String> {
    let guard = state.0.lock().unwrap();
    let conn = guard.as_ref().ok_or("la base esta bloqueada")?;
    f(conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_encounter(
    state: tauri::State<'_, AppDb>,
    appointment_id: String,
) -> Result<clinical::Encounter, String> {
    with_conn(&state, |conn| {
        clinical::open_encounter_for_appointment(conn, &appointment_id)
    })
}

#[tauri::command]
fn get_encounter(
    state: tauri::State<'_, AppDb>,
    encounter_id: String,
) -> Result<clinical::EncounterDetail, String> {
    with_conn(&state, |conn| {
        clinical::get_encounter_detail(conn, &encounter_id)
    })
}

#[tauri::command]
fn attend_appointment(
    state: tauri::State<'_, AppDb>,
    appointment_id: String,
    link_patient_id: Option<String>,
    force_new: bool,
) -> Result<clinical::AttendOutcome, String> {
    with_conn(&state, |conn| {
        clinical::attend_appointment(
            conn,
            &appointment_id,
            link_patient_id.as_deref(),
            force_new,
        )
    })
}

/// Resuelve, desde la agenda, a que expediente pertenece una cita y abre su
/// expediente, sin iniciar un encuentro. Misma busqueda anti-duplicados que
/// `attend_appointment`, pero el desenlace es el expediente del paciente.
#[tauri::command]
fn resolve_appointment_patient(
    state: tauri::State<'_, AppDb>,
    appointment_id: String,
    link_patient_id: Option<String>,
    force_new: bool,
) -> Result<clinical::ResolveOutcome, String> {
    with_conn(&state, |conn| {
        clinical::resolve_appointment_patient(
            conn,
            &appointment_id,
            link_patient_id.as_deref(),
            force_new,
        )
    })
}

#[tauri::command]
fn list_patients(
    state: tauri::State<'_, AppDb>,
    search: Option<String>,
) -> Result<Vec<clinical::PatientSummary>, String> {
    with_conn(&state, |conn| {
        clinical::list_patients(conn, search.as_deref())
    })
}

#[tauri::command]
fn get_patient_profile(
    state: tauri::State<'_, AppDb>,
    patient_id: String,
) -> Result<clinical::PatientProfile, String> {
    with_conn(&state, |conn| {
        clinical::get_patient_profile(conn, &patient_id)
    })
}

#[tauri::command]
fn find_patient_matches(
    state: tauri::State<'_, AppDb>,
    email: Option<String>,
    phone: Option<String>,
    first_name: String,
    last_name: String,
) -> Result<Vec<clinical::PatientSummary>, String> {
    with_conn(&state, |conn| {
        clinical::find_patient_matches(
            conn,
            email.as_deref(),
            phone.as_deref(),
            &first_name,
            &last_name,
        )
    })
}

#[tauri::command]
fn create_patient(
    state: tauri::State<'_, AppDb>,
    patient: clinical::NewPatientInput,
) -> Result<clinical::PatientRecord, String> {
    with_conn(&state, |conn| clinical::create_patient(conn, &patient))
}

#[tauri::command]
fn open_patient_encounter(
    state: tauri::State<'_, AppDb>,
    patient_id: String,
) -> Result<clinical::Encounter, String> {
    with_conn(&state, |conn| {
        clinical::open_encounter_for_patient(conn, &patient_id)
    })
}

#[tauri::command]
fn list_timeline_events(
    state: tauri::State<'_, AppDb>,
    patient_id: String,
) -> Result<Vec<clinical::TimelineEvent>, String> {
    with_conn(&state, |conn| {
        clinical::list_timeline_events(conn, &patient_id)
    })
}

#[tauri::command]
fn add_timeline_event(
    state: tauri::State<'_, AppDb>,
    patient_id: String,
    event: clinical::TimelineEventInput,
) -> Result<clinical::TimelineEvent, String> {
    with_conn(&state, |conn| {
        clinical::add_timeline_event(conn, &patient_id, &event)
    })
}

#[tauri::command]
fn update_timeline_event(
    state: tauri::State<'_, AppDb>,
    event_id: String,
    event: clinical::TimelineEventInput,
) -> Result<clinical::TimelineEvent, String> {
    with_conn(&state, |conn| {
        clinical::update_timeline_event(conn, &event_id, &event)
    })
}

#[tauri::command]
fn delete_timeline_event(
    state: tauri::State<'_, AppDb>,
    event_id: String,
) -> Result<(), String> {
    with_conn(&state, |conn| {
        clinical::delete_timeline_event(conn, &event_id)
    })
}

#[tauri::command]
fn save_note(
    state: tauri::State<'_, AppDb>,
    encounter_id: String,
    note: clinical::NoteContent,
) -> Result<i64, String> {
    with_conn(&state, |conn| {
        clinical::save_note(conn, &encounter_id, &note)
    })
}

#[tauri::command]
fn save_prescription(
    state: tauri::State<'_, AppDb>,
    encounter_id: String,
    content: String,
) -> Result<(), String> {
    with_conn(&state, |conn| {
        clinical::save_prescription(conn, &encounter_id, &content)
    })
}

#[tauri::command]
fn update_patient_background(
    state: tauri::State<'_, AppDb>,
    patient_id: String,
    background: clinical::PatientBackgroundInput,
) -> Result<(), String> {
    with_conn(&state, |conn| {
        clinical::update_patient_background(conn, &patient_id, &background)
    })
}

#[tauri::command]
fn get_patient_medical_history(
    state: tauri::State<'_, AppDb>,
    patient_id: String,
) -> Result<Option<clinical::PatientMedicalHistoryVersion>, String> {
    with_conn(&state, |conn| {
        clinical::latest_patient_medical_history(conn, &patient_id)
    })
}

#[tauri::command]
fn save_patient_medical_history(
    state: tauri::State<'_, AppDb>,
    patient_id: String,
    input: clinical::SavePatientMedicalHistoryInput,
) -> Result<clinical::PatientMedicalHistoryVersion, String> {
    let mut guard = state.0.lock().unwrap();
    let conn = guard.as_mut().ok_or("la base esta bloqueada")?;
    clinical::save_patient_medical_history_version(conn, &patient_id, &input)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn sign_encounter(
    state: tauri::State<'_, AppDb>,
    encounter_id: String,
) -> Result<clinical::Encounter, String> {
    with_conn(&state, |conn| clinical::sign_encounter(conn, &encounter_id))
}

#[tauri::command]
fn verify_signature(state: tauri::State<'_, AppDb>, encounter_id: String) -> Result<bool, String> {
    with_conn(&state, |conn| {
        clinical::verify_signature(conn, &encounter_id)
    })
}

/* ---------- Operacion presencial (paso 10) ---------- */

fn with_ops<T>(
    state: &tauri::State<'_, AppDb>,
    f: impl FnOnce(&rusqlite::Connection) -> Result<T, operations::OperationsError>,
) -> Result<T, String> {
    let guard = state.0.lock().unwrap();
    let conn = guard.as_ref().ok_or("la base esta bloqueada")?;
    f(conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_resources(state: tauri::State<'_, AppDb>) -> Result<Vec<operations::Resource>, String> {
    with_ops(&state, operations::list_resources)
}

#[tauri::command]
fn create_resource(
    state: tauri::State<'_, AppDb>,
    resource: operations::NewResource,
) -> Result<operations::Resource, String> {
    with_ops(&state, |conn| operations::create_resource(conn, &resource))
}

#[tauri::command]
fn set_resource_active(
    state: tauri::State<'_, AppDb>,
    resource_id: String,
    active: bool,
) -> Result<(), String> {
    with_ops(&state, |conn| {
        operations::set_resource_active(conn, &resource_id, active)
    })
}

#[tauri::command]
fn list_active_visits(state: tauri::State<'_, AppDb>) -> Result<Vec<operations::Visit>, String> {
    with_ops(&state, operations::list_active_visits)
}

#[tauri::command]
fn check_in_appointment(
    state: tauri::State<'_, AppDb>,
    appointment_id: String,
    priority: Option<i64>,
) -> Result<operations::Visit, String> {
    with_ops(&state, |conn| {
        operations::check_in_appointment(conn, &appointment_id, priority.unwrap_or(0))
    })
}

/// Resultado de registrar una consulta sin cita: o se creo la visita, o hay
/// candidatos a duplicado que el recepcionista debe revisar antes de crear el
/// expediente.
#[derive(serde::Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum WalkInOutcome {
    Visit { visit: Box<operations::Visit> },
    NeedsResolution { candidates: Vec<clinical::PatientMatch> },
}

#[tauri::command]
fn register_walk_in(
    state: tauri::State<'_, AppDb>,
    walk_in: operations::WalkInInput,
    link_patient_id: Option<String>,
    force_new: bool,
) -> Result<WalkInOutcome, String> {
    let guard = state.0.lock().unwrap();
    let conn = guard.as_ref().ok_or("la base esta bloqueada")?;

    // El recepcionista identifico al paciente: vincula a su expediente.
    if let Some(patient_id) = &link_patient_id {
        let visit = operations::register_walk_in_for_patient(conn, &walk_in, patient_id)
            .map_err(|e| e.to_string())?;
        return Ok(WalkInOutcome::Visit {
            visit: Box::new(visit),
        });
    }

    // El recepcionista confirmo que es alguien nuevo.
    if force_new {
        let visit = operations::register_walk_in(conn, &walk_in).map_err(|e| e.to_string())?;
        return Ok(WalkInOutcome::Visit {
            visit: Box::new(visit),
        });
    }

    // Automatico: busca duplicados por nombre (con mas peso) y telefono.
    let name = walk_in.patient_name.trim();
    let (first, last) = match name.split_once(' ') {
        Some((f, l)) => (f, l),
        None => (name, ""),
    };
    let candidates = clinical::match_patients_with_reasons(
        conn,
        None,
        walk_in.patient_phone.as_deref(),
        first,
        last,
    )
    .map_err(|e| e.to_string())?;

    if candidates.is_empty() {
        let visit = operations::register_walk_in(conn, &walk_in).map_err(|e| e.to_string())?;
        Ok(WalkInOutcome::Visit {
            visit: Box::new(visit),
        })
    } else {
        Ok(WalkInOutcome::NeedsResolution { candidates })
    }
}

#[tauri::command]
fn set_visit_state(
    state: tauri::State<'_, AppDb>,
    visit_id: String,
    visit_state: String,
) -> Result<operations::Visit, String> {
    with_ops(&state, |conn| {
        operations::set_visit_state(conn, &visit_id, &visit_state)
    })
}

#[tauri::command]
fn assign_resource(
    state: tauri::State<'_, AppDb>,
    visit_id: String,
    resource_id: Option<String>,
) -> Result<operations::Visit, String> {
    with_ops(&state, |conn| {
        operations::assign_resource(conn, &visit_id, resource_id.as_deref())
    })
}

/// Inicia la consulta de una visita: abre (o reusa) el expediente clinico —
/// desde la cita si la hay, o como walk-in para el paciente — lo enlaza a la
/// visita y la marca en consulta. Devuelve el id del encuentro para abrir la
/// pantalla de atencion existente.
#[tauri::command]
fn start_visit_encounter(
    state: tauri::State<'_, AppDb>,
    visit_id: String,
    link_patient_id: Option<String>,
    force_new: bool,
) -> Result<clinical::AttendOutcome, String> {
    let guard = state.0.lock().unwrap();
    let conn = guard.as_ref().ok_or("la base esta bloqueada")?;

    let visit = operations::read_active_visit(conn, &visit_id).map_err(|e| e.to_string())?;
    match (&visit.appointment_id, &visit.patient_id) {
        // Visita con cita: resuelve por la misma via anti-duplicados que la
        // agenda. Si hay candidatos, devuelve la resolucion sin abrir nada.
        (Some(appointment_id), _) => {
            let outcome = clinical::attend_appointment(
                conn,
                appointment_id,
                link_patient_id.as_deref(),
                force_new,
            )
            .map_err(|e| e.to_string())?;
            if let clinical::AttendOutcome::Encounter { encounter_id } = &outcome {
                operations::link_visit_encounter(conn, &visit_id, encounter_id)
                    .map_err(|e| e.to_string())?;
            }
            Ok(outcome)
        }
        // Walk-in: el paciente ya se resolvio al registrarlo en recepcion.
        (None, Some(patient_id)) => {
            let encounter =
                clinical::open_encounter_for_patient(conn, patient_id).map_err(|e| e.to_string())?;
            operations::link_visit_encounter(conn, &visit_id, &encounter.id)
                .map_err(|e| e.to_string())?;
            Ok(clinical::AttendOutcome::Encounter { encounter_id: encounter.id })
        }
        (None, None) => Err("la visita no tiene paciente asociado".into()),
    }
}

#[tauri::command]
fn get_open_cash_session(
    state: tauri::State<'_, AppDb>,
) -> Result<Option<operations::CashSession>, String> {
    with_ops(&state, operations::get_open_session)
}

#[tauri::command]
fn open_cash_session(
    state: tauri::State<'_, AppDb>,
    opening_float_cents: i64,
) -> Result<operations::CashSession, String> {
    with_ops(&state, |conn| {
        operations::open_cash_session(conn, opening_float_cents)
    })
}

#[tauri::command]
fn close_cash_session(
    state: tauri::State<'_, AppDb>,
    counted_cash_cents: i64,
    notes: Option<String>,
) -> Result<operations::CashSummary, String> {
    with_ops(&state, |conn| {
        operations::close_cash_session(conn, counted_cash_cents, notes.as_deref())
    })
}

#[tauri::command]
fn cash_summary(
    state: tauri::State<'_, AppDb>,
    session_id: String,
) -> Result<operations::CashSummary, String> {
    with_ops(&state, |conn| operations::cash_summary(conn, &session_id))
}

#[tauri::command]
fn register_payment(
    state: tauri::State<'_, AppDb>,
    payment: operations::PaymentInput,
) -> Result<operations::Payment, String> {
    with_ops(&state, |conn| operations::register_payment(conn, &payment))
}

#[tauri::command]
fn list_session_payments(
    state: tauri::State<'_, AppDb>,
    session_id: String,
) -> Result<Vec<operations::Payment>, String> {
    with_ops(&state, |conn| {
        operations::list_session_payments(conn, &session_id)
    })
}

/* ---------- IA clinica gobernada (paso 11) ---------- */

fn with_ai<T>(
    state: &tauri::State<'_, AppDb>,
    f: impl FnOnce(&rusqlite::Connection) -> Result<T, ai::AiError>,
) -> Result<T, String> {
    let guard = state.0.lock().unwrap();
    let conn = guard.as_ref().ok_or("la base esta bloqueada")?;
    f(conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn ai_consent_status(state: tauri::State<'_, AppDb>, patient_id: String) -> Result<bool, String> {
    with_ai(&state, |conn| {
        Ok(ai::active_consent(conn, &patient_id, ai::SCOPE_TEXT_ASSIST)?.is_some())
    })
}

#[tauri::command]
fn ai_grant_consent(state: tauri::State<'_, AppDb>, patient_id: String) -> Result<(), String> {
    with_ai(&state, |conn| {
        ai::grant_consent(conn, &patient_id, ai::SCOPE_TEXT_ASSIST).map(|_| ())
    })
}

#[tauri::command]
fn ai_revoke_consent(state: tauri::State<'_, AppDb>, patient_id: String) -> Result<(), String> {
    with_ai(&state, |conn| {
        ai::revoke_consent(conn, &patient_id, ai::SCOPE_TEXT_ASSIST)
    })
}

#[tauri::command]
fn ai_voice_consent_status(
    state: tauri::State<'_, AppDb>,
    patient_id: String,
) -> Result<bool, String> {
    with_ai(&state, |conn| {
        Ok(ai::active_consent(conn, &patient_id, ai::SCOPE_VOICE_TRANSCRIPTION)?.is_some())
    })
}

#[tauri::command]
fn ai_grant_voice_consent(
    state: tauri::State<'_, AppDb>,
    patient_id: String,
) -> Result<(), String> {
    with_ai(&state, |conn| {
        ai::grant_consent(conn, &patient_id, ai::SCOPE_VOICE_TRANSCRIPTION).map(|_| ())
    })
}

#[tauri::command]
fn ai_revoke_voice_consent(
    state: tauri::State<'_, AppDb>,
    patient_id: String,
) -> Result<(), String> {
    with_ai(&state, |conn| {
        ai::revoke_consent(conn, &patient_id, ai::SCOPE_VOICE_TRANSCRIPTION)
    })
}

#[tauri::command]
fn ai_scribe_consent_status(
    state: tauri::State<'_, AppDb>,
    patient_id: String,
) -> Result<bool, String> {
    with_ai(&state, |conn| {
        Ok(ai::active_consent(conn, &patient_id, ai::SCOPE_CONSULTATION_SCRIBE)?.is_some())
    })
}

#[tauri::command]
fn ai_grant_scribe_consent(
    state: tauri::State<'_, AppDb>,
    patient_id: String,
) -> Result<(), String> {
    with_ai(&state, |conn| {
        ai::grant_consent(conn, &patient_id, ai::SCOPE_CONSULTATION_SCRIBE).map(|_| ())
    })
}

#[tauri::command]
fn ai_revoke_scribe_consent(
    state: tauri::State<'_, AppDb>,
    patient_id: String,
) -> Result<(), String> {
    with_ai(&state, |conn| {
        ai::revoke_consent(conn, &patient_id, ai::SCOPE_CONSULTATION_SCRIBE)
    })
}

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct AudioTranscriptionPayload {
    file_name: Option<String>,
    media_type: String,
    audio_base64: String,
    duration_seconds: Option<i64>,
}

#[derive(Debug, serde::Deserialize)]
struct ConsultationTemplatePayload {
    #[allow(dead_code)]
    id: String,
    segments: Vec<ai::TemplateSegment>,
}

#[tauri::command]
fn ai_assist_soap(
    state: tauri::State<'_, AppDb>,
    encounter_id: String,
) -> Result<ai::SoapDraft, String> {
    let registry = ai::ProviderRegistry::default_local();
    with_ai(&state, |conn| {
        ai::assist_soap(conn, &encounter_id, &registry)
    })
}

#[tauri::command]
fn ai_assist_text(
    state: tauri::State<'_, AppDb>,
    encounter_id: String,
    usage_type: String,
) -> Result<ai::TextDraft, String> {
    let registry = ai::ProviderRegistry::default_local();
    with_ai(&state, |conn| {
        ai::assist_text(conn, &encounter_id, &usage_type, &registry)
    })
}

/// Proveedor de transcripcion LOCAL (Whisper en el dispositivo). Con el feature
/// `whisper-local`, usa el modelo descargado (rebanada 1) y transcribe EN EL
/// DISPOSITIVO; si aun no se descargo, guia a descargarlo. Sin el feature,
/// explica que esta build no incluye el binding nativo (se compila en la build
/// de distribucion).
///
/// La via en nube gobernada por el portal se construye aparte en
/// `ai_transcribe_audio`: necesita el estado de sync cifrado (server_url +
/// device_token), no variables de entorno.
fn resolve_local_transcription_provider(
    app: &tauri::AppHandle,
) -> Result<Box<dyn ai::TranscriptionProvider>, String> {
    #[cfg(feature = "whisper-local")]
    {
        let rec = transcription::recommendation();
        let asset = transcription_model::asset_for(&rec.model_id)
            .ok_or("el modelo recomendado no se reconoce")?;
        let base_dir = app_data_dir(app)?;
        let path = transcription_model::model_path(&base_dir, &asset.file_name);
        if !path.exists() {
            return Err(
                "Aun no descargas el modelo de transcripcion. Ve a la pestana Transcripcion y descargalo."
                    .into(),
            );
        }
        // El modelo VAD (saltar silencios) es opcional: si esta descargado se usa
        // para acelerar; si no, la transcripcion degrada a procesar todo el audio.
        let vad_asset = transcription_model::asset_for(transcription_model::VAD_MODEL_ID);
        let vad_path = vad_asset
            .map(|a| transcription_model::model_path(&base_dir, &a.file_name))
            .filter(|p| p.exists());
        Ok(Box::new(whisper_provider::WhisperLocalProvider::new(
            &rec.model_id,
            path,
            vad_path,
        )))
    }
    #[cfg(not(feature = "whisper-local"))]
    {
        let _ = app;
        Err(
            "Esta version no incluye la transcripcion local (Whisper). Se habilita en la build de distribucion con el feature whisper-local."
                .into(),
        )
    }
}

#[tauri::command]
fn ai_transcribe_audio(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppDb>,
    encounter_id: String,
    audio: AudioTranscriptionPayload,
    use_cloud: Option<bool>,
    mode: Option<String>,
) -> Result<ai::TranscriptionDraft, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(audio.audio_base64.as_bytes())
        .map_err(|_| "audio invalido".to_string())?;

    // Modo de la via en nube: estandar (default) o diarizado (separa hablantes).
    let cloud_mode = match mode.as_deref() {
        None | Some("standard") => "standard",
        Some("diarized") => "diarized",
        Some(other) => return Err(format!("modo de transcripcion no valido: {other}")),
    };

    let provider: Box<dyn ai::TranscriptionProvider> = if use_cloud.unwrap_or(false) {
        // Via en nube gobernada: el desktop NO conoce la clave del proveedor;
        // envia el audio al portal con el token del dispositivo vinculado. El
        // server_url y el device_token viven en el estado de sync cifrado.
        let (server_url, device_token) = {
            let guard = state.0.lock().unwrap();
            let conn = guard.as_ref().ok_or("la base esta bloqueada")?;
            let server_url = sync::get_state(conn, "server_url").map_err(|e| e.to_string())?;
            let token = sync::get_state(conn, "device_token").map_err(|e| e.to_string())?;
            let (Some(server_url), Some(token)) = (server_url, token) else {
                return Err(
                    "El respaldo en nube requiere vincular este equipo con el portal.".into(),
                );
            };
            (server_url, token)
        };
        // `runId` operativo por transcripcion: hace idempotente el credito en el
        // portal. El modo (estandar/diarizado) lo elige el medico en la UI.
        let run_id = uuid::Uuid::new_v4().to_string();
        Box::new(
            cloud_transcription::PortalTranscriptionProvider::new(
                server_url,
                device_token,
                run_id,
                cloud_mode,
            )
            .map_err(|e| e.to_string())?,
        )
    } else {
        resolve_local_transcription_provider(&app)?
    };

    with_ai(&state, |conn| {
        ai::transcribe_audio(
            conn,
            &encounter_id,
            ai::AudioInput {
                file_name: audio.file_name,
                media_type: audio.media_type,
                bytes,
                duration_seconds: audio.duration_seconds,
            },
            provider.as_ref(),
        )
    })
}

#[tauri::command]
fn ai_save_reviewed_transcription(
    state: tauri::State<'_, AppDb>,
    encounter_id: String,
    run_id: String,
    turns: Vec<ai::ConsultationTurn>,
) -> Result<ai::ReviewedTranscription, String> {
    with_ai(&state, |conn| {
        ai::save_reviewed_transcription(conn, &encounter_id, &run_id, turns)
    })
}

#[tauri::command]
fn ai_latest_reviewed_transcription(
    state: tauri::State<'_, AppDb>,
    encounter_id: String,
) -> Result<Option<ai::ReviewedTranscription>, String> {
    with_ai(&state, |conn| {
        ai::latest_reviewed_transcription(conn, &encounter_id)
    })
}

#[tauri::command]
fn ai_discard_reviewed_transcription(
    state: tauri::State<'_, AppDb>,
    encounter_id: String,
    run_id: String,
) -> Result<(), String> {
    with_ai(&state, |conn| {
        ai::discard_reviewed_transcription(conn, &encounter_id, &run_id)
    })
}

/// Rutas en disco de los dos modelos ONNX de diarizacion (segmentacion + embedding).
/// No exige que existan: si faltan, el diarizador fallara y el flujo degradara a
/// transcripcion sin separacion.
fn diarization_model_paths(app: &tauri::AppHandle) -> Result<(PathBuf, PathBuf), String> {
    let base_dir = app_data_dir(app)?;
    let seg = diarization_model::asset_for("diarization-segmentation")
        .ok_or("modelo de segmentacion no reconocido")?;
    let emb = diarization_model::asset_for("diarization-embedding")
        .ok_or("modelo de embedding no reconocido")?;
    Ok((
        transcription_model::model_path(&base_dir, &seg.file_name),
        transcription_model::model_path(&base_dir, &emb.file_name),
    ))
}

/// Transcribe la consulta y separa hablantes (diarizacion local) para entregar un
/// dialogo Medico/Paciente revisable. Local-first: Whisper + sherpa-onnx corren en
/// el equipo, el audio se decodifica en memoria y se descarta. Si faltan los modelos
/// de diarizacion o el feature nativo, `diarized=false` y el frontend cae a su
/// heuristica de turnos sobre el texto (la consulta se transcribe igual).
#[tauri::command]
fn ai_diarize_consultation(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppDb>,
    encounter_id: String,
    audio: AudioTranscriptionPayload,
    num_speakers: Option<u8>,
) -> Result<ai::DiarizationDraft, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(audio.audio_base64.as_bytes())
        .map_err(|_| "audio invalido".to_string())?;
    // Seleccion del medico: 0 = Auto (sherpa estima), 1..=3 = fijo. Se acota al
    // tope razonable; cualquier valor mayor se trata como el maximo.
    let requested = num_speakers
        .unwrap_or(diarization::DEFAULT_NUM_SPEAKERS)
        .min(diarization::MAX_NUM_SPEAKERS);
    // La diarizacion necesita los segmentos con marcas de tiempo de Whisper local;
    // la transcripcion en nube no los aporta, asi que aqui se usa la via local.
    let provider = resolve_local_transcription_provider(&app)?;
    let (seg_path, emb_path) = diarization_model_paths(&app)?;
    let diarizer = move |samples: &[f32], sample_rate: u32| {
        sherpa_diarization::diarize_samples(
            samples,
            sample_rate,
            &seg_path,
            &emb_path,
            requested,
        )
    };
    with_ai(&state, |conn| {
        ai::diarize_consultation(
            conn,
            &encounter_id,
            ai::AudioInput {
                file_name: audio.file_name,
                media_type: audio.media_type,
                bytes,
                duration_seconds: audio.duration_seconds,
            },
            provider.as_ref(),
            &diarizer,
        )
    })
}

#[tauri::command]
fn ai_structure_consultation(
    state: tauri::State<'_, AppDb>,
    encounter_id: String,
    turns: Vec<ai::ConsultationTurn>,
    template: ConsultationTemplatePayload,
) -> Result<ai::ConsultationStructuringDraft, String> {
    let registry = ai::ProviderRegistry::default_local();
    with_ai(&state, |conn| {
        ai::structure_consultation(conn, &encounter_id, turns, template.segments, &registry)
    })
}

#[tauri::command]
fn ai_generate_clinical_aid(
    state: tauri::State<'_, AppDb>,
    encounter_id: String,
    template: ConsultationTemplatePayload,
) -> Result<ai::ClinicalAidDraft, String> {
    let registry = ai::ProviderRegistry::default_local();
    with_ai(&state, |conn| {
        ai::generate_clinical_aid(conn, &encounter_id, template.segments, &registry)
    })
}

fn with_consultation_templates<T>(
    state: &tauri::State<'_, AppDb>,
    f: impl FnOnce(&rusqlite::Connection) -> Result<T, consultation_templates::TemplateError>,
) -> Result<T, String> {
    let guard = state.0.lock().unwrap();
    let conn = guard.as_ref().ok_or("la base esta bloqueada")?;
    f(conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_consultation_templates(
    state: tauri::State<'_, AppDb>,
) -> Result<Vec<consultation_templates::StoredTemplate>, String> {
    with_consultation_templates(&state, consultation_templates::list_templates)
}

#[tauri::command]
fn save_consultation_template(
    state: tauri::State<'_, AppDb>,
    template: consultation_templates::StoredTemplate,
) -> Result<consultation_templates::StoredTemplate, String> {
    with_consultation_templates(&state, |conn| {
        consultation_templates::save_template(conn, template)
    })
}

#[tauri::command]
fn delete_consultation_template(
    state: tauri::State<'_, AppDb>,
    id: String,
) -> Result<(), String> {
    with_consultation_templates(&state, |conn| {
        consultation_templates::delete_template(conn, &id)
    })
}

#[tauri::command]
fn ai_review_run(
    state: tauri::State<'_, AppDb>,
    run_id: String,
    status: String,
    feedback: Option<String>,
) -> Result<ai::AiRun, String> {
    with_ai(&state, |conn| {
        ai::review_run(conn, &run_id, &status, feedback.as_deref())
    })
}

#[tauri::command]
fn ai_list_runs(
    state: tauri::State<'_, AppDb>,
    encounter_id: String,
) -> Result<Vec<ai::AiRun>, String> {
    with_ai(&state, |conn| ai::list_runs(conn, &encounter_id))
}

#[tauri::command]
fn ai_usage_summary(state: tauri::State<'_, AppDb>) -> Result<ai::UsageSummary, String> {
    with_ai(&state, ai::usage_summary)
}

#[tauri::command]
fn ai_set_budget(state: tauri::State<'_, AppDb>, budget_cents: i64) -> Result<(), String> {
    with_ai(&state, |conn| ai::set_budget_cents(conn, budget_cents))
}

#[tauri::command]
fn ai_run_benchmark(
    state: tauri::State<'_, AppDb>,
    name: String,
) -> Result<ai::BenchmarkRun, String> {
    with_ai(&state, |conn| ai::run_default_benchmark(conn, &name))
}

#[tauri::command]
fn ai_list_benchmarks(state: tauri::State<'_, AppDb>) -> Result<Vec<ai::BenchmarkRun>, String> {
    with_ai(&state, ai::list_benchmarks)
}

/// Verifica la seguridad de una lista de medicamentos (interacciones, alergias
/// cruzadas y duplicidad terapeutica) de forma determinista, sin IA. Toma las
/// alergias del expediente del paciente del encuentro. La prescripcion no sale
/// del equipo.
#[tauri::command]
fn check_medication_safety(
    state: tauri::State<'_, AppDb>,
    encounter_id: String,
    medications: Vec<String>,
) -> Result<medication::SafetyReport, String> {
    let guard = state.0.lock().unwrap();
    let conn = guard.as_ref().ok_or("la base esta bloqueada")?;
    let detail = clinical::get_encounter_detail(conn, &encounter_id).map_err(|e| e.to_string())?;
    medication::check_prescription(
        conn,
        &encounter_id,
        &medications,
        detail.patient.allergies.as_deref(),
    )
    .map_err(|e| e.to_string())
}

/// Estado de la base de referencia de medicamentos (version y cantidades).
#[tauri::command]
fn medication_reference_status(
    state: tauri::State<'_, AppDb>,
) -> Result<medication::ReferenceStatus, String> {
    let guard = state.0.lock().unwrap();
    let conn = guard.as_ref().ok_or("la base esta bloqueada")?;
    medication::reference_status(conn).map_err(|e| e.to_string())
}

/// Importa la base de referencia de medicamentos desde datos reales (CSV de
/// medicamentos/clases derivado de RxNorm/RxClass y CSV de interacciones de
/// DDInter). Reemplaza la base local y actualiza su version. Datos publicos de
/// referencia (no PHI); nada sale del equipo.
#[tauri::command]
fn import_medication_reference(
    state: tauri::State<'_, AppDb>,
    medications_csv: String,
    ddinter_csv: String,
    openfda_json: String,
    version: String,
) -> Result<medication::ImportSummary, String> {
    let medications = medication::parse_medication_csv(&medications_csv).map_err(|e| e.to_string())?;
    let interactions = medication::parse_ddinter_csv(&ddinter_csv).map_err(|e| e.to_string())?;
    let labels = medication::parse_openfda_labels(&openfda_json).map_err(|e| e.to_string())?;
    let guard = state.0.lock().unwrap();
    let conn = guard.as_ref().ok_or("la base esta bloqueada")?;
    let mut summary =
        medication::import_reference(conn, &medications, &interactions, &version).map_err(|e| e.to_string())?;
    summary.labels = medication::import_label_text(conn, &labels, &version).map_err(|e| e.to_string())?;
    Ok(summary)
}

/// Actualiza la base de referencia de medicamentos descargando los datos de
/// fuentes oficiales (CSV de medicamentos/clases y CSV de interacciones de
/// DDInter) y reemplazando la base local. El servicio externo solo regenera la
/// base; la verificacion de cada receta sigue siendo local. Los datos son de
/// REFERENCIA publica (no PHI): no se envia ningun dato del paciente. La descarga
/// se vetta (rechaza datos vacios o sospechosamente pequenos) antes de reemplazar.
#[tauri::command]
async fn update_medication_reference(
    state: tauri::State<'_, AppDb>,
    medications_url: String,
    ddinter_url: String,
    openfda_url: String,
    version: String,
) -> Result<medication::ImportSummary, String> {
    // Descarga (red): se hace antes de tomar el lock; no se retiene el lock
    // durante ningun await.
    let client = reqwest::Client::new();
    let medications_csv = fetch_text(&client, medications_url.trim(), "medicamentos").await?;
    let ddinter_csv = fetch_text(&client, ddinter_url.trim(), "interacciones").await?;
    let openfda_json = fetch_text(&client, openfda_url.trim(), "etiquetas").await?;

    let dataset = medication::MedicationDataset {
        medications_csv,
        ddinter_csv,
        openfda_json,
        version,
    };

    let guard = state.0.lock().unwrap();
    let conn = guard.as_ref().ok_or("la base esta bloqueada")?;
    medication::update_reference(
        conn,
        &dataset,
        medication::MIN_MEDICATIONS,
        medication::MIN_INTERACTIONS,
    )
    .map_err(|e| e.to_string())
}

const MIDOC_MEDICATIONS_URL: Option<&str> = option_env!("MIDOC_MEDICATIONS_URL");
const MIDOC_DDINTER_URL: Option<&str> = option_env!("MIDOC_DDINTER_URL");
const MIDOC_OPENFDA_URL: Option<&str> = option_env!("MIDOC_OPENFDA_URL");

/// Actualiza la base usando la fuente fija de MiDoc. En builds sin endpoints
/// configurados instala el catalogo curado empaquetado con la app, asi el medico
/// no escribe URLs y la verificacion sigue funcionando offline.
#[tauri::command]
async fn update_medication_reference_from_midoc(
    state: tauri::State<'_, AppDb>,
) -> Result<medication::ImportSummary, String> {
    let configured_medications = MIDOC_MEDICATIONS_URL.unwrap_or("").trim();
    let configured_ddinter = MIDOC_DDINTER_URL.unwrap_or("").trim();

    let summary = if !configured_medications.is_empty() && !configured_ddinter.is_empty() {
        let client = reqwest::Client::new();
        let medications_csv = fetch_text(&client, configured_medications, "medicamentos MiDoc").await?;
        let ddinter_csv = fetch_text(&client, configured_ddinter, "interacciones MiDoc").await?;
        let openfda_json = fetch_text(
            &client,
            MIDOC_OPENFDA_URL.unwrap_or("").trim(),
            "etiquetas MiDoc",
        )
        .await?;
        let dataset = medication::MedicationDataset {
            medications_csv,
            ddinter_csv,
            openfda_json,
            version: medication::BUNDLED_REFERENCE_VERSION.to_string(),
        };

        let guard = state.0.lock().unwrap();
        let conn = guard.as_ref().ok_or("la base esta bloqueada")?;
        medication::update_reference(
            conn,
            &dataset,
            medication::MIN_MEDICATIONS,
            medication::MIN_INTERACTIONS,
        )
        .map_err(|e| e.to_string())?
    } else {
        let guard = state.0.lock().unwrap();
        let conn = guard.as_ref().ok_or("la base esta bloqueada")?;
        medication::install_bundled_reference(conn).map_err(|e| e.to_string())?
    };

    Ok(summary)
}

/// Descarga texto de una URL (o cadena vacia si la URL esta vacia). Frontera de
/// red: el contrato real con las fuentes se verifica en staging.
async fn fetch_text(client: &reqwest::Client, url: &str, label: &str) -> Result<String, String> {
    if url.is_empty() {
        return Ok(String::new());
    }
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("no se pudo descargar la fuente de {label}: {e}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "la fuente de {label} respondio {}",
            response.status()
        ));
    }
    response
        .text()
        .await
        .map_err(|e| format!("no se pudo leer la fuente de {label}: {e}"))
}

/// Extrae los medicamentos reconocidos del texto libre de la receta, para
/// prellenar la verificacion de seguridad sin reescribir la lista.
#[tauri::command]
fn extract_prescription_medications(
    state: tauri::State<'_, AppDb>,
    prescription: String,
) -> Result<Vec<String>, String> {
    let guard = state.0.lock().unwrap();
    let conn = guard.as_ref().ok_or("la base esta bloqueada")?;
    medication::extract_medications(conn, &prescription).map_err(|e| e.to_string())
}

/// Detecta el hardware del equipo y sugiere el tamano de modelo Whisper local
/// para transcripcion. No requiere la base (no toca datos clinicos): solo lee
/// RAM y nucleos de CPU. Se usa al configurar la transcripcion para que el
/// medico no tenga que entender de tamanos de modelo.
#[tauri::command]
fn transcription_recommendation() -> transcription::TranscriptionRecommendation {
    transcription::recommendation()
}

/* ---------- Descarga del modelo Whisper local (paso 15) ---------- */

/// Espacio libre (bytes) en el volumen que contiene `path`. Best-effort: ante
/// cualquier duda devuelve `None` (no se bloquea la descarga por no poder medir).
fn available_disk_bytes(path: &Path) -> Option<u64> {
    use sysinfo::Disks;
    let disks = Disks::new_with_refreshed_list();
    // El disco cuyo punto de montaje sea el prefijo mas largo de `path`.
    disks
        .iter()
        .filter(|disk| path.starts_with(disk.mount_point()))
        .max_by_key(|disk| disk.mount_point().as_os_str().len())
        .map(|disk| disk.available_space())
}

/// Construye el estado de una lista de assets descargables (Whisper o diarizacion)
/// a partir de lo observado en disco y del progreso de descarga en curso. Comun a
/// ambos catalogos: la unica diferencia entre transcripcion y diarizacion es que
/// assets se le pasan.
fn collect_model_status(
    base_dir: &Path,
    progress: &HashMap<String, DownloadProgress>,
    assets: Vec<transcription_model::ModelAsset>,
) -> Vec<transcription_model::ModelStatus> {
    let mut out = Vec::new();
    for asset in assets {
        let final_path = transcription_model::model_path(base_dir, &asset.file_name);
        let part = transcription_model::part_path(&final_path);
        let final_exists = final_path.exists();
        let final_len = fs::metadata(&final_path).map(|m| m.len()).unwrap_or(0);
        let final_size_ok =
            transcription_model::is_complete_model_size(final_len, asset.size_bytes);
        let final_present = final_exists && final_size_ok;
        let part_len = fs::metadata(&part).map(|m| m.len()).unwrap_or(0);

        let prog = progress.get(&asset.model_id);
        let downloading = prog.map(|p| !p.done && p.error.is_none()).unwrap_or(false);
        let error = prog.and_then(|p| p.error.clone());
        // Un archivo presente con checksum fijado que coincide se considera
        // verificado. Sin checksum fijado en el build, queda como no verificado.
        let verified = final_present
            && transcription_model::should_verify_file(&asset.sha256)
            && transcription_model::verify_file(&final_path, &asset.sha256).unwrap_or(false);
        // Si hay descarga en curso, el progreso manda sobre el tamano del .part.
        let part_for_status = prog
            .filter(|p| !p.done)
            .map(|p| p.downloaded)
            .unwrap_or(part_len);

        let mut status = transcription_model::build_status(
            &asset,
            final_present,
            final_len,
            part_for_status,
            verified,
            downloading,
            error.or_else(|| {
                if final_exists && !final_size_ok {
                    Some(format!(
                        "archivo de modelo incompleto o corrupto: {} bytes, esperado {}",
                        final_len, asset.size_bytes
                    ))
                } else {
                    None
                }
            }),
        );
        // Durante la descarga, el total informado por el servidor (si lo hay) es
        // mas fiel que el tamano aproximado del catalogo.
        if let Some(p) = prog.filter(|p| !p.done && p.total > 0) {
            status.expected_size_bytes = p.total;
        }
        out.push(status);
    }
    out
}

/// Estado de los modelos Whisper: presencia en disco, verificacion y progreso de
/// descarga en curso. El frontend lo sondea para pintar el avance.
#[tauri::command]
fn transcription_model_status(
    app: tauri::AppHandle,
    downloads: tauri::State<'_, ModelDownloads>,
) -> Result<Vec<transcription_model::ModelStatus>, String> {
    let base_dir = app_data_dir(&app)?;
    let progress = downloads.0.lock().unwrap().clone();
    Ok(collect_model_status(
        &base_dir,
        &progress,
        transcription_model::all_assets(),
    ))
}

/// Estado de los modelos de diarizacion (segmentacion + embedding). Mismo contrato
/// que `transcription_model_status`; el frontend lo sondea igual. Comparte el mapa
/// de progreso de descargas (las claves no colisionan: ids distintos).
#[tauri::command]
fn diarization_model_status(
    app: tauri::AppHandle,
    downloads: tauri::State<'_, ModelDownloads>,
) -> Result<Vec<transcription_model::ModelStatus>, String> {
    let base_dir = app_data_dir(&app)?;
    let progress = downloads.0.lock().unwrap().clone();
    Ok(collect_model_status(
        &base_dir,
        &progress,
        diarization_model::all_assets(),
    ))
}

/// Descarga (o reanuda) los pesos del modelo Whisper indicado a la carpeta
/// compartida de modelos. Frontera de red: el contrato real con la fuente se
/// verifica en staging (regla 5). No toca la base cifrada ni envia datos del
/// paciente; solo baja REFERENCIA publica. Actualiza el progreso en memoria para
/// que el frontend lo sondee, y al terminar verifica el checksum (si esta fijado).
#[tauri::command]
async fn download_transcription_model(
    app: tauri::AppHandle,
    downloads: tauri::State<'_, ModelDownloads>,
    model_id: String,
) -> Result<(), String> {
    let asset = transcription_model::asset_for(&model_id)
        .ok_or_else(|| format!("modelo no reconocido: {model_id}"))?;
    run_model_download(&app, downloads, &model_id, &asset).await
}

/// Descarga (o reanuda) un modelo de diarizacion (segmentacion o embedding) a la
/// carpeta compartida de modelos. Misma frontera de red y garantias que la descarga
/// de Whisper: REFERENCIA publica, sin datos del paciente, checksum si esta fijado.
#[tauri::command]
async fn download_diarization_model(
    app: tauri::AppHandle,
    downloads: tauri::State<'_, ModelDownloads>,
    model_id: String,
) -> Result<(), String> {
    let asset = diarization_model::asset_for(&model_id)
        .ok_or_else(|| format!("modelo no reconocido: {model_id}"))?;
    run_model_download(&app, downloads, &model_id, &asset).await
}

/// Orquesta la descarga de cualquier asset (Whisper o diarizacion): reclama el slot
/// bajo el mutex, valida espacio, reanuda el `.part`, informa progreso, verifica el
/// checksum (si esta fijado) y renombra al archivo final. Comun a ambos catalogos.
async fn run_model_download(
    app: &tauri::AppHandle,
    downloads: tauri::State<'_, ModelDownloads>,
    model_id: &str,
    asset: &transcription_model::ModelAsset,
) -> Result<(), String> {
    let base_dir = app_data_dir(app)?;
    let dir = transcription_model::models_dir(&base_dir);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let final_path = transcription_model::model_path(&base_dir, &asset.file_name);
    if final_path.exists() {
        let len = fs::metadata(&final_path).map(|m| m.len()).unwrap_or(0);
        if transcription_model::is_complete_model_size(len, asset.size_bytes) {
            return Ok(());
        }
        fs::remove_file(&final_path).map_err(|e| e.to_string())?;
    }

    // Reclama el slot de descarga bajo el mutex para impedir descargas
    // concurrentes del mismo modelo: dos clics escribirian el mismo `.part` y se
    // corromperian entre si (el porcentaje retrocede, el archivo final queda en
    // 0 bytes al renombrar una mientras la otra sigue escribiendo). Si ya hay una
    // en curso, no se inicia otra.
    {
        let mut map = downloads.0.lock().unwrap();
        if let Some(p) = map.get(model_id) {
            if !p.done && p.error.is_none() {
                return Ok(());
            }
        }
        map.insert(
            model_id.to_string(),
            DownloadProgress {
                downloaded: 0,
                total: asset.size_bytes,
                done: false,
                error: None,
            },
        );
    }

    let part = transcription_model::part_path(&final_path);
    let part_len = fs::metadata(&part).map(|m| m.len()).unwrap_or(0);

    // Valida espacio en disco (best-effort): si se puede medir y no alcanza, no
    // se inicia la descarga.
    if let Some(free) = available_disk_bytes(&dir) {
        let required = transcription_model::required_free_bytes(asset.size_bytes);
        if !transcription_model::has_enough_disk(free, required) {
            let msg = format!(
                "espacio insuficiente: se necesitan ~{} MB libres para {}",
                required / (1024 * 1024),
                asset.file_name
            );
            // Libera el slot reclamado para que la UI deje de mostrar "descargando".
            downloads.0.lock().unwrap().insert(
                model_id.to_string(),
                DownloadProgress {
                    downloaded: 0,
                    total: asset.size_bytes,
                    done: true,
                    error: Some(msg.clone()),
                },
            );
            return Err(msg);
        }
    }

    let set_progress = |downloaded: u64, total: u64, done: bool, error: Option<String>| {
        let mut map = downloads.0.lock().unwrap();
        map.insert(
            model_id.to_string(),
            DownloadProgress {
                downloaded,
                total,
                done,
                error,
            },
        );
    };

    let resume = transcription_model::resume_from(part_len, asset.size_bytes);
    set_progress(resume, asset.size_bytes, false, None);

    match stream_to_part(asset, &part, resume, &set_progress).await {
        Ok(total) => {
            let downloaded_len = fs::metadata(&part).map(|m| m.len()).unwrap_or(0);
            if !transcription_model::is_complete_model_size(downloaded_len, asset.size_bytes) {
                let _ = fs::remove_file(&part);
                let msg = format!(
                    "la descarga quedo incompleta o corrupta: {} bytes, esperado {}",
                    downloaded_len, asset.size_bytes
                );
                set_progress(0, asset.size_bytes, true, Some(msg.clone()));
                return Err(msg);
            }
            // Verifica el checksum si esta fijado; si no coincide, descarta.
            if transcription_model::should_verify_file(&asset.sha256)
                && !transcription_model::verify_file(&part, &asset.sha256).unwrap_or(false)
            {
                let _ = fs::remove_file(&part);
                let msg = "la descarga no coincide con el checksum esperado".to_string();
                set_progress(0, asset.size_bytes, true, Some(msg.clone()));
                return Err(msg);
            }
            fs::rename(&part, &final_path).map_err(|e| e.to_string())?;
            set_progress(total, total, true, None);
            Ok(())
        }
        Err(e) => {
            set_progress(part_len, asset.size_bytes, true, Some(e.clone()));
            Err(e)
        }
    }
}

/// Descarga por HTTP el asset al archivo `.part`, reanudando desde `resume` con un
/// Range. Va informando el progreso. Devuelve el total de bytes al terminar.
async fn stream_to_part(
    asset: &transcription_model::ModelAsset,
    part: &Path,
    resume: u64,
    set_progress: &impl Fn(u64, u64, bool, Option<String>),
) -> Result<u64, String> {
    let client = reqwest::Client::new();
    let mut request = client.get(&asset.url);
    if resume > 0 {
        request = request.header(reqwest::header::RANGE, format!("bytes={resume}-"));
    }
    let mut response = request
        .send()
        .await
        .map_err(|e| format!("no se pudo iniciar la descarga: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("la fuente respondio {}", response.status()));
    }
    let effective_resume =
        transcription_model::resume_offset_for_http_status(resume, response.status().as_u16())?;

    // Total = lo ya descargado + lo que falta segun el servidor (si lo informa).
    let total = response
        .content_length()
        .map(|r| effective_resume + r)
        .filter(|t| *t > 0)
        .unwrap_or(asset.size_bytes);

    let mut file = if effective_resume > 0 {
        fs::OpenOptions::new()
            .append(true)
            .open(part)
            .map_err(|e| e.to_string())?
    } else {
        fs::File::create(part).map_err(|e| e.to_string())?
    };

    let mut downloaded = effective_resume;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|e| format!("descarga interrumpida: {e}"))?
    {
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;
        set_progress(downloaded, total.max(downloaded), false, None);
    }
    file.flush().map_err(|e| e.to_string())?;
    Ok(downloaded)
}

/* ---------- Derechos ARCO (paso 12) ---------- */

fn with_arco<T>(
    state: &tauri::State<'_, AppDb>,
    f: impl FnOnce(&rusqlite::Connection) -> Result<T, arco::ArcoError>,
) -> Result<T, String> {
    let guard = state.0.lock().unwrap();
    let conn = guard.as_ref().ok_or("la base esta bloqueada")?;
    f(conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn arco_list_requests(state: tauri::State<'_, AppDb>) -> Result<Vec<arco::ArcoRequest>, String> {
    with_arco(&state, arco::list_arco_requests)
}

#[tauri::command]
fn arco_record_request(
    state: tauri::State<'_, AppDb>,
    patient_id: String,
    request_type: String,
    notes: Option<String>,
) -> Result<arco::ArcoRequest, String> {
    with_arco(&state, |conn| {
        arco::record_arco_request(conn, &patient_id, &request_type, notes.as_deref())
    })
}

#[tauri::command]
fn arco_mark_fulfilled(
    state: tauri::State<'_, AppDb>,
    request_id: String,
    result_summary: String,
) -> Result<arco::ArcoRequest, String> {
    with_arco(&state, |conn| {
        arco::mark_fulfilled(conn, &request_id, &result_summary)
    })
}

#[tauri::command]
fn arco_export_patient_data(
    state: tauri::State<'_, AppDb>,
    patient_id: String,
) -> Result<arco::PatientDataExport, String> {
    with_arco(&state, |conn| arco::export_patient_data(conn, &patient_id))
}

#[tauri::command]
fn arco_fulfill_cancellation(
    state: tauri::State<'_, AppDb>,
    request_id: String,
) -> Result<arco::CancellationResult, String> {
    let mut guard = state.0.lock().unwrap();
    let conn = guard.as_mut().ok_or("la base esta bloqueada")?;
    arco::fulfill_cancellation(conn, &request_id).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Carga `src-tauri/.env` (si existe) antes de cualquier lectura de env vars
    // como `MIDOC_GEMINI_API_KEY`. `.ok()` ignora el error cuando el archivo no
    // existe (build de distribucion, CI, o quien prefiera exportarla a mano).
    dotenvy::dotenv().ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppDb(Mutex::new(None)))
        .manage(ModelDownloads(Mutex::new(HashMap::new())))
        .invoke_handler(tauri::generate_handler![
            list_doctor_profiles,
            create_doctor_profile,
            unlock_database,
            lock_database,
            sync_status,
            link_account,
            unlink_device,
            sync_now,
            sync_pending,
            publish_authorized_summary,
            list_appointments,
            open_encounter,
            attend_appointment,
            resolve_appointment_patient,
            get_encounter,
            list_patients,
            get_patient_profile,
            find_patient_matches,
            create_patient,
            open_patient_encounter,
            list_timeline_events,
            add_timeline_event,
            update_timeline_event,
            delete_timeline_event,
            save_note,
            save_prescription,
            update_patient_background,
            get_patient_medical_history,
            save_patient_medical_history,
            sign_encounter,
            verify_signature,
            list_resources,
            create_resource,
            set_resource_active,
            list_active_visits,
            check_in_appointment,
            register_walk_in,
            set_visit_state,
            assign_resource,
            start_visit_encounter,
            get_open_cash_session,
            open_cash_session,
            close_cash_session,
            cash_summary,
            register_payment,
            list_session_payments,
            ai_consent_status,
            ai_grant_consent,
            ai_revoke_consent,
            ai_voice_consent_status,
            ai_grant_voice_consent,
            ai_revoke_voice_consent,
            ai_scribe_consent_status,
            ai_grant_scribe_consent,
            ai_revoke_scribe_consent,
            ai_assist_soap,
            ai_assist_text,
            ai_transcribe_audio,
            ai_save_reviewed_transcription,
            ai_latest_reviewed_transcription,
            ai_discard_reviewed_transcription,
            ai_diarize_consultation,
            ai_structure_consultation,
            ai_generate_clinical_aid,
            list_consultation_templates,
            save_consultation_template,
            delete_consultation_template,
            ai_review_run,
            ai_list_runs,
            ai_usage_summary,
            ai_set_budget,
            ai_run_benchmark,
            ai_list_benchmarks,
            transcription_recommendation,
            transcription_model_status,
            download_transcription_model,
            diarization_model_status,
            download_diarization_model,
            check_medication_safety,
            medication_reference_status,
            import_medication_reference,
            update_medication_reference,
            update_medication_reference_from_midoc,
            extract_prescription_medications,
            arco_list_requests,
            arco_record_request,
            arco_mark_fulfilled,
            arco_export_patient_data,
            arco_fulfill_cancellation
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;
    use std::path::Path;

    #[test]
    fn profile_database_path_separates_doctors() {
        let base = Path::new("C:/MiDocData");

        assert_eq!(profile_database_path(base, "default").unwrap(), base.join("midoc.db"));
        assert_eq!(
            profile_database_path(base, "dr-ana").unwrap(),
            base.join("profiles").join("dr-ana").join("midoc.db")
        );
        assert_ne!(
            profile_database_path(base, "dr-ana").unwrap(),
            profile_database_path(base, "dr-luis").unwrap()
        );
    }

    #[test]
    fn new_databases_require_twelve_char_passphrase() {
        assert!(validate_passphrase("corta", true).is_err());
        assert!(validate_passphrase("ochochars", true).is_err());
        assert!(validate_passphrase("doce-caracteres!", true).is_ok());
        // Cuenta caracteres, no bytes: passphrases con acentos no se penalizan.
        assert!(validate_passphrase("ñañañañañaña", true).is_ok());
    }

    #[test]
    fn existing_databases_keep_accepting_legacy_minimum() {
        assert!(validate_passphrase("ochochars", false).is_ok());
        assert!(validate_passphrase("corta", false).is_err());
    }

    #[test]
    fn profile_ids_reject_path_traversal() {
        assert!(validate_profile_id("dr-ana").is_ok());
        assert!(validate_profile_id("default").is_ok());
        assert!(validate_profile_id("../otro").is_err());
        assert!(validate_profile_id("dr/ana").is_err());
        assert!(validate_profile_id("").is_err());
    }

    #[test]
    fn agenda_returns_one_appointment_when_two_precheckin_kinds_exist() {
        let path = std::env::temp_dir().join(format!(
            "midoc-agenda-precheckin-{}-{}.db",
            std::process::id(),
            uuid::Uuid::new_v4()
        ));
        let conn = db::open_encrypted(&path, "clave-de-prueba").unwrap();

        conn.execute(
            "INSERT INTO appointments (
                id, status, scheduled_start, scheduled_end, service_name,
                patient_first_name, patient_last_name, updated_at
             ) VALUES (?1, 'CONFIRMED', ?2, ?3, 'Consulta general', 'Sebastian', 'Palos', ?4)",
            params![
                "appt-with-two-precheckins",
                "2026-06-19T16:30:00Z",
                "2026-06-19T17:00:00Z",
                "2026-06-19T15:00:00Z"
            ],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO precheckins (appointment_id, responses_json, kind, received_at)
             VALUES (?1, '{}', 'medical-history', ?2)",
            params!["appt-with-two-precheckins", "2026-06-19T15:01:00Z"],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO precheckins (appointment_id, responses_json, kind, received_at)
             VALUES (?1, '{}', 'ai-preconsulta', ?2)",
            params!["appt-with-two-precheckins", "2026-06-19T15:02:00Z"],
        )
        .unwrap();

        let appointments = load_appointments(&conn).unwrap();

        assert_eq!(appointments.len(), 1);
        assert_eq!(appointments[0].id, "appt-with-two-precheckins");
        assert!(appointments[0].has_precheckin);

        drop(conn);
        let _ = std::fs::remove_file(path);
    }
}
