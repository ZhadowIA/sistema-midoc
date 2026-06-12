mod ai;
mod clinical;
mod crypto;
mod db;
mod operations;
mod sync;

#[cfg(test)]
mod consultation_e2e;

#[cfg(test)]
mod restore_drill;

use std::path::PathBuf;
use std::sync::Mutex;
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

    Ok(SyncStatus {
        linked,
        server_url,
        cursor,
        clinical_profile,
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
    if let Some(clinical_profile) = link.clinical_profile.as_deref() {
        sync::set_state(conn, "clinical_profile", clinical_profile).map_err(|e| e.to_string())?;
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
        for event in &inbox.events {
            if event.event_type != "DOCUMENT_UPLOADED" {
                continue;
            }
            let Some(payload) = &event.payload else {
                continue; // Evento ya purgado en nube: nada que descargar.
            };
            let Some(doc_id) = payload.get("mailboxDocumentId").and_then(|v| v.as_str()) else {
                continue;
            };
            let ciphertext = sync::fetch_document(&server_url, &token, doc_id)
                .await
                .map_err(|e| e.to_string())?;
            let patient_id = payload.get("patientId").and_then(|v| v.as_str()).map(String::from);
            let appointment_id = payload
                .get("appointmentId")
                .and_then(|v| v.as_str())
                .map(String::from);
            documents.push((doc_id.to_string(), patient_id, appointment_id, ciphertext));
        }

        {
            let mut guard = state.0.lock().unwrap();
            let conn = guard.as_mut().ok_or("la base esta bloqueada")?;
            sync::apply_batch(conn, &inbox.events).map_err(|e| e.to_string())?;
            // Descifrar y guardar los documentos descargados.
            for (doc_id, patient_id, appointment_id, ciphertext) in &documents {
                let plaintext = crypto::unseal_document(conn, ciphertext).map_err(|e| e.to_string())?;
                sync::store_mailbox_document(
                    conn,
                    doc_id,
                    patient_id.as_deref(),
                    appointment_id.as_deref(),
                    &plaintext,
                )
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

    Ok(sync::SyncSummary {
        applied_events: applied,
        cursor,
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
fn save_note(
    state: tauri::State<'_, AppDb>,
    encounter_id: String,
    note: clinical::NoteContent,
) -> Result<i64, String> {
    with_conn(&state, |conn| clinical::save_note(conn, &encounter_id, &note))
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
fn verify_signature(
    state: tauri::State<'_, AppDb>,
    encounter_id: String,
) -> Result<bool, String> {
    with_conn(&state, |conn| clinical::verify_signature(conn, &encounter_id))
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
fn list_resources(
    state: tauri::State<'_, AppDb>,
) -> Result<Vec<operations::Resource>, String> {
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
    with_ops(&state, |conn| operations::set_resource_active(conn, &resource_id, active))
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

#[tauri::command]
fn register_walk_in(
    state: tauri::State<'_, AppDb>,
    walk_in: operations::WalkInInput,
) -> Result<operations::Visit, String> {
    with_ops(&state, |conn| operations::register_walk_in(conn, &walk_in))
}

#[tauri::command]
fn set_visit_state(
    state: tauri::State<'_, AppDb>,
    visit_id: String,
    visit_state: String,
) -> Result<operations::Visit, String> {
    with_ops(&state, |conn| operations::set_visit_state(conn, &visit_id, &visit_state))
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
) -> Result<String, String> {
    let guard = state.0.lock().unwrap();
    let conn = guard.as_ref().ok_or("la base esta bloqueada")?;

    let visit = operations::read_active_visit(conn, &visit_id).map_err(|e| e.to_string())?;
    let encounter = match (&visit.appointment_id, &visit.patient_id) {
        (Some(appointment_id), _) => {
            clinical::open_encounter_for_appointment(conn, appointment_id)
        }
        (None, Some(patient_id)) => clinical::open_encounter_for_patient(conn, patient_id),
        (None, None) => {
            return Err("la visita no tiene paciente asociado".into());
        }
    }
    .map_err(|e| e.to_string())?;

    operations::link_visit_encounter(conn, &visit_id, &encounter.id).map_err(|e| e.to_string())?;
    Ok(encounter.id)
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
    with_ops(&state, |conn| operations::open_cash_session(conn, opening_float_cents))
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
    with_ops(&state, |conn| operations::list_session_payments(conn, &session_id))
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
fn ai_consent_status(
    state: tauri::State<'_, AppDb>,
    patient_id: String,
) -> Result<bool, String> {
    with_ai(&state, |conn| {
        Ok(ai::active_consent(conn, &patient_id, ai::SCOPE_SOAP_ASSIST)?.is_some())
    })
}

#[tauri::command]
fn ai_grant_consent(
    state: tauri::State<'_, AppDb>,
    patient_id: String,
) -> Result<(), String> {
    with_ai(&state, |conn| {
        ai::grant_consent(conn, &patient_id, ai::SCOPE_SOAP_ASSIST).map(|_| ())
    })
}

#[tauri::command]
fn ai_revoke_consent(
    state: tauri::State<'_, AppDb>,
    patient_id: String,
) -> Result<(), String> {
    with_ai(&state, |conn| {
        ai::revoke_consent(conn, &patient_id, ai::SCOPE_SOAP_ASSIST)
    })
}

#[tauri::command]
fn ai_assist_soap(
    state: tauri::State<'_, AppDb>,
    encounter_id: String,
) -> Result<ai::SoapDraft, String> {
    let registry = ai::ProviderRegistry::default_local();
    with_ai(&state, |conn| ai::assist_soap(conn, &encounter_id, &registry))
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
            publish_authorized_summary,
            list_appointments,
            open_encounter,
            get_encounter,
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
            ai_assist_soap,
            ai_review_run,
            ai_list_runs
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
