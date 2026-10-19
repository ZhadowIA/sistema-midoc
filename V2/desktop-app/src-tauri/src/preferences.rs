//! Preferencias del medico que viven en su base cifrada (`app_meta`), una por
//! perfil. Clase: OPERATIVO (configuracion de la app, sin contenido clinico).

use rusqlite::{params, Connection, OptionalExtension};

#[derive(Debug, thiserror::Error)]
pub enum PreferencesError {
    #[error("error de base de datos: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("{0}")]
    Invalid(String),
}

const INACTIVITY_LOCK_KEY: &str = "inactivity_lock_minutes";

/// Bloqueo por inactividad por omision (decision del 2026-10-18).
pub const DEFAULT_INACTIVITY_LOCK_MINUTES: i64 = 30;

/// Opciones que ofrece la interfaz; 0 lo desactiva.
pub const INACTIVITY_LOCK_CHOICES: &[i64] = &[0, 5, 10, 15, 30, 60, 120];

/// Minutos sin actividad antes de bloquear la base; 0 si el medico lo desactivo.
/// Un valor guardado que ya no es una opcion valida vuelve al de omision.
pub fn inactivity_lock_minutes(conn: &Connection) -> Result<i64, PreferencesError> {
    let stored: Option<String> = conn
        .query_row(
            "SELECT value FROM app_meta WHERE key = ?1",
            params![INACTIVITY_LOCK_KEY],
            |row| row.get(0),
        )
        .optional()?;
    Ok(stored
        .and_then(|raw| raw.parse::<i64>().ok())
        .filter(|minutes| INACTIVITY_LOCK_CHOICES.contains(minutes))
        .unwrap_or(DEFAULT_INACTIVITY_LOCK_MINUTES))
}

pub fn set_inactivity_lock_minutes(
    conn: &Connection,
    minutes: i64,
) -> Result<(), PreferencesError> {
    if !INACTIVITY_LOCK_CHOICES.contains(&minutes) {
        return Err(PreferencesError::Invalid(format!(
            "tiempo de bloqueo no valido: {minutes} minutos"
        )));
    }
    conn.execute(
        "INSERT INTO app_meta (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = ?2",
        params![INACTIVITY_LOCK_KEY, minutes.to_string()],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_encrypted;

    fn test_conn(name: &str) -> Connection {
        let dir = std::env::temp_dir().join("midoc-preferences-tests");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(format!("{name}-{}.db", uuid::Uuid::new_v4()));
        open_encrypted(&path, "frase-de-prueba-123").unwrap()
    }

    #[test]
    fn inactivity_lock_defaults_to_thirty_minutes_and_can_be_disabled() {
        let conn = test_conn("lock");
        assert_eq!(inactivity_lock_minutes(&conn).unwrap(), 30);

        set_inactivity_lock_minutes(&conn, 10).unwrap();
        assert_eq!(inactivity_lock_minutes(&conn).unwrap(), 10);

        set_inactivity_lock_minutes(&conn, 0).unwrap();
        assert_eq!(inactivity_lock_minutes(&conn).unwrap(), 0, "0 lo desactiva");
    }

    #[test]
    fn rejects_values_outside_the_offered_choices() {
        let conn = test_conn("lock-invalid");
        assert!(set_inactivity_lock_minutes(&conn, 7).is_err());
        assert!(set_inactivity_lock_minutes(&conn, -1).is_err());

        // Un valor viejo o manipulado en la base no se respeta: vuelve al de omision.
        conn.execute(
            "INSERT INTO app_meta (key, value) VALUES ('inactivity_lock_minutes', '9999')",
            [],
        )
        .unwrap();
        assert_eq!(inactivity_lock_minutes(&conn).unwrap(), 30);
    }
}
