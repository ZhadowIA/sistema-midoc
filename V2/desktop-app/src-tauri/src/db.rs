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
    // v3: atencion clinica integrada (paso 4). Todo CLINICO: expediente,
    // encuentros, notas SOAP versionadas, recetas y auditoria local.
    // Nada de esto sale jamas de la base cifrada (regla de residencia 1).
    "CREATE TABLE patients (
        id TEXT PRIMARY KEY NOT NULL,
        first_name TEXT NOT NULL DEFAULT '',
        last_name TEXT NOT NULL DEFAULT '',
        phone TEXT,
        email TEXT,
        birth_date TEXT,
        sex TEXT,
        allergies TEXT,
        medical_background TEXT,
        family_background TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    INSERT INTO patients (id, first_name, last_name, phone, email, created_at, updated_at)
        SELECT patient_id, patient_first_name, patient_last_name,
               patient_phone, patient_email, updated_at, updated_at
        FROM appointments
        WHERE patient_id IS NOT NULL
        GROUP BY patient_id;
    CREATE TABLE encounters (
        id TEXT PRIMARY KEY NOT NULL,
        appointment_id TEXT,
        patient_id TEXT NOT NULL REFERENCES patients (id),
        status TEXT NOT NULL DEFAULT 'OPEN',
        opened_at TEXT NOT NULL,
        signed_at TEXT,
        signed_hash TEXT
    );
    CREATE INDEX idx_encounters_patient ON encounters (patient_id);
    CREATE UNIQUE INDEX idx_encounters_appointment
        ON encounters (appointment_id) WHERE appointment_id IS NOT NULL;
    CREATE TABLE note_versions (
        encounter_id TEXT NOT NULL REFERENCES encounters (id),
        version INTEGER NOT NULL,
        subjective TEXT NOT NULL DEFAULT '',
        objective TEXT NOT NULL DEFAULT '',
        assessment TEXT NOT NULL DEFAULT '',
        plan TEXT NOT NULL DEFAULT '',
        diagnosis TEXT NOT NULL DEFAULT '',
        instructions TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        PRIMARY KEY (encounter_id, version)
    );
    CREATE TABLE prescriptions (
        id TEXT PRIMARY KEY NOT NULL,
        encounter_id TEXT NOT NULL REFERENCES encounters (id),
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    CREATE TABLE clinical_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        at TEXT NOT NULL,
        details TEXT
    );",
    // v4: plantilla de especialidad (paso 5). Blob JSON opaco para Rust;
    // la estructura (medicina general/familiar, luego odontologia) vive en
    // el frontend. Se versiona y firma junto con la nota. Clase: CLINICO.
    "ALTER TABLE note_versions ADD COLUMN specialty_payload TEXT NOT NULL DEFAULT '{}';",
    // v5: documentos del buzon (paso 6, Fase B). Llegan cifrados de la nube,
    // se descifran con la llave del medico y se guardan aqui en claro. El id
    // es el del MailboxDocument en el portal (idempotencia ante re-entrega).
    // Clase: CLINICO (vive solo en este equipo).
    "CREATE TABLE documents (
        id TEXT PRIMARY KEY NOT NULL,
        patient_id TEXT,
        appointment_id TEXT,
        file_name TEXT NOT NULL DEFAULT '',
        mime_type TEXT NOT NULL DEFAULT '',
        category TEXT,
        content BLOB NOT NULL,
        size_bytes INTEGER NOT NULL,
        received_at TEXT NOT NULL
    );
    CREATE INDEX idx_documents_patient ON documents (patient_id);",
    // v6: operacion presencial (paso 10). Recepcion, lista de espera, consulta
    // sin cita, estados operativos, recursos fisicos, caja diaria, cobros,
    // recibos y anticipos. Clase: OPERATIVO — vive solo en este equipo y nunca
    // viaja a la nube. El dinero se guarda en centavos (enteros) para evitar
    // aritmetica de punto flotante.
    "CREATE TABLE resources (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'ROOM',
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
    );
    -- Visita operativa: unifica la llegada de una cita agendada y la consulta
    -- sin cita (walk-in). appointment_id NULL = sin cita. encounter_id enlaza
    -- con el expediente clinico cuando inicia la consulta.
    CREATE TABLE visits (
        id TEXT PRIMARY KEY NOT NULL,
        appointment_id TEXT,
        patient_id TEXT,
        patient_name TEXT NOT NULL DEFAULT '',
        patient_phone TEXT,
        reason TEXT,
        service_name TEXT,
        state TEXT NOT NULL DEFAULT 'WAITING',
        priority INTEGER NOT NULL DEFAULT 0,
        resource_id TEXT REFERENCES resources (id),
        encounter_id TEXT,
        arrived_at TEXT NOT NULL,
        started_at TEXT,
        ended_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX idx_visits_state ON visits (state);
    CREATE INDEX idx_visits_arrived ON visits (arrived_at);
    CREATE UNIQUE INDEX idx_visits_appointment
        ON visits (appointment_id) WHERE appointment_id IS NOT NULL;
    -- Caja diaria: una sesion abierta a la vez (indice unico parcial).
    CREATE TABLE cash_sessions (
        id TEXT PRIMARY KEY NOT NULL,
        opened_at TEXT NOT NULL,
        opening_float_cents INTEGER NOT NULL DEFAULT 0,
        closed_at TEXT,
        closing_counted_cents INTEGER,
        notes TEXT
    );
    CREATE UNIQUE INDEX idx_cash_sessions_open
        ON cash_sessions (closed_at) WHERE closed_at IS NULL;
    -- Cobros, anticipos (DEPOSIT) y reembolsos (REFUND). Cada cobro pertenece a
    -- la sesion de caja abierta y lleva un folio de recibo monotono.
    CREATE TABLE payments (
        id TEXT PRIMARY KEY NOT NULL,
        cash_session_id TEXT NOT NULL REFERENCES cash_sessions (id),
        visit_id TEXT REFERENCES visits (id),
        appointment_id TEXT,
        patient_id TEXT,
        amount_cents INTEGER NOT NULL,
        method TEXT NOT NULL DEFAULT 'CASH',
        kind TEXT NOT NULL DEFAULT 'PAYMENT',
        concept TEXT,
        receipt_number TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    CREATE INDEX idx_payments_session ON payments (cash_session_id);
    CREATE UNIQUE INDEX idx_payments_receipt ON payments (receipt_number);",
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

/// Creates a consistent encrypted backup of the currently unlocked database.
///
/// SQLCipher applies the active connection key to the `VACUUM INTO` output, so
/// the backup remains unreadable without the same passphrase. The caller should
/// still store the file outside sync folders unless the doctor explicitly chose
/// that destination.
pub fn create_encrypted_backup(conn: &Connection, backup_path: &Path) -> Result<(), DbError> {
    if let Some(parent) = backup_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    if backup_path.exists() {
        std::fs::remove_file(backup_path)?;
    }

    let path = backup_path.to_string_lossy().to_string();
    conn.execute("VACUUM INTO ?1", [&path])?;
    Ok(())
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

    #[test]
    fn backup_is_encrypted_and_restorable_with_correct_key() {
        let path = temp_db_path("backup-source");
        let backup = temp_db_path("backup-copy");
        let _ = std::fs::remove_file(&backup);

        let conn = open_encrypted(&path, "clave-correcta").unwrap();
        conn.execute(
            "INSERT INTO app_meta (key, value) VALUES ('backup_probe', 'valor-clinico-local')",
            [],
        )
        .unwrap();

        create_encrypted_backup(&conn, &backup).unwrap();

        let restored = open_encrypted(&backup, "clave-correcta").unwrap();
        let value: String = restored
            .query_row("SELECT value FROM app_meta WHERE key = 'backup_probe'", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(value, "valor-clinico-local");

        let mut header = [0u8; 16];
        std::fs::File::open(&backup)
            .unwrap()
            .read_exact(&mut header)
            .unwrap();
        assert_ne!(&header, b"SQLite format 3\0");
    }

    #[test]
    fn backup_rejects_wrong_restore_key() {
        let path = temp_db_path("backup-wrong-source");
        let backup = temp_db_path("backup-wrong-copy");
        let _ = std::fs::remove_file(&backup);

        let conn = open_encrypted(&path, "clave-correcta").unwrap();
        create_encrypted_backup(&conn, &backup).unwrap();

        let err = open_encrypted(&backup, "clave-incorrecta").unwrap_err();
        assert!(matches!(err, DbError::InvalidKey), "got: {err:?}");
    }
}
