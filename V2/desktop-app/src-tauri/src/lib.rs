mod ai;
mod arco;
mod clinical;
mod crypto;
mod db;
mod medication;
mod operations;
mod sync;
mod transcription;

#[cfg(test)]
mod consultation_e2e;

#[cfg(test)]
mod restore_drill;

use std::path::PathBuf;
use std::sync::Mutex;

use base64::Engine;
use tauri::Manager;

/// Open database connection, held for the lifetime of the unlocked session.
struct AppDb(Mutex<Option<rusqlite::Connection>>);

#[derive(serde::Serialize)]
struct UnlockResult {
    schema_version: i64,
    db_path: String,
    backup_path: String,
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

fn database_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("midoc.db"))
}

fn backup_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let stamp = chrono::Utc::now().format("%Y%m%dT%H%M%SZ");
    Ok(dir.join("backups").join(format!("midoc-{stamp}.db")))
}

/// Opens (or creates) the encrypted clinical database with the doctor's
/// passphrase. The passphrase only lives in memory for the duration of the
/// call; SQLCipher keeps the derived key inside the connection.
#[tauri::command]
fn unlock_database(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppDb>,
    passphrase: String,
) -> Result<UnlockResult, String> {
    if passphrase.len() < 8 {
        return Err("la frase de seguridad debe tener al menos 8 caracteres".into());
    }
    let path = database_path(&app)?;
    let conn = db::open_encrypted(&path, &passphrase).map_err(|e| e.to_string())?;
    let schema_version = db::schema_version(&conn).map_err(|e| e.to_string())?;
    // Primer arranque: instala el catalogo real de medicamentos empaquetado si la
    // base sigue en la version sembrada. No debe bloquear el acceso al expediente,
    // por eso se ignora un eventual fallo (la base sembrada sigue siendo usable).
    let _ = medication::ensure_bundled_reference_installed(&conn);
    let backup_path = backup_path(&app)?;
    db::create_encrypted_backup(&conn, &backup_path).map_err(|e| e.to_string())?;
    *state.0.lock().unwrap() = Some(conn);
    Ok(UnlockResult {
        schema_version,
        db_path: path.display().to_string(),
        backup_path: backup_path.display().to_string(),
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

    let mut statement = conn
        .prepare(
            "SELECT a.id, a.status, a.scheduled_start, a.scheduled_end, a.service_name,
                    a.reason, a.patient_first_name, a.patient_last_name, a.patient_phone,
                    (p.appointment_id IS NOT NULL) AS has_precheckin
             FROM appointments a
             LEFT JOIN precheckins p ON p.appointment_id = a.id
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
    Visit { visit: operations::Visit },
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
        return Ok(WalkInOutcome::Visit { visit });
    }

    // El recepcionista confirmo que es alguien nuevo.
    if force_new {
        let visit = operations::register_walk_in(conn, &walk_in).map_err(|e| e.to_string())?;
        return Ok(WalkInOutcome::Visit { visit });
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
        Ok(WalkInOutcome::Visit { visit })
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

#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct AudioTranscriptionPayload {
    file_name: Option<String>,
    media_type: String,
    audio_base64: String,
    duration_seconds: Option<i64>,
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

#[tauri::command]
fn ai_transcribe_audio(
    state: tauri::State<'_, AppDb>,
    encounter_id: String,
    audio: AudioTranscriptionPayload,
) -> Result<ai::TranscriptionDraft, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(audio.audio_base64.as_bytes())
        .map_err(|_| "audio invalido".to_string())?;
    let provider = ai::FakeTranscriptionProvider::new("fake-transcriptor");
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
            &provider,
        )
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
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppDb(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            unlock_database,
            lock_database,
            sync_status,
            link_account,
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
            ai_assist_soap,
            ai_assist_text,
            ai_transcribe_audio,
            ai_review_run,
            ai_list_runs,
            ai_usage_summary,
            ai_set_budget,
            ai_run_benchmark,
            ai_list_benchmarks,
            transcription_recommendation,
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
