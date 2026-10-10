//! Catalogo CIE-10 para codificar diagnosticos (paso 28, rebanada 2).
//!
//! Fuente: "Catalogo CIE-10" de la Secretaria de Salud publicado en
//! datos.gob.mx (CC BY 4.0), regenerado con `npm run cie10:build`. Es
//! REFERENCIA publica, no PHI: va empaquetado en el binario y se carga en
//! memoria una sola vez. Las busquedas y avisos corren localmente.
//!
//! Los avisos de sexo, edad y validez en consulta externa vienen del propio
//! catalogo oficial. Son avisos, no bloqueos: el medico decide.

use std::sync::OnceLock;

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

use crate::medication::csv_fields_quoted;

const BUNDLED_CIE10_CSV: &str = include_str!("reference_data/cie10.csv");
pub const CATALOG_MANIFEST: &str = include_str!("reference_data/cie10.manifest.json");

#[derive(Debug, Clone)]
pub struct Cie10Entry {
    pub code: String,
    pub name: String,
    /// "F", "M" o "" (sin restriccion).
    pub sex: String,
    pub min_age_days: Option<i64>,
    pub max_age_days: Option<i64>,
    pub outpatient: bool,
    /// Nombre en mayusculas y sin acentos, para buscar.
    search_name: String,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct Cie10Match {
    pub code: String,
    pub display_code: String,
    pub name: String,
    pub warnings: Vec<String>,
}

/// Lo que se sabe del paciente para los avisos del catalogo.
#[derive(Debug, Default, Clone)]
pub struct PatientContext {
    /// "F", "M" u otro (otro = sin aviso de sexo).
    pub sex: Option<String>,
    pub age_days: Option<i64>,
}

/// Sexo y edad del paciente local, para los avisos. Sin fecha de nacimiento
/// legible no hay aviso de edad.
pub fn patient_context(
    conn: &Connection,
    patient_id: &str,
    today: chrono::NaiveDate,
) -> rusqlite::Result<PatientContext> {
    let row: Option<(Option<String>, Option<String>)> = conn
        .query_row(
            "SELECT sex, birth_date FROM patients WHERE id = ?1",
            params![patient_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;
    let Some((sex, birth_date)) = row else {
        return Ok(PatientContext::default());
    };
    let age_days = birth_date
        .as_deref()
        .and_then(|raw| raw.get(..10))
        .and_then(|day| chrono::NaiveDate::parse_from_str(day, "%Y-%m-%d").ok())
        .map(|born| (today - born).num_days())
        .filter(|days| *days >= 0);
    Ok(PatientContext { sex, age_days })
}

pub fn display_code(code: &str) -> String {
    if code.len() > 3 {
        format!("{}.{}", &code[..3], &code[3..])
    } else {
        code.to_string()
    }
}

/// Mayusculas sin acentos ni puntuacion, para comparar texto escrito a mano
/// con los nombres oficiales.
pub fn normalize(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        let mapped = match c {
            'á' | 'à' | 'ä' | 'â' | 'Á' | 'À' | 'Ä' | 'Â' => 'A',
            'é' | 'è' | 'ë' | 'ê' | 'É' | 'È' | 'Ë' | 'Ê' => 'E',
            'í' | 'ì' | 'ï' | 'î' | 'Í' | 'Ì' | 'Ï' | 'Î' => 'I',
            'ó' | 'ò' | 'ö' | 'ô' | 'Ó' | 'Ò' | 'Ö' | 'Ô' => 'O',
            'ú' | 'ù' | 'ü' | 'û' | 'Ú' | 'Ù' | 'Ü' | 'Û' => 'U',
            'ñ' | 'Ñ' => 'N',
            c if c.is_alphanumeric() => c.to_ascii_uppercase(),
            _ => ' ',
        };
        out.push(mapped);
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn parse_age(raw: &str) -> Option<i64> {
    raw.trim().parse().ok()
}

fn parse_catalog(csv: &str) -> Vec<Cie10Entry> {
    csv.lines()
        .skip(1)
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| {
            let f = csv_fields_quoted(line);
            if f.len() < 6 {
                return None;
            }
            Some(Cie10Entry {
                code: f[0].clone(),
                search_name: normalize(&f[1]),
                name: f[1].clone(),
                sex: f[2].clone(),
                min_age_days: parse_age(&f[3]),
                max_age_days: parse_age(&f[4]),
                outpatient: f[5] == "1",
            })
        })
        .collect()
}

pub fn catalog() -> &'static [Cie10Entry] {
    static CATALOG: OnceLock<Vec<Cie10Entry>> = OnceLock::new();
    CATALOG.get_or_init(|| parse_catalog(BUNDLED_CIE10_CSV))
}

/// Clave escrita por el medico ("a18.2", "A182 ") a la forma del catalogo.
pub fn normalize_code(raw: &str) -> String {
    raw.trim().replace('.', "").to_ascii_uppercase()
}

pub fn lookup(code: &str) -> Option<&'static Cie10Entry> {
    let code = normalize_code(code);
    catalog()
        .binary_search_by(|entry| entry.code.as_str().cmp(code.as_str()))
        .ok()
        .map(|index| &catalog()[index])
}

fn age_label(days: i64) -> String {
    if days >= 365 {
        format!("{} años", days / 365)
    } else if days >= 30 {
        format!("{} meses", days / 30)
    } else {
        format!("{days} dias")
    }
}

pub fn warnings_for(entry: &Cie10Entry, patient: &PatientContext) -> Vec<String> {
    let mut warnings = Vec::new();
    if let Some(sex) = patient.sex.as_deref() {
        if (sex == "F" || sex == "M") && !entry.sex.is_empty() && entry.sex != sex {
            warnings.push(if entry.sex == "F" {
                "El catalogo restringe este codigo a mujeres.".to_string()
            } else {
                "El catalogo restringe este codigo a hombres.".to_string()
            });
        }
    }
    if let Some(age) = patient.age_days {
        let below = entry.min_age_days.is_some_and(|min| age < min);
        let above = entry.max_age_days.is_some_and(|max| age > max);
        if below || above {
            let range = match (entry.min_age_days, entry.max_age_days) {
                (Some(min), Some(max)) => format!("de {} a {}", age_label(min), age_label(max)),
                (Some(min), None) => format!("desde {}", age_label(min)),
                (None, Some(max)) => format!("hasta {}", age_label(max)),
                (None, None) => String::new(),
            };
            warnings.push(format!("Fuera del rango de edad del codigo ({range})."));
        }
    }
    if !entry.outpatient {
        warnings.push("No es valido como causa en consulta externa; busca una subcategoria.".to_string());
    }
    warnings
}

fn to_match(entry: &Cie10Entry, patient: &PatientContext) -> Cie10Match {
    Cie10Match {
        code: entry.code.clone(),
        display_code: display_code(&entry.code),
        name: entry.name.clone(),
        warnings: warnings_for(entry, patient),
    }
}

/// Busca por clave ("J45", "j45.9") o por palabras del nombre ("asma alerg").
/// Orden: clave exacta, clave que empieza igual, nombre que empieza con lo
/// escrito, nombre con todas las palabras; dentro de cada grupo primero lo
/// valido en consulta externa y despues por clave.
pub fn search(query: &str, patient: &PatientContext, limit: usize) -> Vec<Cie10Match> {
    let normalized = normalize(query);
    if normalized.is_empty() {
        return Vec::new();
    }
    let code_query = normalize_code(query);
    let looks_like_code = code_query.len() <= 4
        && code_query.chars().next().is_some_and(|c| c.is_ascii_alphabetic())
        && code_query.chars().skip(1).all(|c| c.is_ascii_digit());
    let tokens: Vec<&str> = normalized.split(' ').collect();

    let mut ranked: Vec<(u8, &Cie10Entry)> = catalog()
        .iter()
        .filter_map(|entry| {
            if looks_like_code && entry.code == code_query {
                return Some((0, entry));
            }
            if looks_like_code && entry.code.starts_with(&code_query) {
                return Some((1, entry));
            }
            if entry.search_name.starts_with(&normalized) {
                return Some((2, entry));
            }
            let words: Vec<&str> = entry.search_name.split(' ').collect();
            if tokens.iter().all(|t| words.iter().any(|w| w.starts_with(t))) {
                return Some((3, entry));
            }
            None
        })
        .collect();

    ranked.sort_by(|(ra, a), (rb, b)| {
        ra.cmp(rb)
            .then(b.outpatient.cmp(&a.outpatient))
            .then(a.code.cmp(&b.code))
    });
    ranked
        .into_iter()
        .take(limit)
        .map(|(_, entry)| to_match(entry, patient))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_bundled_catalog_loads_sorted_and_complete() {
        let entries = catalog();
        assert!(entries.len() > 12_000, "catalogo incompleto: {}", entries.len());
        assert!(entries.windows(2).all(|w| w[0].code < w[1].code), "debe venir ordenado");
        let manifest: serde_json::Value = serde_json::from_str(CATALOG_MANIFEST).unwrap();
        assert_eq!(manifest["entries"].as_u64().unwrap() as usize, entries.len());
        assert!(manifest["source"]["license"].as_str().unwrap().contains("CC BY 4.0"));
    }

    #[test]
    fn looks_up_codes_written_any_way() {
        let entry = lookup("j45.9").expect("J459 existe");
        assert_eq!(entry.code, "J459");
        assert_eq!(display_code(&entry.code), "J45.9");
        assert!(lookup("Z99.99").is_none());
        assert!(lookup("").is_none());
    }

    #[test]
    fn searches_by_code_first_then_by_name_ignoring_accents() {
        // Las categorias con subdivisiones no vienen en el catalogo oficial: se
        // codifica con la subcategoria (J45.0 ... J45.9).
        let by_code = search("J45", &PatientContext::default(), 10);
        assert_eq!(by_code[0].code, "J450");
        assert!(by_code.iter().all(|m| m.code.starts_with("J45")));
        assert_eq!(search("j45.9", &PatientContext::default(), 10)[0].code, "J459");

        let by_name = search("colera", &PatientContext::default(), 10);
        assert!(by_name.iter().any(|m| m.code == "A009"), "{by_name:?}");
        assert!(by_name[0].name.contains("CÓLERA"));

        let by_words = search("asma alerg", &PatientContext::default(), 10);
        assert!(by_words.iter().any(|m| m.code == "J450"), "{by_words:?}");

        assert!(search("   ", &PatientContext::default(), 10).is_empty());
        assert!(search("zzqqxx", &PatientContext::default(), 10).is_empty());
    }

    #[test]
    fn warns_on_sex_and_age_from_the_official_catalog() {
        let pregnancy = lookup("O800").expect("parto unico espontaneo");
        let man = PatientContext { sex: Some("M".into()), age_days: Some(30 * 365) };
        let warnings = warnings_for(pregnancy, &man);
        assert!(warnings.iter().any(|w| w.contains("mujeres")), "{warnings:?}");

        let girl = PatientContext { sex: Some("F".into()), age_days: Some(5 * 365) };
        let warnings = warnings_for(pregnancy, &girl);
        assert!(warnings.iter().any(|w| w.contains("rango de edad")), "{warnings:?}");

        let adult_woman = PatientContext { sex: Some("F".into()), age_days: Some(30 * 365) };
        assert!(warnings_for(pregnancy, &adult_woman).is_empty());

        let unknown = PatientContext { sex: Some("O".into()), age_days: None };
        assert!(warnings_for(pregnancy, &unknown).is_empty(), "sin datos no se avisa");
    }

    #[test]
    fn warns_when_a_category_is_not_valid_for_outpatient_care() {
        let entry = catalog()
            .iter()
            .find(|e| !e.outpatient)
            .expect("hay categorias no validas en consulta externa");
        let warnings = warnings_for(entry, &PatientContext::default());
        assert!(warnings.iter().any(|w| w.contains("consulta externa")));
    }

    #[test]
    fn reads_sex_and_age_from_the_local_patient() {
        let path = std::env::temp_dir()
            .join("midoc-cie10-tests")
            .join(format!("ctx-{}.db", uuid::Uuid::new_v4()));
        let conn = crate::db::open_encrypted(&path, "frase-de-prueba-123").unwrap();
        conn.execute(
            "INSERT INTO patients (id, first_name, last_name, sex, birth_date, created_at, updated_at)
             VALUES ('p1', 'Ana', 'Ruiz', 'F', '2016-10-06', '2026-01-01', '2026-01-01'),
                    ('p2', 'Sin', 'Datos', NULL, 'no-es-fecha', '2026-01-01', '2026-01-01')",
            [],
        )
        .unwrap();
        let today = chrono::NaiveDate::from_ymd_opt(2026, 10, 6).unwrap();

        let ana = patient_context(&conn, "p1", today).unwrap();
        assert_eq!(ana.sex.as_deref(), Some("F"));
        assert_eq!(ana.age_days, Some(3652), "10 años exactos");

        let unknown = patient_context(&conn, "p2", today).unwrap();
        assert_eq!(unknown.age_days, None);
        assert_eq!(patient_context(&conn, "nadie", today).unwrap().sex, None);
    }

    #[test]
    fn normalizes_free_text() {
        assert_eq!(normalize("  Neumonía,  bacteriana "), "NEUMONIA BACTERIANA");
        assert_eq!(normalize_code(" a18.2 "), "A182");
    }
}
