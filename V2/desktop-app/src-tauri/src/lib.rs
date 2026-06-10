mod clinical;
mod db;
mod sync;

use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

/// Open database connection, held for the lifetime of the unlocked session.
struct AppDb(Mutex<Option<rusqlite::Connection>>);

#[derive(serde::Serialize)]
struct UnlockResult {
    schema_version: i64,
    db_path: String,
}

#[derive(serde::Serialize)]
struct SyncStatus {
    linked: bool,
    server_url: Option<String>,
    cursor: i64,
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
    *state.0.lock().unwrap() = Some(conn);
    Ok(UnlockResult {
        schema_version,
        db_path: path.display().to_string(),
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

    Ok(SyncStatus {
        linked,
        server_url,
        cursor,
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
    let token = sync::link_account(&server_url, &email, &password, &device_name)
        .await
        .map_err(|e| e.to_string())?;

    let guard = state.0.lock().unwrap();
    let conn = guard.as_ref().ok_or("la base esta bloqueada")?;
    sync::set_state(conn, "server_url", server_url.trim_end_matches('/'))
        .map_err(|e| e.to_string())?;
    sync::set_state(conn, "device_token", &token).map_err(|e| e.to_string())?;
    sync::set_state(conn, "cursor", "0").map_err(|e| e.to_string())?;
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

        {
            let mut guard = state.0.lock().unwrap();
            let conn = guard.as_mut().ok_or("la base esta bloqueada")?;
            sync::apply_batch(conn, &inbox.events).map_err(|e| e.to_string())?;
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
            list_appointments,
            open_encounter,
            get_encounter,
            save_note,
            save_prescription,
            update_patient_background,
            sign_encounter,
            verify_signature
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
