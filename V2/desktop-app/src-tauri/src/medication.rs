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

/// Nota informativa de respaldo (openFDA): cuando no hay una interaccion
/// estructurada (DDInter) para un par, pero la etiqueta FDA de uno de los
/// farmacos menciona al otro. Es evidencia para consultar, no una alerta dura.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LabelNote {
    pub drug_a: String,
    pub drug_b: String,
    pub text: String,
    pub source: String,
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
    /// Respaldo informativo de openFDA (no cuenta como alerta dura).
    pub label_notes: Vec<LabelNote>,
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
    let mut structured_pairs: std::collections::HashSet<(String, String)> =
        std::collections::HashSet::new();
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
                structured_pairs.insert((a, b));
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

    // 5. Respaldo openFDA: para pares SIN interaccion estructurada, si la
    // etiqueta FDA de un farmaco menciona al otro, se ofrece como evidencia.
    let mut label_notes: Vec<LabelNote> = Vec::new();
    for i in 0..recognized.len() {
        for j in (i + 1)..recognized.len() {
            let ing_i = recognized[i].ingredient.as_deref().unwrap_or_default();
            let ing_j = recognized[j].ingredient.as_deref().unwrap_or_default();
            if ing_i == ing_j {
                continue;
            }
            let (a, b) = canonical_pair(ing_i, ing_j);
            if structured_pairs.contains(&(a, b)) {
                continue; // ya hay interaccion estructurada (DDInter/sembrada)
            }
            if let Some(note) = label_fallback(conn, recognized[i], recognized[j])? {
                label_notes.push(note);
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
        label_notes,
        reference_version: reference_version(conn)?,
        has_alerts,
    })
}

/// Texto de etiqueta (openFDA) de un ingrediente, si existe.
fn label_text(conn: &Connection, ingredient: &str) -> Result<Option<(String, String)>, MedicationError> {
    conn.query_row(
        "SELECT interactions_text, source FROM drug_label_text WHERE ingredient = ?1",
        params![ingredient],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
    )
    .optional()
    .map_err(MedicationError::from)
}

/// Busca una nota de respaldo para un par sin interaccion estructurada: si la
/// etiqueta de uno menciona al otro (por ingrediente), la devuelve.
fn label_fallback(
    conn: &Connection,
    drug_a: &NormalizedDrug,
    drug_b: &NormalizedDrug,
) -> Result<Option<LabelNote>, MedicationError> {
    let ing_a = drug_a.ingredient.as_deref().unwrap_or_default();
    let ing_b = drug_b.ingredient.as_deref().unwrap_or_default();
    let display_a = drug_a.display_name.clone().unwrap_or_default();
    let display_b = drug_b.display_name.clone().unwrap_or_default();

    if let Some((text, source)) = label_text(conn, ing_a)? {
        if find_word(&text.to_lowercase(), ing_b).is_some() {
            return Ok(Some(LabelNote { drug_a: display_a, drug_b: display_b, text, source }));
        }
    }
    if let Some((text, source)) = label_text(conn, ing_b)? {
        if find_word(&text.to_lowercase(), ing_a).is_some() {
            return Ok(Some(LabelNote { drug_a: display_b, drug_b: display_a, text, source }));
        }
    }
    Ok(None)
}

/* ---------- Importacion de datos reales (rebanada 2) ---------- */

/// Fila de la base de medicamentos (derivable de exportaciones de RxNorm/RxClass).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MedicationRow {
    pub name: String,
    pub ingredient: String,
    pub display_name: String,
    pub drug_class: Option<String>,
}

/// Fila de interaccion (par canonico) lista para cargar.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InteractionRow {
    pub ingredient_a: String,
    pub ingredient_b: String,
    pub severity: String,
    pub description: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    pub medications: usize,
    pub interactions: usize,
    pub labels: usize,
    pub version: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceStatus {
    pub version: String,
    pub medications: i64,
    pub interactions: i64,
    pub labels: i64,
}

/// Fila de texto de etiqueta (openFDA): interacciones declaradas en la etiqueta
/// FDA de un ingrediente.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LabelRow {
    pub ingredient: String,
    pub interactions_text: String,
}

/// Separa una linea CSV simple (sin comillas con comas embebidas), recortando.
fn csv_fields(line: &str) -> Vec<&str> {
    line.split(',').map(|field| field.trim()).collect()
}

/// Parsea un CSV de medicamentos con columnas: name,ingredient,display_name,drug_class.
/// Si la primera linea es encabezado (`name,...`) se omite. Tolerante a clase vacia.
pub fn parse_medication_csv(csv: &str) -> Result<Vec<MedicationRow>, MedicationError> {
    let mut rows = Vec::new();
    for (idx, line) in csv.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let fields = csv_fields(line);
        if idx == 0
            && fields
                .first()
                .map(|f| f.eq_ignore_ascii_case("name"))
                .unwrap_or(false)
        {
            continue; // encabezado
        }
        if fields.len() < 3 {
            return Err(MedicationError::Invalid(format!(
                "fila {} del CSV de medicamentos invalida: se esperaban al menos 3 columnas",
                idx + 1
            )));
        }
        let name = normalize_name(fields[0]);
        let ingredient = normalize_name(fields[1]);
        if name.is_empty() || ingredient.is_empty() {
            continue;
        }
        let display_name = {
            let d = fields[2].trim();
            if d.is_empty() {
                fields[0].trim().to_string()
            } else {
                d.to_string()
            }
        };
        let drug_class = fields
            .get(3)
            .map(|c| c.trim().to_string())
            .filter(|c| !c.is_empty());
        rows.push(MedicationRow {
            name,
            ingredient,
            display_name,
            drug_class,
        });
    }
    Ok(rows)
}

/// Mapea el nivel de DDInter a nuestra severidad.
fn ddinter_severity(level: &str) -> &'static str {
    match level.trim().to_lowercase().as_str() {
        "contraindicated" | "contraindication" => "CONTRAINDICATED",
        "major" => "MAJOR",
        "moderate" => "MODERATE",
        "minor" => "MINOR",
        _ => "UNKNOWN",
    }
}

/// Parsea el CSV de DDInter (columnas: DDInterID_A,Drug_A,DDInterID_B,Drug_B,Level).
/// Cada interaccion se guarda con el par de ingredientes en orden canonico.
pub fn parse_ddinter_csv(csv: &str) -> Result<Vec<InteractionRow>, MedicationError> {
    let mut rows = Vec::new();
    for (idx, line) in csv.lines().enumerate() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if idx == 0 && line.to_lowercase().contains("drug_a") {
            continue; // encabezado
        }
        let fields = csv_fields(line);
        if fields.len() < 5 {
            return Err(MedicationError::Invalid(format!(
                "fila {} del CSV de DDInter invalida: se esperaban 5 columnas",
                idx + 1
            )));
        }
        let drug_a = normalize_name(fields[1]);
        let drug_b = normalize_name(fields[3]);
        if drug_a.is_empty() || drug_b.is_empty() || drug_a == drug_b {
            continue;
        }
        let (ingredient_a, ingredient_b) = canonical_pair(&drug_a, &drug_b);
        let level = fields[4].trim();
        rows.push(InteractionRow {
            ingredient_a,
            ingredient_b,
            severity: ddinter_severity(level).to_string(),
            description: format!("Interaccion {level} segun DDInter."),
            source: "DDInter 2.0".into(),
        });
    }
    Ok(rows)
}

/// Reemplaza la base de referencia local con los datos importados, dentro de una
/// transaccion (no deja las tablas a medio reemplazar). Si una lista viene vacia,
/// no se toca esa tabla. Siempre actualiza la version de la base.
pub fn import_reference(
    conn: &Connection,
    medications: &[MedicationRow],
    interactions: &[InteractionRow],
    version: &str,
) -> Result<ImportSummary, MedicationError> {
    let version = version.trim();
    if version.is_empty() {
        return Err(MedicationError::Invalid(
            "la version de la base no puede estar vacia".into(),
        ));
    }
    let tx = conn.unchecked_transaction()?;
    if !medications.is_empty() {
        tx.execute("DELETE FROM medication_reference", [])?;
        for medication in medications {
            tx.execute(
                "INSERT OR REPLACE INTO medication_reference (name, ingredient, display_name, drug_class)
                 VALUES (?1, ?2, ?3, ?4)",
                params![
                    medication.name,
                    medication.ingredient,
                    medication.display_name,
                    medication.drug_class
                ],
            )?;
        }
    }
    if !interactions.is_empty() {
        tx.execute("DELETE FROM drug_interactions", [])?;
        for interaction in interactions {
            tx.execute(
                "INSERT OR IGNORE INTO drug_interactions
                    (ingredient_a, ingredient_b, severity, description, source, source_version)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    interaction.ingredient_a,
                    interaction.ingredient_b,
                    interaction.severity,
                    interaction.description,
                    interaction.source,
                    version
                ],
            )?;
        }
    }
    tx.execute(
        "INSERT INTO app_meta (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = ?2",
        params![REFERENCE_VERSION_KEY, version],
    )?;
    tx.commit()?;
    Ok(ImportSummary {
        medications: medications.len(),
        interactions: interactions.len(),
        labels: 0,
        version: version.to_string(),
    })
}

/// Parsea el JSON de la API de etiquetas de openFDA (drug/label). Extrae, por
/// cada ingrediente (`openfda.generic_name`), el texto de interacciones
/// (`drug_interactions`). Tolerante a campos ausentes.
pub fn parse_openfda_labels(json: &str) -> Result<Vec<LabelRow>, MedicationError> {
    if json.trim().is_empty() {
        return Ok(Vec::new());
    }
    let parsed: serde_json::Value = serde_json::from_str(json)
        .map_err(|e| MedicationError::Invalid(format!("JSON de openFDA invalido: {e}")))?;
    let results = match parsed.get("results").and_then(|r| r.as_array()) {
        Some(results) => results,
        None => return Ok(Vec::new()),
    };

    let mut rows = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    for result in results {
        let interactions_text = result
            .get("drug_interactions")
            .and_then(|v| v.as_array())
            .map(|parts| {
                parts
                    .iter()
                    .filter_map(|p| p.as_str())
                    .collect::<Vec<_>>()
                    .join(" ")
            })
            .unwrap_or_default();
        if interactions_text.trim().is_empty() {
            continue;
        }
        let generic_names = result
            .get("openfda")
            .and_then(|o| o.get("generic_name"))
            .and_then(|v| v.as_array());
        if let Some(names) = generic_names {
            for name in names.iter().filter_map(|n| n.as_str()) {
                let ingredient = normalize_name(name);
                if ingredient.is_empty() || !seen.insert(ingredient.clone()) {
                    continue;
                }
                rows.push(LabelRow {
                    ingredient,
                    interactions_text: interactions_text.clone(),
                });
            }
        }
    }
    Ok(rows)
}

/// Reemplaza el texto de etiquetas (openFDA) con los datos importados.
pub fn import_label_text(
    conn: &Connection,
    labels: &[LabelRow],
    version: &str,
) -> Result<usize, MedicationError> {
    if labels.is_empty() {
        return Ok(0);
    }
    let tx = conn.unchecked_transaction()?;
    tx.execute("DELETE FROM drug_label_text", [])?;
    for label in labels {
        tx.execute(
            "INSERT OR REPLACE INTO drug_label_text (ingredient, interactions_text, source, source_version)
             VALUES (?1, ?2, 'openFDA', ?3)",
            params![label.ingredient, label.interactions_text, version],
        )?;
    }
    tx.commit()?;
    Ok(labels.len())
}

/// Datos crudos de una actualizacion (CSV ya descargados, sin parsear). La
/// descarga HTTP vive en la capa de transporte (comando); aqui solo se vetta,
/// versiona e importa, para que el nucleo sea testeable sin red.
#[derive(Debug, Clone)]
pub struct MedicationDataset {
    pub medications_csv: String,
    pub ddinter_csv: String,
    pub openfda_json: String,
    pub version: String,
}

/// Minimos de cordura por defecto: una descarga truncada o corrupta no debe
/// poder reemplazar (y degradar) una base buena. Si una lista viene con datos
/// pero por debajo del minimo, se aborta la actualizacion completa.
pub const MIN_MEDICATIONS: usize = 5;
pub const MIN_INTERACTIONS: usize = 5;
pub const BUNDLED_REFERENCE_VERSION: &str = "midoc-real-2026-06-14";

const BUNDLED_MEDICATIONS_CSV: &str = include_str!("reference_data/medications.csv");
const BUNDLED_DDINTER_CSV: &str = include_str!("reference_data/ddinter.csv");
const BUNDLED_OPENFDA_JSON: &str = include_str!("reference_data/openfda.json");

pub fn bundled_reference_dataset() -> MedicationDataset {
    MedicationDataset {
        medications_csv: BUNDLED_MEDICATIONS_CSV.to_string(),
        ddinter_csv: BUNDLED_DDINTER_CSV.to_string(),
        openfda_json: BUNDLED_OPENFDA_JSON.to_string(),
        version: BUNDLED_REFERENCE_VERSION.to_string(),
    }
}

pub fn install_bundled_reference(conn: &Connection) -> Result<ImportSummary, MedicationError> {
    let dataset = bundled_reference_dataset();
    update_reference(conn, &dataset, MIN_MEDICATIONS, MIN_INTERACTIONS)
}

/// Version sembrada por la migracion v13 (paso 14, rebanada 1). Marca que el
/// catalogo real empaquetado aun no se ha instalado.
pub const SEED_REFERENCE_VERSION: &str = "seed-v1";

/// Instala el catalogo real empaquetado en el primer arranque: cuando la base
/// sigue en la version sembrada (`seed-v1`), la reemplaza por el catalogo
/// curado de MiDoc. Idempotente y respetuoso: si el medico ya instalo o
/// actualizo el catalogo (otra version), no lo sobreescribe. Devuelve `true`
/// si instalo el catalogo en esta llamada.
pub fn ensure_bundled_reference_installed(conn: &Connection) -> Result<bool, MedicationError> {
    if reference_version(conn)? == SEED_REFERENCE_VERSION {
        install_bundled_reference(conn)?;
        Ok(true)
    } else {
        Ok(false)
    }
}

/// Aplica una actualizacion de la base desde datos descargados: parsea, **vetta**
/// (rechaza descargas vacias o sospechosamente pequenas para no degradar la base
/// actual) y luego importa de forma transaccional con su version. La verificacion
/// de cada receta sigue siendo local; el servicio externo solo regenera la base.
pub fn update_reference(
    conn: &Connection,
    dataset: &MedicationDataset,
    min_medications: usize,
    min_interactions: usize,
) -> Result<ImportSummary, MedicationError> {
    let medications = parse_medication_csv(&dataset.medications_csv)?;
    let interactions = parse_ddinter_csv(&dataset.ddinter_csv)?;

    if medications.is_empty() && interactions.is_empty() {
        return Err(MedicationError::Invalid(
            "la fuente no devolvio datos de medicamentos ni de interacciones".into(),
        ));
    }
    if !medications.is_empty() && medications.len() < min_medications {
        return Err(MedicationError::Invalid(format!(
            "la base descargada trae muy pocos medicamentos ({}); se aborta para no degradar la base actual",
            medications.len()
        )));
    }
    if !interactions.is_empty() && interactions.len() < min_interactions {
        return Err(MedicationError::Invalid(format!(
            "la base descargada trae muy pocas interacciones ({}); se aborta para no degradar la base actual",
            interactions.len()
        )));
    }

    let mut summary = import_reference(conn, &medications, &interactions, &dataset.version)?;
    // El texto de etiquetas (openFDA) es respaldo informativo: sin minimo de
    // cordura. Solo se reemplaza si la fuente trajo datos.
    let labels = parse_openfda_labels(&dataset.openfda_json)?;
    summary.labels = import_label_text(conn, &labels, &dataset.version)?;
    Ok(summary)
}

pub fn reference_status(conn: &Connection) -> Result<ReferenceStatus, MedicationError> {
    let medications: i64 =
        conn.query_row("SELECT count(*) FROM medication_reference", [], |row| row.get(0))?;
    let interactions: i64 =
        conn.query_row("SELECT count(*) FROM drug_interactions", [], |row| row.get(0))?;
    let labels: i64 =
        conn.query_row("SELECT count(*) FROM drug_label_text", [], |row| row.get(0))?;
    Ok(ReferenceStatus {
        version: reference_version(conn)?,
        medications,
        interactions,
        labels,
    })
}

/// Busca `needle` dentro de `haystack` respetando limites de palabra (para no
/// confundir, p. ej., "litio" dentro de otra palabra). Devuelve la posicion.
fn find_word(haystack: &str, needle: &str) -> Option<usize> {
    if needle.is_empty() {
        return None;
    }
    let mut start = 0;
    while let Some(rel) = haystack[start..].find(needle) {
        let pos = start + rel;
        let before_ok = pos == 0
            || !haystack[..pos]
                .chars()
                .next_back()
                .map(|c| c.is_alphanumeric())
                .unwrap_or(false);
        let after = pos + needle.len();
        let after_ok = after >= haystack.len()
            || !haystack[after..]
                .chars()
                .next()
                .map(|c| c.is_alphanumeric())
                .unwrap_or(false);
        if before_ok && after_ok {
            return Some(pos);
        }
        start = pos + needle.len();
    }
    None
}

/// Extrae los nombres de medicamentos reconocidos del texto libre de la receta,
/// en el orden en que aparecen, sin duplicar. Asi el medico no tiene que volver
/// a escribir la lista para verificarla.
pub fn extract_medications(conn: &Connection, text: &str) -> Result<Vec<String>, MedicationError> {
    let haystack = normalize_name(text);
    if haystack.is_empty() {
        return Ok(Vec::new());
    }
    // Nombres mas largos primero, para preferir "acido acetilsalicilico" sobre
    // un fragmento mas corto.
    let mut statement = conn.prepare(
        "SELECT name, display_name FROM medication_reference ORDER BY length(name) DESC",
    )?;
    let reference = statement
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?
        .collect::<Result<Vec<_>, _>>()?;

    let mut hits: Vec<(usize, String)> = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();
    for (name, display_name) in reference {
        if let Some(pos) = find_word(&haystack, &name) {
            if seen.insert(display_name.clone()) {
                hits.push((pos, display_name));
            }
        }
    }
    hits.sort_by_key(|(pos, _)| *pos);
    Ok(hits.into_iter().map(|(_, display_name)| display_name).collect())
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

    /* ---------- Rebanada 2: importacion y extraccion ---------- */

    #[test]
    fn parses_medication_csv_with_header_and_optional_class() {
        let csv = "name,ingredient,display_name,drug_class\n\
                   Metoprolol,metoprolol,Metoprolol,Betabloqueador\n\
                   Vitamina C,acido ascorbico,Vitamina C,\n";
        let rows = parse_medication_csv(csv).unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].name, "metoprolol");
        assert_eq!(rows[0].drug_class.as_deref(), Some("Betabloqueador"));
        assert_eq!(rows[1].drug_class, None); // clase vacia -> None
    }

    #[test]
    fn parses_ddinter_csv_and_maps_severity_in_canonical_order() {
        let csv = "DDInterID_A,Drug_A,DDInterID_B,Drug_B,Level\n\
                   DDInter1,Warfarina,DDInter2,Aspirina,Major\n\
                   DDInter3,Metoprolol,DDInter4,Verapamilo,Moderate\n";
        let rows = parse_ddinter_csv(csv).unwrap();
        assert_eq!(rows.len(), 2);
        // Orden canonico: aspirina < warfarina.
        assert_eq!(rows[0].ingredient_a, "aspirina");
        assert_eq!(rows[0].ingredient_b, "warfarina");
        assert_eq!(rows[0].severity, "MAJOR");
        assert_eq!(rows[0].source, "DDInter 2.0");
        assert_eq!(rows[1].severity, "MODERATE");
    }

    #[test]
    fn import_replaces_reference_and_bumps_version() {
        let conn = test_conn("import");
        let medication_rows = vec![
            MedicationRow { name: "metoprolol".into(), ingredient: "metoprolol".into(), display_name: "Metoprolol".into(), drug_class: Some("Betabloqueador".into()) },
            MedicationRow { name: "verapamilo".into(), ingredient: "verapamilo".into(), display_name: "Verapamilo".into(), drug_class: Some("Calcioantagonista".into()) },
        ];
        let interactions = vec![InteractionRow {
            ingredient_a: "metoprolol".into(),
            ingredient_b: "verapamilo".into(),
            severity: "MAJOR".into(),
            description: "Riesgo de bradicardia/bloqueo.".into(),
            source: "DDInter 2.0".into(),
        }];

        let summary = import_reference(&conn, &medication_rows, &interactions, "ddinter-2026-06").unwrap();
        assert_eq!(summary.medications, 2);
        assert_eq!(summary.interactions, 1);

        let status = reference_status(&conn).unwrap();
        assert_eq!(status.version, "ddinter-2026-06");
        assert_eq!(status.medications, 2); // reemplazo: el dataset sembrado ya no esta
        assert_eq!(status.interactions, 1);

        // La verificacion usa ya los datos importados (y no los sembrados).
        let report = check_prescription(&conn, "enc-1", &meds(&["Metoprolol", "Verapamilo"]), None).unwrap();
        assert_eq!(report.interactions.len(), 1);
        assert_eq!(report.interactions[0].severity, "MAJOR");
        assert_eq!(report.reference_version, "ddinter-2026-06");
        // Ibuprofeno ya no se reconoce tras el reemplazo.
        let gone = check_prescription(&conn, "enc-1", &meds(&["Ibuprofeno"]), None).unwrap();
        assert_eq!(gone.unrecognized, vec!["Ibuprofeno".to_string()]);
    }

    #[test]
    fn import_rejects_empty_version() {
        let conn = test_conn("import-empty-version");
        assert!(matches!(
            import_reference(&conn, &[], &[], "  "),
            Err(MedicationError::Invalid(_))
        ));
    }

    #[test]
    fn extracts_known_drugs_from_prescription_text_in_order() {
        let conn = test_conn("extract"); // base sembrada
        let text = "1) Ibuprofeno 400 mg cada 8 h\n2) Amoxicilina 500 mg cada 8 h\nReposo.";
        let found = extract_medications(&conn, text).unwrap();
        assert_eq!(found, vec!["Ibuprofeno".to_string(), "Amoxicilina".to_string()]);
    }

    #[test]
    fn extraction_respects_word_boundaries_and_dedupes() {
        let conn = test_conn("extract-bounds");
        // "litioxido" no debe contar como "litio"; "Ibuprofeno" repetido no duplica.
        let text = "litioxido no contiene el ingrediente. Ibuprofeno. Ibuprofeno de nuevo.";
        let found = extract_medications(&conn, text).unwrap();
        assert_eq!(found, vec!["Ibuprofeno".to_string()]);
    }

    /* ---------- Rebanada 3: pipeline de actualizacion ---------- */

    fn dataset(med_rows: usize, int_rows: usize, version: &str) -> MedicationDataset {
        let mut meds = String::from("name,ingredient,display_name,drug_class\n");
        for i in 0..med_rows {
            meds.push_str(&format!("farmaco{i},ingrediente{i},Farmaco {i},Clase {i}\n"));
        }
        let mut ddinter = String::from("DDInterID_A,Drug_A,DDInterID_B,Drug_B,Level\n");
        for i in 0..int_rows {
            ddinter.push_str(&format!("A{i},ingrediente{i},B{i},ingrediente{},Major\n", i + 1));
        }
        MedicationDataset {
            medications_csv: meds,
            ddinter_csv: ddinter,
            openfda_json: String::new(),
            version: version.to_string(),
        }
    }

    #[test]
    fn update_applies_a_healthy_dataset_and_versions_it() {
        let conn = test_conn("update-ok");
        let summary = update_reference(&conn, &dataset(8, 6, "ddinter-2026-07"), MIN_MEDICATIONS, MIN_INTERACTIONS).unwrap();
        assert_eq!(summary.medications, 8);
        assert_eq!(summary.interactions, 6);
        let status = reference_status(&conn).unwrap();
        assert_eq!(status.version, "ddinter-2026-07");
        assert_eq!(status.medications, 8);
    }

    #[test]
    fn update_rejects_a_suspiciously_small_dataset_to_protect_the_base() {
        let conn = test_conn("update-small");
        // Base sembrada vigente; una descarga truncada (2 meds) no debe reemplazarla.
        let before = reference_status(&conn).unwrap();
        assert!(matches!(
            update_reference(&conn, &dataset(2, 6, "corrupta"), MIN_MEDICATIONS, MIN_INTERACTIONS),
            Err(MedicationError::Invalid(_))
        ));
        let after = reference_status(&conn).unwrap();
        assert_eq!(after.version, before.version); // intacta
        assert_eq!(after.medications, before.medications);
    }

    /* ---------- Rebanada 4: respaldo openFDA ---------- */

    const OPENFDA_SAMPLE: &str = r#"{
      "results": [
        {
          "openfda": { "generic_name": ["Paracetamol"] },
          "drug_interactions": ["Puede potenciar el efecto de la warfarina con uso prolongado."]
        },
        {
          "openfda": { "generic_name": ["Cafeina"] },
          "drug_interactions": []
        }
      ]
    }"#;

    #[test]
    fn parses_openfda_labels_skipping_empty_interactions() {
        let rows = parse_openfda_labels(OPENFDA_SAMPLE).unwrap();
        assert_eq!(rows.len(), 1); // la cafeina se omite (sin texto)
        assert_eq!(rows[0].ingredient, "paracetamol");
        assert!(rows[0].interactions_text.to_lowercase().contains("warfarina"));
    }

    #[test]
    fn label_note_appears_only_when_no_structured_pair_and_label_mentions_the_other() {
        let conn = test_conn("label-fallback");
        let labels = parse_openfda_labels(OPENFDA_SAMPLE).unwrap();
        import_label_text(&conn, &labels, "openfda-2026-06").unwrap();

        // Paracetamol + Warfarina: no hay interaccion estructurada sembrada para
        // ese par, pero la etiqueta del paracetamol menciona warfarina.
        let report = check_prescription(&conn, "enc-1", &meds(&["Paracetamol", "Warfarina"]), None).unwrap();
        assert!(report.interactions.is_empty(), "no debe haber interaccion estructurada");
        assert_eq!(report.label_notes.len(), 1);
        assert_eq!(report.label_notes[0].source, "openFDA");
        assert_eq!(report.label_notes[0].drug_a, "Paracetamol");
        assert_eq!(report.label_notes[0].drug_b, "Warfarina");
        // No cuenta como alerta dura.
        assert!(!report.has_alerts);
    }

    #[test]
    fn structured_interaction_suppresses_label_note() {
        let conn = test_conn("label-suppressed");
        // Etiqueta del ibuprofeno que menciona warfarina.
        let labels = vec![LabelRow {
            ingredient: "ibuprofeno".into(),
            interactions_text: "Evitar con warfarina por riesgo de sangrado.".into(),
        }];
        import_label_text(&conn, &labels, "openfda-2026-06").unwrap();
        // Ibuprofeno + Warfarina YA tiene interaccion estructurada (sembrada),
        // asi que NO debe duplicarse como nota de etiqueta.
        let report = check_prescription(&conn, "enc-1", &meds(&["Ibuprofeno", "Warfarina"]), None).unwrap();
        assert_eq!(report.interactions.len(), 1);
        assert!(report.label_notes.is_empty());
    }

    #[test]
    fn update_rejects_empty_source() {
        let conn = test_conn("update-empty");
        let empty = MedicationDataset { medications_csv: String::new(), ddinter_csv: String::new(), openfda_json: String::new(), version: "x".into() };
        assert!(matches!(
            update_reference(&conn, &empty, MIN_MEDICATIONS, MIN_INTERACTIONS),
            Err(MedicationError::Invalid(_))
        ));
    }

    /* ---------- Rebanada 5: catalogo MiDoc empaquetado ---------- */

    #[test]
    fn bundled_reference_installs_curated_dataset_without_network() {
        let conn = test_conn("bundled-reference");
        let summary = install_bundled_reference(&conn).unwrap();

        assert!(summary.medications >= MIN_MEDICATIONS);
        assert!(summary.interactions >= MIN_INTERACTIONS);
        assert!(summary.labels > 0);
        assert_eq!(summary.version, BUNDLED_REFERENCE_VERSION);

        let status = reference_status(&conn).unwrap();
        assert_eq!(status.version, BUNDLED_REFERENCE_VERSION);
        assert_eq!(status.medications, summary.medications as i64);
        assert_eq!(status.interactions, summary.interactions as i64);
        assert_eq!(status.labels, summary.labels as i64);
    }

    #[test]
    fn first_run_installs_bundled_catalog_then_is_idempotent() {
        let conn = test_conn("first-run-bundled");
        // Recien migrada: la base esta en la version sembrada.
        assert_eq!(reference_version(&conn).unwrap(), SEED_REFERENCE_VERSION);

        // Primer arranque: instala el catalogo real empaquetado.
        assert!(ensure_bundled_reference_installed(&conn).unwrap());
        assert_eq!(reference_status(&conn).unwrap().version, BUNDLED_REFERENCE_VERSION);

        // Segundo arranque: ya no esta en la version sembrada, no reinstala.
        assert!(!ensure_bundled_reference_installed(&conn).unwrap());
        assert_eq!(reference_status(&conn).unwrap().version, BUNDLED_REFERENCE_VERSION);
    }

    #[test]
    fn ensure_bundled_does_not_overwrite_a_custom_import() {
        let conn = test_conn("first-run-custom");
        // El medico importo su propia base antes del primer "ensure".
        let rows = vec![MedicationRow {
            name: "metoprolol".into(),
            ingredient: "metoprolol".into(),
            display_name: "Metoprolol".into(),
            drug_class: Some("Betabloqueador".into()),
        }];
        import_reference(&conn, &rows, &[], "mi-base-1").unwrap();
        // No debe pisar la version del medico con el catalogo empaquetado.
        assert!(!ensure_bundled_reference_installed(&conn).unwrap());
        assert_eq!(reference_status(&conn).unwrap().version, "mi-base-1");
    }

    #[test]
    fn bundled_reference_maps_brand_names_to_canonical_ingredients() {
        let conn = test_conn("bundled-brand-alias");
        install_bundled_reference(&conn).unwrap();

        let report = check_prescription(&conn, "enc-1", &meds(&["Tylenol", "Warfarina"]), None).unwrap();
        let tylenol = report.normalized.iter().find(|drug| drug.input == "Tylenol").unwrap();
        assert_eq!(tylenol.ingredient.as_deref(), Some("acetaminophen"));
        assert_eq!(tylenol.display_name.as_deref(), Some("Paracetamol"));
        assert_eq!(report.interactions.len(), 1);
        assert_eq!(report.interactions[0].source, "DDInter 2.0");
    }
}
