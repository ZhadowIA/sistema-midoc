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
use crate::db::{create_encrypted_backup, open_encrypted, rekey_to_wrapped_dek, schema_version};
use crate::keyring::{dek_to_pragma, keys_path, read_key_file, unlock, ROLE_DOCTOR};
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

/// Drill post-rekey (paso 27, rebanada 2). Desde que la base se cifra con una
/// DEK envuelta por persona, restaurar exige DOS archivos: el respaldo `.db` y
/// el `keys.json` que vive junto a el. Este drill prueba que (a) la passphrase
/// ya no abre la base tras el rekey, (b) el respaldo cifrado con la DEK se
/// restaura en otra carpeta con su `keys.json`, (c) sin `keys.json` la
/// passphrase no sirve, y (d) el respaldo pre-rekey sigue abriendo con la
/// passphrase, como red de seguridad.
#[test]
fn restore_drill_recovers_after_rekey_to_wrapped_dek() {
    let dir = drill_dir().join(format!("rekey-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let source = dir.join("midoc.db");

    println!("
===== DRILL DE RESTAURACION POST-REKEY (paso 27) =====");

    // 1. Base con passphrase (estado previo a la rebanada 2) y expediente firmado.
    let conn = open_encrypted(&source, PASSPHRASE).unwrap();
    let encounter_id = seed_clinical(&conn);
    drop(conn);
    println!("1) base con passphrase creada y poblada");

    // 2. Rekey a DEK envuelta: lo mismo que hace unlock_database al abrir.
    let (actor, dek) = rekey_to_wrapped_dek(&source, PASSPHRASE, "Dra. Drill").unwrap();
    assert_eq!(actor.role, ROLE_DOCTOR);
    assert!(keys_path(&source).exists(), "keys.json debe quedar junto a la base");
    assert!(
        open_encrypted(&source, PASSPHRASE).is_err(),
        "tras el rekey la passphrase no debe abrir la base directamente"
    );
    println!("2) rekey aplicado: la passphrase ya no es la llave; keys.json escrito");

    // 3. Respaldo cifrado con la DEK (el respaldo automatico de cada unlock).
    let conn = open_encrypted(&source, &dek_to_pragma(&dek)).unwrap();
    let restore_dir = dir.join("restore");
    std::fs::create_dir_all(&restore_dir).unwrap();
    let backup = restore_dir.join("midoc.db");
    create_encrypted_backup(&conn, &backup).unwrap();
    drop(conn);
    // El respaldo necesita su keys.json al lado: es la mitad de la llave.
    std::fs::copy(keys_path(&source), keys_path(&backup)).unwrap();
    println!("3) respaldo cifrado con la DEK + copia de keys.json");

    // 4. Perdida total de la carpeta original.
    std::fs::remove_file(&source).unwrap();
    std::fs::remove_file(keys_path(&source)).unwrap();
    println!("4) perdida simulada: base y keys.json originales eliminados");

    // 5. Restauracion: la credencial abre la envoltura restaurada y la DEK el
    //    respaldo. El contenido clinico esta intacto.
    let file = read_key_file(&backup).unwrap().expect("keys.json restaurado");
    let (restored_dek, who) = unlock(&file, PASSPHRASE).unwrap();
    assert_eq!(restored_dek, dek);
    assert_eq!(who.id, actor.id);
    let restored = open_encrypted(&backup, &dek_to_pragma(&restored_dek)).unwrap();
    let diagnosis: String = restored
        .query_row(
            "SELECT diagnosis FROM note_versions WHERE encounter_id = ?1 ORDER BY version DESC LIMIT 1",
            params![encounter_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(diagnosis, "Lumbalgia");
    println!("5) restauracion verificada: {} abrio como {} ({})", who.name, who.role, encounter_id);
    drop(restored);

    // 6. Sin keys.json la passphrase no abre el respaldo: hay que respaldar ambos.
    assert!(open_encrypted(&backup, PASSPHRASE).is_err());
    println!("6) el respaldo no se abre con la passphrase sola (hace falta keys.json)");

    // 7. Red de seguridad: el respaldo pre-rekey sigue abriendo con la passphrase.
    let pre_rekey = std::fs::read_dir(dir.join("backups"))
        .unwrap()
        .filter_map(|entry| entry.ok().map(|e| e.path()))
        .find(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| name.starts_with("pre-rekey-"))
        })
        .expect("rekey_to_wrapped_dek deja un respaldo pre-rekey");
    let legacy = open_encrypted(&pre_rekey, PASSPHRASE).unwrap();
    assert_eq!(count(&legacy, "encounters"), 1);
    println!("7) respaldo pre-rekey abre con la passphrase: {}", pre_rekey.display());

    println!("===== DRILL OK: restauracion post-rekey =====
");
    let _ = std::fs::remove_dir_all(&dir);
}
