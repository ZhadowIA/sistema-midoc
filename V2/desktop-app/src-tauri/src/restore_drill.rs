//! Drill de restauracion del respaldo cifrado (paso 9).
//!
//! Reproduce una perdida total de la base clinica y la recupera desde el
//! respaldo cifrado, imprimiendo evidencia verificable a stdout. Es el guion
//! ejecutable del drill manual documentado en
//! `V2/docs/paso-9-drill-restauracion.md`.
//!
//! Correr y capturar evidencia:
//!   cargo test --lib restore_drill -- --nocapture

use crate::clinical::{open_encounter_for_appointment, save_note, sign_encounter, NoteContent};
use crate::db::{create_encrypted_backup, open_encrypted, schema_version};
use rusqlite::{params, Connection};
use std::io::Read;

const PASSPHRASE: &str = "frase-de-seguridad-del-medico";

fn drill_dir() -> std::path::PathBuf {
    let dir = std::env::temp_dir().join("midoc-restore-drill");
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn count(conn: &Connection, table: &str) -> i64 {
    conn.query_row(&format!("SELECT count(*) FROM {table}"), [], |row| row.get(0))
        .unwrap()
}

fn header_hex(path: &std::path::Path) -> String {
    let mut header = [0u8; 16];
    std::fs::File::open(path)
        .unwrap()
        .read_exact(&mut header)
        .unwrap();
    header.iter().map(|b| format!("{b:02x}")).collect()
}

/// Siembra datos clinicos reales (cita -> encuentro -> nota firmada) para que el
/// drill demuestre que el contenido clinico sobrevive a la restauracion.
fn seed_clinical(conn: &Connection) -> String {
    conn.execute(
        "INSERT INTO appointments (id, status, scheduled_start, scheduled_end,
            service_name, reason, patient_id, patient_first_name, patient_last_name,
            patient_phone, updated_at)
         VALUES ('appt-drill', 'CONFIRMED', '2026-06-22T15:00:00Z', '2026-06-22T15:30:00Z',
            'Consulta general', 'Dolor lumbar', 'pat-drill', 'Hugo', 'Paz', '6140001111', '0')",
        params![],
    )
    .unwrap();

    let encounter = open_encounter_for_appointment(conn, "appt-drill").unwrap();
    save_note(
        conn,
        &encounter.id,
        &NoteContent {
            subjective: "Dolor lumbar mecanico".into(),
            diagnosis: "Lumbalgia".into(),
            plan: "AINEs y ejercicio".into(),
            ..Default::default()
        },
    )
    .unwrap();
    sign_encounter(conn, &encounter.id).unwrap();
    encounter.id
}

#[test]
fn restore_drill_recovers_clinical_data_with_evidence() {
    let dir = drill_dir();
    let source = dir.join(format!("midoc-source-{}.db", std::process::id()));
    let backup = dir.join(format!("midoc-backup-{}.db", std::process::id()));
    let _ = std::fs::remove_file(&source);
    let _ = std::fs::remove_file(&backup);

    println!("\n===== DRILL DE RESTAURACION (paso 9) =====");
    println!("fecha (UTC):       {}", chrono::Utc::now().to_rfc3339());

    // 1. Base clinica viva con un expediente firmado.
    let conn = open_encrypted(&source, PASSPHRASE).unwrap();
    let encounter_id = seed_clinical(&conn);
    let schema = schema_version(&conn).unwrap();
    println!("1) base de origen creada y poblada");
    println!("   esquema:        v{schema}");
    println!("   citas:          {}", count(&conn, "appointments"));
    println!("   pacientes:      {}", count(&conn, "patients"));
    println!("   encuentros:     {}", count(&conn, "encounters"));
    println!("   notas:          {}", count(&conn, "note_versions"));

    // 2. Respaldo cifrado (igual que el respaldo automatico al desbloquear).
    create_encrypted_backup(&conn, &backup).unwrap();
    let backup_bytes = std::fs::metadata(&backup).unwrap().len();
    println!("2) respaldo cifrado creado");
    println!("   tamano:         {backup_bytes} bytes");
    println!("   cabecera (hex): {}", header_hex(&backup));
    println!("   (no es 'SQLite format 3\\0' => cifrado en disco)");
    assert_ne!(header_hex(&backup), "53514c69746520666f726d6174203300");

    // 3. Perdida total: se cierra y se borra la base de origen.
    drop(conn);
    std::fs::remove_file(&source).unwrap();
    println!("3) perdida simulada: base de origen eliminada");
    assert!(!source.exists());

    // 4. Restauracion: abrir el respaldo con la frase correcta.
    let restored = open_encrypted(&backup, PASSPHRASE).unwrap();
    let diagnosis: String = restored
        .query_row(
            "SELECT diagnosis FROM note_versions WHERE encounter_id = ?1 ORDER BY version DESC LIMIT 1",
            params![encounter_id],
            |row| row.get(0),
        )
        .unwrap();
    let status: String = restored
        .query_row(
            "SELECT status FROM encounters WHERE id = ?1",
            params![encounter_id],
            |row| row.get(0),
        )
        .unwrap();
    println!("4) restauracion verificada desde el respaldo");
    println!("   esquema:        v{}", schema_version(&restored).unwrap());
    println!("   citas:          {}", count(&restored, "appointments"));
    println!("   encuentros:     {}", count(&restored, "encounters"));
    println!("   notas:          {}", count(&restored, "note_versions"));
    println!("   encuentro:      {encounter_id}");
    println!("   estado nota:    {status}");
    println!("   diagnostico:    {diagnosis}");

    assert_eq!(status, "SIGNED");
    assert_eq!(diagnosis, "Lumbalgia");
    assert_eq!(schema_version(&restored).unwrap(), schema);

    // 5. El respaldo no se abre con una frase incorrecta.
    drop(restored);
    let wrong = open_encrypted(&backup, "frase-incorrecta");
    println!("5) frase incorrecta rechazada: {}", wrong.is_err());
    assert!(wrong.is_err());

    println!("===== DRILL OK: contenido clinico recuperado =====\n");

    let _ = std::fs::remove_file(&backup);
}
