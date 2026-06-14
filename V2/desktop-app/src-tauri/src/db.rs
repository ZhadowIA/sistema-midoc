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
    // v7: IA clinica gobernada (paso 11). El procesamiento de contenido clinico
    // con IA ocurre AQUI (residencia local): el contenido nunca sale a la nube
    // sin seudonimizacion y consentimiento. Toda salida de IA es BORRADOR hasta
    // que el medico la revisa y aprueba (regla: la IA no reemplaza el criterio
    // medico). Clase: CLINICO (input/output) + OPERATIVO (trazas de costo).
    //
    // ai_consents: consentimiento por paciente y alcance, con expiracion/revoca.
    // ai_runs: traza completa de cada ejecucion — proveedor, modelo, version de
    // prompt, costo, latencia, consentimiento, estado de revision y feedback.
    "CREATE TABLE ai_consents (
        id TEXT PRIMARY KEY NOT NULL,
        patient_id TEXT NOT NULL REFERENCES patients (id),
        scope TEXT NOT NULL,
        granted_at TEXT NOT NULL,
        revoked_at TEXT
    );
    CREATE INDEX idx_ai_consents_patient ON ai_consents (patient_id, scope);
    CREATE TABLE ai_runs (
        id TEXT PRIMARY KEY NOT NULL,
        encounter_id TEXT REFERENCES encounters (id),
        patient_id TEXT REFERENCES patients (id),
        usage_type TEXT NOT NULL,
        provider TEXT NOT NULL,
        model_version TEXT,
        prompt_version TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'DRAFT',
        input_redacted TEXT,
        output TEXT,
        estimated_cost_cents INTEGER,
        latency_ms INTEGER,
        consent_id TEXT REFERENCES ai_consents (id),
        feedback TEXT,
        reviewed_at TEXT,
        created_at TEXT NOT NULL
    );
    CREATE INDEX idx_ai_runs_encounter ON ai_runs (encounter_id);",
    // v8: benchmark clinico de IA (paso 11). Compara proveedores con casos
    // SIMULADOS (sin PHI) y documenta una decision. Clase: OPERATIVO — solo
    // local; nunca lleva contenido clinico real.
    "CREATE TABLE ai_benchmark_runs (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        case_count INTEGER NOT NULL,
        recommended_provider TEXT,
        notes TEXT,
        created_at TEXT NOT NULL
    );
    CREATE TABLE ai_benchmark_results (
        id TEXT PRIMARY KEY NOT NULL,
        run_id TEXT NOT NULL REFERENCES ai_benchmark_runs (id),
        provider TEXT NOT NULL,
        success_count INTEGER NOT NULL,
        avg_latency_ms INTEGER NOT NULL,
        total_cost_cents INTEGER NOT NULL,
        completeness_pct INTEGER NOT NULL
    );
    CREATE INDEX idx_ai_benchmark_results_run ON ai_benchmark_results (run_id);",
    // v9: reporte de metadatos de uso IA al portal (paso 11). Marca local para
    // idempotencia de envio; el portal recibe solo referencias/costos, nunca
    // input_redacted ni output. Clase: OPERATIVO.
    "ALTER TABLE ai_runs ADD COLUMN usage_reported_at TEXT;
    CREATE INDEX idx_ai_runs_usage_reported ON ai_runs (usage_reported_at);",
    // v10: solicitudes ARCO (paso 12). El medico atiende ARCO localmente porque
    // los datos clinicos son suyos y residen en este equipo (decision del
    // inventario funcional). Registro de la solicitud y su atencion. Clase:
    // OPERATIVO — solo metadatos de la solicitud, sin contenido clinico. La
    // cancelacion (borrado) opera sobre el expediente clinico de forma separada.
    "CREATE TABLE arco_requests (
        id TEXT PRIMARY KEY NOT NULL,
        patient_id TEXT NOT NULL REFERENCES patients (id),
        request_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        notes TEXT,
        requested_at TEXT NOT NULL,
        fulfilled_at TEXT,
        result_summary TEXT
    );
    CREATE INDEX idx_arco_requests_patient ON arco_requests (patient_id);",
    // v11: linea del tiempo clinica por paciente (paso 13). Eventos relevantes
    // que el medico cura a mano (diagnosticos, hitos, alertas, etc.), separados
    // de las notas de consulta. CLINICO: vive solo en la base local cifrada, la
    // nube no lo conoce. `event_date` es la fecha clinica del evento (la captura
    // el medico); `created_at`/`updated_at` son de auditoria.
    "CREATE TABLE timeline_events (
        id TEXT PRIMARY KEY NOT NULL,
        patient_id TEXT NOT NULL REFERENCES patients (id),
        event_date TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'NOTE',
        title TEXT NOT NULL,
        detail TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE INDEX idx_timeline_events_patient ON timeline_events (patient_id, event_date);",
    // v12: vinculo agenda -> expediente (paso 13). La agenda y el directorio
    // son independientes: una cita no crea automaticamente un expediente. Al
    // importar un paciente desde una cita, el medico puede vincular el id del
    // paciente del portal a un expediente local existente (porque el portal no
    // garantiza el mismo id para la misma persona). Este mapeo recuerda esa
    // decision para que la proxima cita de la misma persona se resuelva sola.
    // Clase: OPERATIVO (solo correlaciona identificadores, sin contenido clinico).
    "CREATE TABLE patient_links (
        portal_patient_id TEXT PRIMARY KEY NOT NULL,
        patient_id TEXT NOT NULL REFERENCES patients (id),
        linked_at TEXT NOT NULL
    );
    CREATE INDEX idx_patient_links_patient ON patient_links (patient_id);",
    // v13: seguridad de medicacion determinista (paso 14). Base de referencia
    // publica (farmacos, clases e interacciones) — clase REFERENCIA, no PHI: es
    // conocimiento clinico publico empaquetado, no datos del paciente. Las
    // verificaciones corren localmente sobre la prescripcion (CLINICO) y nunca
    // salen del equipo. En esta rebanada la base es un conjunto SEMBRADO
    // representativo de interacciones clinicas conocidas; la importacion real de
    // RxNorm/RxClass/DDInter/openFDA es una rebanada posterior.
    "CREATE TABLE medication_reference (
        name TEXT PRIMARY KEY NOT NULL,      -- nombre normalizado (minusculas) que se busca
        ingredient TEXT NOT NULL,            -- ingrediente canonico
        display_name TEXT NOT NULL,          -- nombre para mostrar
        drug_class TEXT                      -- clase terapeutica (duplicidad/alergia cruzada)
    );
    CREATE INDEX idx_medication_reference_ingredient ON medication_reference (ingredient);
    CREATE TABLE drug_interactions (
        ingredient_a TEXT NOT NULL,          -- orden canonico: a <= b
        ingredient_b TEXT NOT NULL,
        severity TEXT NOT NULL,              -- CONTRAINDICATED | MAJOR | MODERATE | MINOR
        description TEXT NOT NULL,
        source TEXT NOT NULL,
        source_version TEXT NOT NULL,
        PRIMARY KEY (ingredient_a, ingredient_b)
    );
    INSERT INTO app_meta (key, value) VALUES ('medication_reference_version', 'seed-v1');
    INSERT INTO medication_reference (name, ingredient, display_name, drug_class) VALUES
        ('ibuprofeno','ibuprofeno','Ibuprofeno','AINE'),
        ('naproxeno','naproxeno','Naproxeno','AINE'),
        ('ketorolaco','ketorolaco','Ketorolaco','AINE'),
        ('aspirina','acido acetilsalicilico','Aspirina','AINE'),
        ('acido acetilsalicilico','acido acetilsalicilico','Acido acetilsalicilico','AINE'),
        ('warfarina','warfarina','Warfarina','Anticoagulante'),
        ('lisinopril','lisinopril','Lisinopril','IECA'),
        ('enalapril','enalapril','Enalapril','IECA'),
        ('losartan','losartan','Losartan','ARA II'),
        ('valsartan','valsartan','Valsartan','ARA II'),
        ('espironolactona','espironolactona','Espironolactona','Diuretico ahorrador de potasio'),
        ('sildenafil','sildenafil','Sildenafil','Inhibidor PDE5'),
        ('nitroglicerina','nitroglicerina','Nitroglicerina','Nitrato'),
        ('isosorbida','dinitrato de isosorbida','Dinitrato de isosorbida','Nitrato'),
        ('claritromicina','claritromicina','Claritromicina','Macrolido'),
        ('simvastatina','simvastatina','Simvastatina','Estatina'),
        ('atorvastatina','atorvastatina','Atorvastatina','Estatina'),
        ('tramadol','tramadol','Tramadol','Opioide'),
        ('fluoxetina','fluoxetina','Fluoxetina','ISRS'),
        ('sertralina','sertralina','Sertralina','ISRS'),
        ('litio','litio','Litio','Estabilizador del animo'),
        ('amoxicilina','amoxicilina','Amoxicilina','Penicilina'),
        ('ampicilina','ampicilina','Ampicilina','Penicilina'),
        ('omeprazol','omeprazol','Omeprazol','IBP'),
        ('pantoprazol','pantoprazol','Pantoprazol','IBP'),
        ('metformina','metformina','Metformina','Biguanida'),
        ('paracetamol','paracetamol','Paracetamol','Analgesico');
    INSERT INTO drug_interactions (ingredient_a, ingredient_b, severity, description, source, source_version) VALUES
        ('acido acetilsalicilico','warfarina','MAJOR','Mayor riesgo de sangrado por efecto antiagregante y anticoagulante combinado.','Conjunto sembrado MiDoc (interaccion clinica conocida)','seed-v1'),
        ('ibuprofeno','warfarina','MAJOR','Los AINE aumentan el riesgo de sangrado con warfarina.','Conjunto sembrado MiDoc (interaccion clinica conocida)','seed-v1'),
        ('naproxeno','warfarina','MAJOR','Los AINE aumentan el riesgo de sangrado con warfarina.','Conjunto sembrado MiDoc (interaccion clinica conocida)','seed-v1'),
        ('ketorolaco','warfarina','MAJOR','Los AINE aumentan el riesgo de sangrado con warfarina.','Conjunto sembrado MiDoc (interaccion clinica conocida)','seed-v1'),
        ('ibuprofeno','lisinopril','MODERATE','Los AINE reducen el efecto antihipertensivo y pueden afectar la funcion renal.','Conjunto sembrado MiDoc (interaccion clinica conocida)','seed-v1'),
        ('enalapril','ibuprofeno','MODERATE','Los AINE reducen el efecto antihipertensivo y pueden afectar la funcion renal.','Conjunto sembrado MiDoc (interaccion clinica conocida)','seed-v1'),
        ('espironolactona','lisinopril','MAJOR','Riesgo de hiperpotasemia por combinar IECA con ahorrador de potasio.','Conjunto sembrado MiDoc (interaccion clinica conocida)','seed-v1'),
        ('enalapril','espironolactona','MAJOR','Riesgo de hiperpotasemia por combinar IECA con ahorrador de potasio.','Conjunto sembrado MiDoc (interaccion clinica conocida)','seed-v1'),
        ('nitroglicerina','sildenafil','CONTRAINDICATED','Hipotension grave por combinar nitrato con inhibidor de PDE5.','Conjunto sembrado MiDoc (interaccion clinica conocida)','seed-v1'),
        ('dinitrato de isosorbida','sildenafil','CONTRAINDICATED','Hipotension grave por combinar nitrato con inhibidor de PDE5.','Conjunto sembrado MiDoc (interaccion clinica conocida)','seed-v1'),
        ('claritromicina','simvastatina','MAJOR','Riesgo de miopatia o rabdomiolisis por inhibir el metabolismo de la estatina.','Conjunto sembrado MiDoc (interaccion clinica conocida)','seed-v1'),
        ('fluoxetina','tramadol','MAJOR','Riesgo de sindrome serotoninergico y descenso del umbral convulsivo.','Conjunto sembrado MiDoc (interaccion clinica conocida)','seed-v1'),
        ('sertralina','tramadol','MAJOR','Riesgo de sindrome serotoninergico y descenso del umbral convulsivo.','Conjunto sembrado MiDoc (interaccion clinica conocida)','seed-v1'),
        ('ibuprofeno','litio','MAJOR','Los AINE elevan los niveles de litio (riesgo de toxicidad).','Conjunto sembrado MiDoc (interaccion clinica conocida)','seed-v1'),
        ('litio','naproxeno','MAJOR','Los AINE elevan los niveles de litio (riesgo de toxicidad).','Conjunto sembrado MiDoc (interaccion clinica conocida)','seed-v1');",
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
            .query_row(
                "SELECT value FROM app_meta WHERE key = 'backup_probe'",
                [],
                |r| r.get(0),
            )
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
