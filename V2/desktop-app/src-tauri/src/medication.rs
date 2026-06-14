//! Seguridad de medicacion determinista (paso 14, rebanada 1).
//!
//! Resuelve con datos deterministas y auditables —no con IA generativa— la
//! seguridad de la prescripcion: interacciones farmaco-farmaco con severidad,
//! alergias cruzadas contra el expediente y duplicidad terapeutica por clase.
//! Cada alerta cita su fuente. Esto reduce la dependencia de IA y elimina
//! alucinaciones en lo critico (11_recomendaciones_ia_medica.md).
//!
//! Residencia: la base de farmacos/interacciones es REFERENCIA publica (no PHI);
//! las verificaciones corren localmente sobre la prescripcion (CLINICO) y nunca
//! salen del equipo. No se usa la red.
//!
//! Alcance de esta rebanada: la base es un conjunto SEMBRADO representativo de
//! interacciones clinicas conocidas (migracion v13). La importacion real de
//! RxNorm/RxClass (normalizacion/clases), DDInter (interacciones con severidad)
//! y openFDA (texto de respaldo) es una rebanada posterior (paso 14 rebanada 2).

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum MedicationError {
    #[error("error de base de datos: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("{0}")]
    Invalid(String),
}

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

const REFERENCE_VERSION_KEY: &str = "medication_reference_version";

/* ---------- Tipos ---------- */

/// Un medicamento de la prescripcion tras intentar reconocerlo en la base de
/// referencia. Si no se reconoce, se reporta para que el medico lo revise (no
/// se puede verificar lo que no se conoce).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizedDrug {
    /// Lo que escribio el medico.
    pub input: String,
    pub ingredient: Option<String>,
    pub display_name: Option<String>,
    pub drug_class: Option<String>,
    pub recognized: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InteractionAlert {
    pub drug_a: String,
    pub drug_b: String,
    /// CONTRAINDICATED | MAJOR | MODERATE | MINOR.
    pub severity: String,
    pub description: String,
    pub source: String,
    pub source_version: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AllergyAlert {
    pub drug: String,
    /// Termino de alergia del expediente que coincidio.
    pub matched_allergy: String,
    /// Clase por la que coincidio (alergia cruzada). `None` si fue por nombre.
    pub via_class: Option<String>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateTherapyAlert {
    pub drug_a: String,
    pub drug_b: String,
    pub drug_class: String,
}

/// Reporte determinista de seguridad de la prescripcion. Es una ayuda: el
/// criterio final es del medico.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SafetyReport {
    pub normalized: Vec<NormalizedDrug>,
    pub unrecognized: Vec<String>,
    pub interactions: Vec<InteractionAlert>,
    pub allergy_alerts: Vec<AllergyAlert>,
    pub duplicate_therapy: Vec<DuplicateTherapyAlert>,
    pub reference_version: String,
    pub has_alerts: bool,
}

/* ---------- Helpers puros ---------- */

/// Normaliza un nombre para buscarlo: minusculas, sin espacios de sobra.
fn normalize_name(raw: &str) -> String {
    raw.split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

/// Orden canonico de un par de ingredientes (a <= b), para que la interaccion
/// se encuentre sin importar el orden en que el medico escribio los farmacos.
fn canonical_pair(a: &str, b: &str) -> (String, String) {
    if a <= b {
        (a.to_string(), b.to_string())
    } else {
        (b.to_string(), a.to_string())
    }
}

/// Rango de severidad para ordenar (mayor primero) y priorizar en la UI.
fn severity_rank(severity: &str) -> i32 {
    match severity {
        "CONTRAINDICATED" => 4,
        "MAJOR" => 3,
        "MODERATE" => 2,
        "MINOR" => 1,
        _ => 0,
    }
}

/// Separa el texto libre de alergias del expediente en terminos comparables.
/// Conserva frases (separadas por comas, ';', '/' o saltos de linea) y descarta
/// fragmentos demasiado cortos para ser utiles.
fn allergy_tokens(raw: &str) -> Vec<String> {
    raw.split([',', ';', '/', '\n'])
        .map(normalize_name)
        .filter(|part| part.chars().count() >= 4)
        .collect()
}

/// Decide si un termino de alergia coincide con un farmaco. Devuelve:
/// - `None`: sin coincidencia.
/// - `Some(None)`: coincide por nombre del farmaco.
/// - `Some(Some(clase))`: coincide por clase (alergia cruzada).
fn allergy_match(
    display_lc: &str,
    ingredient_lc: &str,
    drug_class: Option<&str>,
    token: &str,
) -> Option<Option<String>> {
    let contains_either = |a: &str, b: &str| !a.is_empty() && !b.is_empty() && (a.contains(b) || b.contains(a));

    if contains_either(token, display_lc) || contains_either(token, ingredient_lc) {
        return Some(None);
    }
    if let Some(class) = drug_class {
        let class_lc = class.to_lowercase();
        if contains_either(token, &class_lc) {
            return Some(Some(class.to_string()));
        }
    }
    None
}

/* ---------- Auditoria ---------- */

fn audit(conn: &Connection, encounter_id: &str, alert_count: usize) -> Result<(), MedicationError> {
    // Solo cuenta de alertas e id del encuentro: nunca nombres de farmacos ni
    // contenido clinico en la bitacora (REGLAS_DESARROLLO.md §4).
    conn.execute(
        "INSERT INTO clinical_audit (entity, entity_id, action, at, details)
         VALUES ('medication_check', ?1, 'checked', ?2, ?3)",
        params![encounter_id, now(), format!("alerts={alert_count}")],
    )?;
    Ok(())
}

fn reference_version(conn: &Connection) -> Result<String, MedicationError> {
    Ok(conn
        .query_row(
            "SELECT value FROM app_meta WHERE key = ?1",
            params![REFERENCE_VERSION_KEY],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .unwrap_or_else(|| "desconocida".to_string()))
}

/* ---------- Servicio ---------- */

/// Verifica una lista de medicamentos contra la base de referencia local y las
/// alergias del expediente. No persiste la prescripcion; solo deja en la
/// bitacora local la cantidad de alertas (sin contenido clinico).
pub fn check_prescription(
    conn: &Connection,
    encounter_id: &str,
    medications: &[String],
    allergies: Option<&str>,
) -> Result<SafetyReport, MedicationError> {
    let cleaned: Vec<String> = medications
        .iter()
        .map(|m| m.trim().to_string())
        .filter(|m| !m.is_empty())
        .collect();
    if cleaned.is_empty() {
        return Err(MedicationError::Invalid(
            "se requiere al menos un medicamento para verificar".into(),
        ));
    }

    // 1. Normalizacion contra la base de referencia.
    let mut normalized: Vec<NormalizedDrug> = Vec::with_capacity(cleaned.len());
    for input in &cleaned {
        let key = normalize_name(input);
        let found: Option<(String, String, Option<String>)> = conn
            .query_row(
                "SELECT ingredient, display_name, drug_class
                 FROM medication_reference WHERE name = ?1",
                params![key],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .optional()?;
        normalized.push(match found {
            Some((ingredient, display_name, drug_class)) => NormalizedDrug {
                input: input.clone(),
                ingredient: Some(ingredient),
                display_name: Some(display_name),
                drug_class,
                recognized: true,
            },
            None => NormalizedDrug {
                input: input.clone(),
                ingredient: None,
                display_name: None,
                drug_class: None,
                recognized: false,
            },
        });
    }
    let unrecognized: Vec<String> = normalized
        .iter()
        .filter(|drug| !drug.recognized)
        .map(|drug| drug.input.clone())
        .collect();

    let recognized: Vec<&NormalizedDrug> = normalized.iter().filter(|drug| drug.recognized).collect();

    // 2. Interacciones farmaco-farmaco (pares de ingredientes distintos).
    let mut interactions: Vec<InteractionAlert> = Vec::new();
    for i in 0..recognized.len() {
        for j in (i + 1)..recognized.len() {
            let ingredient_a = recognized[i].ingredient.as_deref().unwrap_or_default();
            let ingredient_b = recognized[j].ingredient.as_deref().unwrap_or_default();
            if ingredient_a == ingredient_b {
                continue;
            }
            let (a, b) = canonical_pair(ingredient_a, ingredient_b);
            let row: Option<(String, String, String, String)> = conn
                .query_row(
                    "SELECT severity, description, source, source_version
                     FROM drug_interactions WHERE ingredient_a = ?1 AND ingredient_b = ?2",
                    params![a, b],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
                )
                .optional()?;
            if let Some((severity, description, source, source_version)) = row {
                interactions.push(InteractionAlert {
                    drug_a: recognized[i].display_name.clone().unwrap_or_default(),
                    drug_b: recognized[j].display_name.clone().unwrap_or_default(),
                    severity,
                    description,
                    source,
                    source_version,
                });
            }
        }
    }
    interactions.sort_by_key(|alert| std::cmp::Reverse(severity_rank(&alert.severity)));

    // 3. Alergias cruzadas contra el expediente.
    let tokens = allergy_tokens(allergies.unwrap_or(""));
    let mut allergy_alerts: Vec<AllergyAlert> = Vec::new();
    for drug in &recognized {
        let display_lc = drug.display_name.as_deref().unwrap_or_default().to_lowercase();
        let ingredient_lc = drug.ingredient.as_deref().unwrap_or_default().to_lowercase();
        for token in &tokens {
            if let Some(via_class) =
                allergy_match(&display_lc, &ingredient_lc, drug.drug_class.as_deref(), token)
            {
                allergy_alerts.push(AllergyAlert {
                    drug: drug.display_name.clone().unwrap_or_default(),
                    matched_allergy: token.clone(),
                    via_class,
                    source: "Alergias registradas en el expediente".into(),
                });
                break; // una alerta por farmaco basta para avisar.
            }
        }
    }

    // 4. Duplicidad terapeutica (misma clase, ingredientes distintos).
    let mut duplicate_therapy: Vec<DuplicateTherapyAlert> = Vec::new();
    for i in 0..recognized.len() {
        for j in (i + 1)..recognized.len() {
            let (class_i, class_j) = (
                recognized[i].drug_class.as_deref(),
                recognized[j].drug_class.as_deref(),
            );
            if let (Some(class_i), Some(class_j)) = (class_i, class_j) {
                if !class_i.is_empty()
                    && class_i.eq_ignore_ascii_case(class_j)
                    && recognized[i].ingredient != recognized[j].ingredient
                {
                    duplicate_therapy.push(DuplicateTherapyAlert {
                        drug_a: recognized[i].display_name.clone().unwrap_or_default(),
                        drug_b: recognized[j].display_name.clone().unwrap_or_default(),
                        drug_class: class_i.to_string(),
                    });
                }
            }
        }
    }

    let has_alerts =
        !interactions.is_empty() || !allergy_alerts.is_empty() || !duplicate_therapy.is_empty();
    let alert_count = interactions.len() + allergy_alerts.len() + duplicate_therapy.len();
    audit(conn, encounter_id, alert_count)?;

    Ok(SafetyReport {
        normalized,
        unrecognized,
        interactions,
        allergy_alerts,
        duplicate_therapy,
        reference_version: reference_version(conn)?,
        has_alerts,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_encrypted;

    fn test_conn(name: &str) -> Connection {
        let dir = std::env::temp_dir().join("midoc-medication-tests");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(format!("{name}-{}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        open_encrypted(&path, "clave-de-prueba").unwrap()
    }

    fn meds(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn canonical_pair_is_order_independent() {
        assert_eq!(canonical_pair("warfarina", "ibuprofeno"), canonical_pair("ibuprofeno", "warfarina"));
    }

    #[test]
    fn allergy_match_by_class_is_cross_reactive() {
        // "penicilina" coincide con la clase "Penicilina" de la amoxicilina.
        assert_eq!(
            allergy_match("amoxicilina", "amoxicilina", Some("Penicilina"), "penicilina"),
            Some(Some("Penicilina".to_string()))
        );
        // Coincidencia por nombre directo.
        assert_eq!(allergy_match("ibuprofeno", "ibuprofeno", Some("AINE"), "ibuprofeno"), Some(None));
        // Sin coincidencia.
        assert_eq!(allergy_match("paracetamol", "paracetamol", Some("Analgesico"), "penicilina"), None);
    }

    #[test]
    fn recognizes_seeded_drug_and_flags_unknown() {
        let conn = test_conn("recognize");
        let report = check_prescription(&conn, "enc-1", &meds(&["Ibuprofeno", "Farmaco Inventado"]), None).unwrap();
        assert_eq!(report.unrecognized, vec!["Farmaco Inventado".to_string()]);
        let ibuprofeno = report.normalized.iter().find(|d| d.recognized).unwrap();
        assert_eq!(ibuprofeno.drug_class.as_deref(), Some("AINE"));
        assert_eq!(report.reference_version, "seed-v1");
    }

    #[test]
    fn detects_major_interaction_with_source_regardless_of_order() {
        let conn = test_conn("interaction");
        let forward = check_prescription(&conn, "enc-1", &meds(&["Ibuprofeno", "Warfarina"]), None).unwrap();
        let backward = check_prescription(&conn, "enc-1", &meds(&["Warfarina", "Ibuprofeno"]), None).unwrap();
        assert_eq!(forward.interactions.len(), 1);
        assert_eq!(backward.interactions.len(), 1);
        let alert = &forward.interactions[0];
        assert_eq!(alert.severity, "MAJOR");
        assert!(!alert.source.is_empty());
        assert_eq!(alert.source_version, "seed-v1");
        assert!(forward.has_alerts);
    }

    #[test]
    fn detects_contraindicated_interaction() {
        let conn = test_conn("contraindicated");
        let report = check_prescription(&conn, "enc-1", &meds(&["Sildenafil", "Nitroglicerina"]), None).unwrap();
        assert_eq!(report.interactions.len(), 1);
        assert_eq!(report.interactions[0].severity, "CONTRAINDICATED");
    }

    #[test]
    fn detects_allergy_cross_class() {
        let conn = test_conn("allergy");
        let report = check_prescription(&conn, "enc-1", &meds(&["Amoxicilina"]), Some("Penicilina")).unwrap();
        assert_eq!(report.allergy_alerts.len(), 1);
        assert_eq!(report.allergy_alerts[0].via_class.as_deref(), Some("Penicilina"));
    }

    #[test]
    fn detects_duplicate_therapy_same_class() {
        let conn = test_conn("duplicate");
        let report = check_prescription(&conn, "enc-1", &meds(&["Ibuprofeno", "Naproxeno"]), None).unwrap();
        assert_eq!(report.duplicate_therapy.len(), 1);
        assert_eq!(report.duplicate_therapy[0].drug_class, "AINE");
    }

    #[test]
    fn safe_combination_has_no_alerts() {
        let conn = test_conn("safe");
        let report = check_prescription(&conn, "enc-1", &meds(&["Paracetamol", "Amoxicilina"]), Some("Polen")).unwrap();
        assert!(report.interactions.is_empty());
        assert!(report.allergy_alerts.is_empty());
        assert!(report.duplicate_therapy.is_empty());
        assert!(!report.has_alerts);
    }

    #[test]
    fn empty_medication_list_is_rejected() {
        let conn = test_conn("empty");
        assert!(matches!(
            check_prescription(&conn, "enc-1", &meds(&["   ", ""]), None),
            Err(MedicationError::Invalid(_))
        ));
    }

    #[test]
    fn check_is_audited_without_clinical_content() {
        let conn = test_conn("audit");
        check_prescription(&conn, "enc-77", &meds(&["Ibuprofeno", "Warfarina"]), None).unwrap();
        let (entity_id, details): (String, String) = conn
            .query_row(
                "SELECT entity_id, details FROM clinical_audit WHERE entity = 'medication_check' ORDER BY id DESC LIMIT 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(entity_id, "enc-77");
        assert_eq!(details, "alerts=1");
        // La bitacora no contiene nombres de farmacos.
        assert!(!details.to_lowercase().contains("warfarina"));
    }
}
