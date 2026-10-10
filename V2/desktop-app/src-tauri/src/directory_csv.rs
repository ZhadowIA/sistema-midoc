//! Directorio de pacientes en CSV (paso 28, rebanada 6).
//!
//! Clase de residencia: CONTACTO. Lleva el directorio a una hoja de calculo o a
//! otro sistema: identificacion, contacto, responsable y actividad (cuantas
//! consultas y la ultima). **No lleva contenido clinico**, ni siquiera las
//! alergias: un CSV es texto plano que sale de la base cifrada y se abre en
//! cualquier programa; lo clinico sale en el PDF o en el FHIR del expediente.
//!
//! Formato pensado para Excel en espanol de Mexico: UTF-8 con BOM (para que
//! respete acentos), separador coma, renglones CRLF y comillas segun RFC 4180.
//! Los valores que Excel interpretaria como formula se neutralizan con un
//! apostrofo inicial; los telefonos se dejan tal cual.

use rusqlite::Connection;

use crate::export::ExportError;

/// Un directorio listo para escribir.
pub struct DirectoryCsv {
    /// Nombre sugerido para "Guardar como", sin extension.
    pub file_stem: String,
    pub patients: usize,
    pub bytes: Vec<u8>,
}

const HEADER: [&str; 14] = [
    "Id MiDoc",
    "Nombre",
    "Apellidos",
    "Sexo",
    "Fecha de nacimiento",
    "Teléfono",
    "Correo",
    "Responsable",
    "Parentesco del responsable",
    "Teléfono del responsable",
    "Correo del responsable",
    "Consultas",
    "Última consulta",
    "Alta en MiDoc",
];

/// Arma el CSV de todo el directorio, ordenado como en la app (apellidos,
/// nombre). Cuenta las consultas con nota, igual que el directorio, y deja
/// fuera a los pacientes cuya cancelacion ARCO ya se cumplio.
pub fn directory_csv(conn: &Connection) -> Result<DirectoryCsv, ExportError> {
    let mut statement = conn.prepare(
        "SELECT p.id, p.first_name, p.last_name, p.sex, p.birth_date, p.phone, p.email,
                p.guardian_name, p.guardian_relationship, p.guardian_phone, p.guardian_email,
                COUNT(e.id), MAX(e.opened_at), p.created_at
         FROM patients p
         LEFT JOIN encounters e ON e.patient_id = p.id
            AND EXISTS (SELECT 1 FROM note_versions nv WHERE nv.encounter_id = e.id)
         WHERE NOT EXISTS (
            SELECT 1 FROM arco_requests a
            WHERE a.patient_id = p.id AND a.request_type = 'CANCELLATION' AND a.status = 'FULFILLED'
         )
         GROUP BY p.id
         ORDER BY p.last_name COLLATE NOCASE, p.first_name COLLATE NOCASE",
    )?;
    let rows: Vec<Vec<String>> = statement
        .query_map([], |row| {
            let text = |index: usize| -> rusqlite::Result<String> {
                Ok(row.get::<_, Option<String>>(index)?.unwrap_or_default())
            };
            let encounters: i64 = row.get(11)?;
            Ok(vec![
                text(0)?,
                text(1)?,
                text(2)?,
                sex_label(&text(3)?).to_string(),
                text(4)?,
                text(5)?,
                text(6)?,
                text(7)?,
                text(8)?,
                text(9)?,
                text(10)?,
                encounters.to_string(),
                local_date(&text(12)?),
                local_date(&text(13)?),
            ])
        })?
        .collect::<Result<_, _>>()?;

    let mut csv = String::from("\u{feff}");
    csv.push_str(&csv_line(HEADER.iter().copied()));
    for row in &rows {
        csv.push_str(&csv_line(row.iter().map(String::as_str)));
    }
    let today = chrono::Local::now().format("%Y-%m-%d");
    Ok(DirectoryCsv {
        file_stem: format!("Directorio de pacientes {today}"),
        patients: rows.len(),
        bytes: csv.into_bytes(),
    })
}

fn sex_label(sex: &str) -> &'static str {
    match sex.trim() {
        "F" => "Femenino",
        "M" => "Masculino",
        "O" => "Otro",
        _ => "",
    }
}

/// Fecha local (AAAA-MM-DD) de un instante RFC 3339; vacio si no parsea.
fn local_date(raw: &str) -> String {
    chrono::DateTime::parse_from_rfc3339(raw.trim())
        .map(|dt| {
            dt.with_timezone(&chrono::Local)
                .format("%Y-%m-%d")
                .to_string()
        })
        .unwrap_or_default()
}

fn csv_line<'a>(fields: impl Iterator<Item = &'a str>) -> String {
    let mut line = fields.map(csv_field).collect::<Vec<_>>().join(",");
    line.push_str("\r\n");
    line
}

/// Un campo CSV: neutraliza formulas y entrecomilla lo que haga falta.
pub(crate) fn csv_field(raw: &str) -> String {
    let value = if starts_like_formula(raw) {
        format!("'{raw}")
    } else {
        raw.to_string()
    };
    let needs_quotes = value.contains([',', '"', '\r', '\n'])
        || value.starts_with(char::is_whitespace)
        || value.ends_with(char::is_whitespace);
    if needs_quotes {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value
    }
}

/// Excel ejecuta como formula lo que empieza con `=`, `+`, `-` o `@` (y con
/// tabulador o retorno). Un telefono como "+52 55 1234 5678" no es formula y
/// se deja intacto para no ensuciar el dato.
fn starts_like_formula(value: &str) -> bool {
    let Some(first) = value.chars().next() else {
        return false;
    };
    let risky = matches!(first, '=' | '+' | '-' | '@' | '\t' | '\r');
    let phone_like = value
        .chars()
        .all(|c| c.is_ascii_digit() || " +-().".contains(c));
    risky && !(phone_like && first != '=' && first != '@')
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clinical::{self, NoteContent};
    use crate::db::open_encrypted;

    fn test_conn(name: &str) -> Connection {
        let dir = std::env::temp_dir().join("midoc-directory-csv-tests");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(format!("{name}-{}.db", uuid::Uuid::new_v4()));
        open_encrypted(&path, "frase-de-prueba-123").unwrap()
    }

    /// Lector RFC 4180 minimo para las pruebas: comillas, comillas dobladas y
    /// saltos de linea dentro de un campo.
    fn parse_csv(text: &str) -> Vec<Vec<String>> {
        let mut rows = Vec::new();
        let mut row = Vec::new();
        let mut field = String::new();
        let mut quoted = false;
        let mut chars = text.chars().peekable();
        while let Some(c) = chars.next() {
            match (quoted, c) {
                (true, '"') if chars.peek() == Some(&'"') => {
                    field.push('"');
                    chars.next();
                }
                (true, '"') => quoted = false,
                (true, c) => field.push(c),
                (false, '"') => quoted = true,
                (false, ',') => row.push(std::mem::take(&mut field)),
                (false, '\r') => {}
                (false, '\n') => {
                    row.push(std::mem::take(&mut field));
                    rows.push(std::mem::take(&mut row));
                }
                (false, c) => field.push(c),
            }
        }
        rows
    }

    fn seed(conn: &Connection) {
        conn.execute_batch(
            "INSERT INTO patients (id, first_name, last_name, phone, email, sex, birth_date, allergies,
                                   medical_background, guardian_name, guardian_relationship,
                                   guardian_phone, guardian_email, created_at, updated_at)
             VALUES ('p-ana', 'Ana', 'Ruiz, López', '+52 55 1234 5678', 'ana@example.com', 'F', '2014-05-01',
                     'Penicilina', 'Asma', 'Rosa \"Chayo\" López', 'Madre', '5587654321', NULL,
                     '2026-01-10T12:00:00+00:00', '2026-01-10T12:00:00+00:00'),
                    ('p-beto', '=HYPERLINK(\"http://x\")', 'Alvarez', NULL, NULL, 'M', NULL, NULL,
                     NULL, NULL, NULL, NULL, NULL,
                     '2026-02-01T12:00:00+00:00', '2026-02-01T12:00:00+00:00'),
                    ('p-baja', '[ELIMINADO]', '', NULL, NULL, NULL, NULL, NULL,
                     NULL, NULL, NULL, NULL, NULL,
                     '2026-01-01T12:00:00+00:00', '2026-01-01T12:00:00+00:00');
             INSERT INTO arco_requests (id, patient_id, request_type, status, requested_at, fulfilled_at)
             VALUES ('arco-1', 'p-baja', 'CANCELLATION', 'FULFILLED', '2026-03-01', '2026-03-01');",
        )
        .unwrap();
        let with_note =
            clinical::open_encounter_for_patient(conn, "p-ana", chrono::Local::now().date_naive())
                .unwrap();
        clinical::save_note(
            conn,
            &with_note.id,
            &NoteContent {
                plan: "Control".into(),
                ..Default::default()
            },
        )
        .unwrap();
        conn.execute(
            "UPDATE encounters SET opened_at = '2026-09-15T12:00:00+00:00' WHERE id = ?1",
            [&with_note.id],
        )
        .unwrap();
        // Consulta abierta sin nota: no cuenta, como en el directorio.
        clinical::open_encounter_for_patient(conn, "p-ana", chrono::Local::now().date_naive())
            .unwrap();
    }

    #[test]
    fn exports_identity_contact_and_activity_without_clinical_content() {
        let conn = test_conn("directory");
        seed(&conn);
        let export = directory_csv(&conn).unwrap();
        let text = String::from_utf8(export.bytes).unwrap();

        assert!(
            text.starts_with('\u{feff}'),
            "BOM para que Excel respete los acentos"
        );
        assert!(
            text.contains("\r\n") && !text.replace("\r\n", "").contains('\r'),
            "renglones CRLF"
        );
        assert!(
            !text.contains("Penicilina") && !text.contains("Asma"),
            "nada clinico en el CSV"
        );
        assert!(
            !text.contains("ELIMINADO"),
            "sin pacientes cancelados por ARCO"
        );
        assert_eq!(export.patients, 2);
        assert!(export.file_stem.starts_with("Directorio de pacientes "));

        let rows = parse_csv(text.trim_start_matches('\u{feff}'));
        assert_eq!(rows[0], HEADER.map(String::from).to_vec());
        assert_eq!(rows.len(), 3);
        assert!(rows.iter().all(|row| row.len() == HEADER.len()));

        // Orden por apellidos: Alvarez antes que Ruiz.
        let beto = &rows[1];
        assert_eq!(beto[0], "p-beto");
        assert_eq!(
            beto[1], "'=HYPERLINK(\"http://x\")",
            "la formula queda neutralizada"
        );
        assert_eq!(beto[3], "Masculino");
        assert_eq!(beto[11], "0");
        assert_eq!(beto[12], "");

        let ana = &rows[2];
        assert_eq!(
            ana,
            &vec![
                "p-ana",
                "Ana",
                "Ruiz, López",
                "Femenino",
                "2014-05-01",
                "+52 55 1234 5678",
                "ana@example.com",
                "Rosa \"Chayo\" López",
                "Madre",
                "5587654321",
                "",
                "1",
                "2026-09-15",
                "2026-01-10",
            ]
        );
    }

    #[test]
    fn empty_directory_still_has_the_header() {
        let conn = test_conn("empty");
        let export = directory_csv(&conn).unwrap();
        assert_eq!(export.patients, 0);
        let rows = parse_csv(
            String::from_utf8(export.bytes)
                .unwrap()
                .trim_start_matches('\u{feff}'),
        );
        assert_eq!(rows.len(), 1);
    }

    #[test]
    fn writes_the_csv_and_audits_without_content() {
        let conn = test_conn("write");
        seed(&conn);
        let export = directory_csv(&conn).unwrap();
        let path = std::env::temp_dir()
            .join("midoc-directory-csv-tests")
            .join(format!("directorio-{}.csv", uuid::Uuid::new_v4()));
        let sha = crate::export::write_export_bytes(
            &conn,
            &path,
            "directorio",
            "CSV_DIRECTORIO",
            &export.bytes,
        )
        .unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), export.bytes);
        let details: String = conn
            .query_row(
                "SELECT details FROM clinical_audit WHERE entity = 'export' AND action = 'CSV_DIRECTORIO'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(details.contains(&sha));
        assert!(!details.contains("Ana"), "la bitacora no guarda contenido");

        let not_utf8 = [0xff, 0xfe, 0x00];
        assert!(crate::export::write_export_bytes(
            &conn,
            &path,
            "directorio",
            "CSV_DIRECTORIO",
            &not_utf8
        )
        .is_err());
    }

    #[test]
    fn fields_are_quoted_and_formulas_neutralized() {
        assert_eq!(csv_field("Ana"), "Ana");
        assert_eq!(csv_field("Ruiz, López"), "\"Ruiz, López\"");
        assert_eq!(csv_field("di \"hola\""), "\"di \"\"hola\"\"\"");
        assert_eq!(csv_field("linea 1\nlinea 2"), "\"linea 1\nlinea 2\"");
        assert_eq!(csv_field(" espacio"), "\" espacio\"");
        assert_eq!(csv_field("=1+1"), "'=1+1");
        assert_eq!(csv_field("@SUM(A1)"), "'@SUM(A1)");
        assert_eq!(
            csv_field("-2+3+cmd|' /C calc'!A0"),
            "'-2+3+cmd|' /C calc'!A0"
        );
        assert_eq!(
            csv_field("+52 55 1234 5678"),
            "+52 55 1234 5678",
            "un telefono no es formula"
        );
        assert_eq!(csv_field("(55) 1234-5678"), "(55) 1234-5678");
        assert_eq!(csv_field(""), "");
    }
}
