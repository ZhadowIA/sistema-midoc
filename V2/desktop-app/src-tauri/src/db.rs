//! Encrypted local database (SQLCipher).
//!
//! All clinical data in MiDoc V2 lives in this database, on the doctor's
//! machine. The passphrase is handed to SQLCipher's PRAGMA key, which runs
//! its own PBKDF2-HMAC-SHA512 derivation with a per-database salt; we never
//! store the passphrase or a derived key on disk.

use rusqlite::Connection;
use std::path::Path;

#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error("la llave de cifrado es incorrecta o el archivo no es una base MiDoc")]
    InvalidKey,
    #[error("error de base de datos: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("error de E/S: {0}")]
    Io(#[from] std::io::Error),
}

/// Schema migrations, applied in order via `PRAGMA user_version`.
/// Forward-compatible only (REGLAS_DESARROLLO.md §6): each entry runs inside
/// a transaction and must never break an existing database.
const MIGRATIONS: &[&str] = &[
    // v1: bootstrap. Data-residency class: OPERATIVO.
    "CREATE TABLE app_meta (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
    );
    INSERT INTO app_meta (key, value) VALUES ('created_with_schema', '1');",
    // v2: sincronizacion fase A (13_contrato_sincronizacion.md).
    // sync_state: OPERATIVO (token de dispositivo, cursor, servidor).
    // appointments: CONTACTO/OPERATIVO (datos de cita y contacto, no clinicos).
    // precheckins: CLINICO (vive solo aqui; la nube lo purga tras el ACK).
    "CREATE TABLE sync_state (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
    );
    CREATE TABLE appointments (
        id TEXT PRIMARY KEY NOT NULL,
        status TEXT NOT NULL,
        scheduled_start TEXT NOT NULL,
        scheduled_end TEXT NOT NULL,
        service_name TEXT,
        reason TEXT,
        patient_id TEXT,
        patient_first_name TEXT NOT NULL DEFAULT '',
        patient_last_name TEXT NOT NULL DEFAULT '',
        patient_phone TEXT,
        patient_email TEXT,
        cancellation_reason TEXT,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX idx_appointments_start ON appointments (scheduled_start);
    CREATE TABLE precheckins (
        appointment_id TEXT PRIMARY KEY NOT NULL,
        responses_json TEXT NOT NULL,
        received_at TEXT NOT NULL
    );",
];

/// Opens (creating if needed) the encrypted database and applies pending
/// migrations. Fails with `DbError::InvalidKey` when the passphrase does not
/// match an existing database.
pub fn open_encrypted(path: &Path, passphrase: &str) -> Result<Connection, DbError> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "key", passphrase)?;

    // First read against an encrypted database is the moment a wrong key
    // surfaces, as a NotADatabase error.
    let check = conn.query_row("SELECT count(*) FROM sqlite_master", [], |r| {
        r.get::<_, i64>(0)
    });
    if let Err(err) = check {
        return match err.sqlite_error_code() {
            Some(rusqlite::ErrorCode::NotADatabase) => Err(DbError::InvalidKey),
            _ => Err(DbError::Sqlite(err)),
        };
    }

    conn.pragma_update(None, "foreign_keys", "ON")?;
    apply_migrations(&conn)?;
    Ok(conn)
}

pub fn schema_version(conn: &Connection) -> Result<i64, DbError> {
    Ok(conn.query_row("PRAGMA user_version", [], |r| r.get(0))?)
}

fn apply_migrations(conn: &Connection) -> Result<(), DbError> {
    let current = schema_version(conn)?;
    for (idx, sql) in MIGRATIONS.iter().enumerate() {
        let target = (idx + 1) as i64;
        if current < target {
            conn.execute_batch(&format!(
                "BEGIN; {sql}; PRAGMA user_version = {target}; COMMIT;"
            ))?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    fn temp_db_path(name: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join("midoc-db-tests");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(format!("{name}-{}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        path
    }

    #[test]
    fn creates_encrypted_db_and_reads_back() {
        let path = temp_db_path("create");
        let conn = open_encrypted(&path, "clave-correcta").unwrap();
        conn.execute(
            "INSERT INTO app_meta (key, value) VALUES ('probe', 'hola')",
            [],
        )
        .unwrap();
        let value: String = conn
            .query_row("SELECT value FROM app_meta WHERE key = 'probe'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(value, "hola");
    }

    #[test]
    fn reopens_with_correct_key() {
        let path = temp_db_path("reopen");
        drop(open_encrypted(&path, "clave-correcta").unwrap());
        let conn = open_encrypted(&path, "clave-correcta").unwrap();
        assert_eq!(schema_version(&conn).unwrap(), MIGRATIONS.len() as i64);
    }

    #[test]
    fn rejects_wrong_key() {
        let path = temp_db_path("wrong-key");
        drop(open_encrypted(&path, "clave-correcta").unwrap());
        let err = open_encrypted(&path, "clave-incorrecta").unwrap_err();
        assert!(matches!(err, DbError::InvalidKey), "got: {err:?}");
    }

    #[test]
    fn migrations_are_idempotent() {
        let path = temp_db_path("idempotent");
        drop(open_encrypted(&path, "k").unwrap());
        let conn = open_encrypted(&path, "k").unwrap();
        assert_eq!(schema_version(&conn).unwrap(), MIGRATIONS.len() as i64);
    }

    #[test]
    fn file_on_disk_is_not_plaintext_sqlite() {
        let path = temp_db_path("ciphertext");
        drop(open_encrypted(&path, "clave-correcta").unwrap());
        let mut header = [0u8; 16];
        std::fs::File::open(&path)
            .unwrap()
            .read_exact(&mut header)
            .unwrap();
        assert_ne!(
            &header, b"SQLite format 3\0",
            "el archivo en disco no debe ser SQLite en claro"
        );
    }
}
