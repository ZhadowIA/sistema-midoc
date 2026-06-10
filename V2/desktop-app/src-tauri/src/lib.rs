mod db;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppDb(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![unlock_database, lock_database])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
