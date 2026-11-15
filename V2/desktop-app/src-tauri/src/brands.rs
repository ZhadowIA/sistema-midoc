//! Marcas comerciales (paso 33, etapa 3): cada marca se desglosa en los
//! ingredientes del catalogo canonico (`ingredients`).
//!
//! Dos fuentes:
//! - **Nucleo curado**, empaquetado (`reference_data/brands.csv`, generado con
//!   `npm run brands:build` desde marcas revisadas con fuente y revisor).
//! - **Altas del medico** (`local_brands`): cuando escribe una marca que la app
//!   no conoce, le dice que contiene. Viven solo en su base cifrada y nunca se
//!   sincronizan (decision del 2026-10-20). Clase OPERATIVO: no hay datos de
//!   pacientes, solo "marca -> ingredientes".

use std::sync::OnceLock;

use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

use crate::ingredients;
use crate::medication::{csv_fields_quoted, normalize_name};

const BUNDLED_BRANDS_CSV: &str = include_str!("reference_data/brands.csv");

/// Ingredientes por marca: una combinacion rara vez pasa de cuatro.
const MAX_INGREDIENTS: usize = 6;
const MAX_NAME_CHARS: usize = 80;

#[derive(Debug, thiserror::Error)]
pub enum BrandError {
    #[error("{0}")]
    Invalid(String),
    #[error("error de base de datos: {0}")]
    Sqlite(#[from] rusqlite::Error),
}

#[derive(Debug, Clone, PartialEq)]
struct BundledBrand {
    name: String,
    display: String,
    ingredients: Vec<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct BrandIngredient {
    pub id: String,
    pub display: String,
}

/// Marca agregada por el medico.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct LocalBrand {
    pub id: String,
    pub display: String,
    pub ingredients: Vec<BrandIngredient>,
    pub created_at: String,
}

/// Una marca encontrada en un texto ya normalizado.
#[derive(Debug, Clone, PartialEq)]
pub struct BrandFound {
    pub position: usize,
    pub name: String,
    pub display: String,
    pub ingredient_ids: Vec<String>,
    /// La agrego el medico (no viene del nucleo curado).
    pub local: bool,
}

/// Linea de la receta con dosis que no nombra ningun medicamento conocido.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct UnknownMedication {
    pub line: String,
    /// Lo que parece el nombre ("Xyzal" en "Xyzal 5 mg cada 24 h").
    pub candidate: String,
}

/// Resultado de buscar ingredientes para el selector.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct IngredientOption {
    pub id: String,
    pub display: String,
    pub cnis: bool,
    pub has_interaction_data: bool,
}

fn parse_bundled(csv: &str) -> Vec<BundledBrand> {
    csv.lines()
        .skip(1)
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| {
            let f = csv_fields_quoted(line);
            (f.len() >= 3 && !f[0].is_empty()).then(|| BundledBrand {
                name: f[0].clone(),
                display: f[1].clone(),
                ingredients: f[2]
                    .split('|')
                    .filter(|i| !i.is_empty())
                    .map(String::from)
                    .collect(),
            })
        })
        .collect()
}

fn bundled() -> &'static [BundledBrand] {
    static BUNDLED: OnceLock<Vec<BundledBrand>> = OnceLock::new();
    BUNDLED.get_or_init(|| parse_bundled(BUNDLED_BRANDS_CSV))
}

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn ingredient_views(ids: &[String]) -> Vec<BrandIngredient> {
    ids.iter()
        .map(|id| BrandIngredient {
            id: id.clone(),
            display: ingredients::catalog()
                .resolve(id)
                .map(|i| i.display.clone())
                .unwrap_or_else(|| id.clone()),
        })
        .collect()
}

/// Fila de `local_brands`.
struct LocalRow {
    id: String,
    name: String,
    display: String,
    ingredients: Vec<String>,
    created_at: String,
}

fn local_rows(conn: &Connection) -> Result<Vec<LocalRow>, BrandError> {
    let mut statement = conn.prepare(
        "SELECT id, name, display, ingredients, created_at FROM local_brands ORDER BY name",
    )?;
    let rows = statement
        .query_map([], |row| {
            let raw: String = row.get(3)?;
            Ok(LocalRow {
                id: row.get(0)?,
                name: row.get(1)?,
                display: row.get(2)?,
                ingredients: serde_json::from_str::<Vec<String>>(&raw).unwrap_or_default(),
                created_at: row.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn list_local(conn: &Connection) -> Result<Vec<LocalBrand>, BrandError> {
    Ok(local_rows(conn)?
        .into_iter()
        .map(|row| LocalBrand {
            id: row.id,
            display: row.display,
            ingredients: ingredient_views(&row.ingredients),
            created_at: row.created_at,
        })
        .collect())
}

/// Guarda (o corrige) una marca del medico. La marca no puede llamarse como un
/// ingrediente ni como una marca del nucleo curado, y sus ingredientes deben
/// existir en el catalogo.
pub fn save_local(
    conn: &Connection,
    display: &str,
    ingredient_ids: &[String],
) -> Result<LocalBrand, BrandError> {
    let display = display.split_whitespace().collect::<Vec<_>>().join(" ");
    let name = normalize_name(&display);
    if name.is_empty() || !name.chars().any(char::is_alphabetic) {
        return Err(BrandError::Invalid("escribe el nombre de la marca".into()));
    }
    if display.chars().count() > MAX_NAME_CHARS {
        return Err(BrandError::Invalid(
            "el nombre de la marca es demasiado largo".into(),
        ));
    }
    if ingredients::catalog().resolve(&name).is_some() {
        return Err(BrandError::Invalid(format!(
            "\"{display}\" ya es el nombre de un principio activo"
        )));
    }
    if bundled().iter().any(|b| b.name == name) {
        return Err(BrandError::Invalid(format!(
            "\"{display}\" ya esta en el catalogo de marcas"
        )));
    }
    let mut ids: Vec<String> = Vec::new();
    for raw in ingredient_ids {
        let ingredient = ingredients::catalog().resolve(raw).ok_or_else(|| {
            BrandError::Invalid(format!("no existe el principio activo \"{raw}\""))
        })?;
        if !ids.contains(&ingredient.id) {
            ids.push(ingredient.id.clone());
        }
    }
    if ids.is_empty() {
        return Err(BrandError::Invalid(
            "elige al menos un principio activo".into(),
        ));
    }
    if ids.len() > MAX_INGREDIENTS {
        return Err(BrandError::Invalid(format!(
            "una marca puede tener hasta {MAX_INGREDIENTS} principios activos"
        )));
    }
    let json = serde_json::to_string(&ids).expect("lista de cadenas");
    let stamp = now();
    let existing: Option<(String, String)> = conn
        .query_row(
            "SELECT id, created_at FROM local_brands WHERE name = ?1",
            params![name],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;
    let (id, created_at) = match existing {
        Some((id, created_at)) => {
            conn.execute(
                "UPDATE local_brands SET display = ?1, ingredients = ?2, updated_at = ?3 WHERE id = ?4",
                params![display, json, stamp, id],
            )?;
            (id, created_at)
        }
        None => {
            let id = uuid::Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO local_brands (id, name, display, ingredients, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
                params![id, name, display, json, stamp],
            )?;
            (id, stamp)
        }
    };
    Ok(LocalBrand {
        id,
        display,
        ingredients: ingredient_views(&ids),
        created_at,
    })
}

pub fn delete_local(conn: &Connection, id: &str) -> Result<(), BrandError> {
    let removed = conn.execute("DELETE FROM local_brands WHERE id = ?1", params![id])?;
    if removed == 0 {
        return Err(BrandError::Invalid("esa marca ya no existe".into()));
    }
    Ok(())
}

/// Posiciones de `needle` en `haystack` como palabra completa.
fn word_positions(haystack: &str, needle: &str) -> Vec<usize> {
    if needle.is_empty() {
        return Vec::new();
    }
    let is_word = |c: Option<char>| c.is_some_and(char::is_alphanumeric);
    haystack
        .match_indices(needle)
        .map(|(position, _)| position)
        .filter(|&position| {
            !is_word(haystack[..position].chars().next_back())
                && !is_word(haystack[position + needle.len()..].chars().next())
        })
        .collect()
}

/// Marcas (del nucleo y del medico) nombradas en un texto ya normalizado, en
/// orden de aparicion y sin traslapes (gana el nombre mas largo).
pub fn find_in_text(conn: &Connection, text: &str) -> Result<Vec<BrandFound>, BrandError> {
    let mut candidates: Vec<(String, String, Vec<String>, bool)> = bundled()
        .iter()
        .map(|b| {
            (
                b.name.clone(),
                b.display.clone(),
                b.ingredients.clone(),
                false,
            )
        })
        .collect();
    for row in local_rows(conn)? {
        candidates.push((row.name, row.display, row.ingredients, true));
    }
    candidates.sort_by_key(|(name, ..)| std::cmp::Reverse(name.len()));
    let mut taken: Vec<(usize, usize)> = Vec::new();
    let mut found = Vec::new();
    for (name, display, ingredient_ids, local) in candidates {
        for position in word_positions(text, &name) {
            let end = position + name.len();
            if taken.iter().any(|&(a, b)| position < b && a < end) {
                continue;
            }
            taken.push((position, end));
            found.push(BrandFound {
                position,
                name: name.clone(),
                display: display.clone(),
                ingredient_ids: ingredient_ids.clone(),
                local,
            });
        }
    }
    found.sort_by_key(|f| f.position);
    Ok(found)
}

/// Posicion (en bytes) de la primera dosis escrita: numero seguido de unidad.
fn dose_position(text: &str) -> Option<usize> {
    const UNITS: &[&str] = &[
        "mg", "g", "mcg", "ug", "µg", "ui", "u", "ml", "%", "meq", "mmol",
    ];
    let chars: Vec<(usize, char)> = text.char_indices().collect();
    let mut k = 0;
    while k < chars.len() {
        let (start, c) = chars[k];
        let at_word_start = k == 0 || !chars[k - 1].1.is_alphanumeric();
        if !(c.is_ascii_digit() && at_word_start) {
            k += 1;
            continue;
        }
        let mut j = k;
        while j < chars.len()
            && (chars[j].1.is_ascii_digit() || chars[j].1 == '.' || chars[j].1 == ',')
        {
            j += 1;
        }
        while j < chars.len() && chars[j].1 == ' ' {
            j += 1;
        }
        let mut unit = String::new();
        while j < chars.len() && (chars[j].1.is_alphabetic() || chars[j].1 == '%') {
            unit.push(chars[j].1);
            j += 1;
        }
        if UNITS.contains(&unit.as_str()) {
            return Some(start);
        }
        k = j.max(k + 1);
    }
    None
}

/// "1) Xyzal" -> "Xyzal": quita vinetas y numeracion del inicio.
fn strip_bullet(text: &str) -> &str {
    text.trim_start_matches(|c: char| {
        c.is_ascii_digit() || matches!(c, ')' | '.' | '-' | '*' | '•' | ' ' | '\t')
    })
}

/// Lineas de la receta que escriben una dosis pero no nombran ningun
/// medicamento conocido (ingrediente, marca o la base de interacciones). Son
/// las que la app le pregunta al medico.
pub fn unknown_medications(
    conn: &Connection,
    prescription: &str,
) -> Result<Vec<UnknownMedication>, BrandError> {
    let mut unknown: Vec<UnknownMedication> = Vec::new();
    for line in prescription
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
    {
        let text = normalize_name(line);
        let Some(dose_at) = dose_position(&text) else {
            continue;
        };
        if !ingredients::catalog().find_in_text(&text).is_empty()
            || !find_in_text(conn, &text)?.is_empty()
            || !crate::medication::extract_medications(conn, line)
                .map_err(|e| BrandError::Invalid(e.to_string()))?
                .is_empty()
        {
            continue;
        }
        // El nombre es lo escrito antes de la dosis, con la escritura del medico.
        let before = &line[..original_offset(line, &text, dose_at)];
        let candidate = strip_bullet(before)
            .trim()
            .trim_end_matches([',', ':'])
            .trim();
        let words = candidate.split_whitespace().count();
        if candidate.chars().any(char::is_alphabetic)
            && words <= 5
            && candidate.chars().count() <= MAX_NAME_CHARS
            && !unknown
                .iter()
                .any(|u| normalize_name(&u.candidate) == normalize_name(candidate))
        {
            unknown.push(UnknownMedication {
                line: line.to_string(),
                candidate: candidate.to_string(),
            });
        }
    }
    Ok(unknown)
}

/// `normalize_name` solo cambia mayusculas, acentos y espacios repetidos: el
/// caracter numero `n` del texto normalizado corresponde al numero `n` de la
/// linea con los espacios ya colapsados. Devuelve el corte en bytes de `line`.
fn original_offset(line: &str, normalized: &str, normalized_byte: usize) -> usize {
    let target_chars = normalized[..normalized_byte].chars().count();
    let mut seen = 0;
    let mut previous_space = true;
    for (byte, c) in line.char_indices() {
        if c.is_whitespace() {
            if previous_space {
                continue;
            }
            previous_space = true;
        } else {
            previous_space = false;
        }
        if seen == target_chars {
            return byte;
        }
        seen += 1;
    }
    line.len()
}

/// Principios activos para el selector de "que contiene". Busca por cualquier
/// nombre del catalogo; devuelve hasta `limit`.
pub fn search_ingredients(query: &str, limit: usize) -> Vec<IngredientOption> {
    let query = normalize_name(query);
    if query.chars().count() < 2 {
        return Vec::new();
    }
    let mut hits: Vec<(u8, &ingredients::Ingredient)> = ingredients::catalog()
        .iter()
        .filter_map(|i| {
            let rank = if i.id.starts_with(&query) {
                0
            } else if i.names.iter().any(|n| n.starts_with(&query)) {
                1
            } else if i.names.iter().any(|n| n.contains(&query)) {
                2
            } else {
                return None;
            };
            Some((rank, i))
        })
        .collect();
    hits.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.id.cmp(&b.1.id)));
    hits.into_iter()
        .take(limit)
        .map(|(_, i)| IngredientOption {
            id: i.id.clone(),
            display: i.display.clone(),
            cnis: i.cnis,
            has_interaction_data: i.interaction_key.is_some(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_encrypted;

    fn test_conn(name: &str) -> Connection {
        let dir = std::env::temp_dir().join("midoc-brands-tests");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(format!("{name}-{}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        open_encrypted(&path, "clave-de-prueba").unwrap()
    }

    fn ids(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn parses_the_bundled_table() {
        let brands = parse_bundled(
            "name,display,ingredients,laboratory\nanalgesico plus,Analgésico Plus,paracetamol|cafeina,\n",
        );
        assert_eq!(
            brands,
            vec![BundledBrand {
                name: "analgesico plus".into(),
                display: "Analgésico Plus".into(),
                ingredients: ids(&["paracetamol", "cafeina"]),
            }]
        );
    }

    #[test]
    fn the_doctor_saves_lists_corrects_and_deletes_a_brand() {
        let conn = test_conn("local-crud");
        // Marcas ficticias: las pruebas no afirman la composicion de una marca real.
        let saved = save_local(&conn, "  Fictimed  ", &ids(&["Loratadina"])).unwrap();
        assert_eq!(saved.display, "Fictimed");
        assert_eq!(saved.ingredients[0].id, "loratadina");
        assert_eq!(list_local(&conn).unwrap().len(), 1);

        // Volver a guardar la misma marca la corrige, no la duplica.
        let corrected =
            save_local(&conn, "FICTIMED", &ids(&["paracetamol", "loratadina"])).unwrap();
        assert_eq!(corrected.id, saved.id);
        assert_eq!(
            corrected
                .ingredients
                .iter()
                .map(|i| i.id.as_str())
                .collect::<Vec<_>>(),
            vec!["paracetamol", "loratadina"]
        );
        assert_eq!(list_local(&conn).unwrap().len(), 1);

        delete_local(&conn, &saved.id).unwrap();
        assert!(list_local(&conn).unwrap().is_empty());
        assert!(delete_local(&conn, &saved.id).is_err());
    }

    #[test]
    fn rejects_invalid_brands() {
        let conn = test_conn("local-invalid");
        assert!(save_local(&conn, "  ", &ids(&["paracetamol"])).is_err());
        assert!(save_local(&conn, "123", &ids(&["paracetamol"])).is_err());
        assert!(save_local(&conn, "Fictimed", &[]).is_err());
        assert!(save_local(&conn, "Fictimed", &ids(&["no existe"])).is_err());
        let shadow = save_local(&conn, "Paracetamol", &ids(&["paracetamol"])).unwrap_err();
        assert!(shadow.to_string().contains("principio activo"));
        let too_many = ids(&[
            "paracetamol",
            "ibuprofeno",
            "naproxeno",
            "metformina",
            "omeprazol",
            "losartan",
            "captopril",
        ]);
        assert!(save_local(&conn, "Mezcla", &too_many).is_err());
    }

    #[test]
    fn finds_local_brands_in_text() {
        let conn = test_conn("local-find");
        save_local(&conn, "Fictimed", &ids(&["loratadina"])).unwrap();
        let found = find_in_text(&conn, &normalize_name("1) FICTIMED 5 mg cada 24 h")).unwrap();
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].display, "Fictimed");
        assert_eq!(found[0].ingredient_ids, ids(&["loratadina"]));
        assert!(found[0].local);
        assert!(find_in_text(&conn, "fictimedito 5 mg").unwrap().is_empty());
    }

    #[test]
    fn asks_only_about_dosed_lines_that_name_nothing_known() {
        let conn = test_conn("unknown");
        let prescription = "Rx:\n1) Fictimed 5 mg, 1 cada 24 h\nParacetamol 500 mg cada 8 h\nReposo 3 dias\n- Probadol 400 mg dosis unica\nFICTIMED 5 mg otra vez";
        let unknown = unknown_medications(&conn, prescription).unwrap();
        assert_eq!(
            unknown
                .iter()
                .map(|u| u.candidate.as_str())
                .collect::<Vec<_>>(),
            vec!["Fictimed", "Probadol"]
        );
        assert_eq!(unknown[0].line, "1) Fictimed 5 mg, 1 cada 24 h");

        // Ya guardada, deja de preguntarse.
        save_local(&conn, "Fictimed", &ids(&["loratadina"])).unwrap();
        let unknown = unknown_medications(&conn, prescription).unwrap();
        assert_eq!(
            unknown
                .iter()
                .map(|u| u.candidate.as_str())
                .collect::<Vec<_>>(),
            vec!["Probadol"]
        );
    }

    #[test]
    fn keeps_the_doctors_spelling_for_the_candidate() {
        let conn = test_conn("unknown-spelling");
        let unknown = unknown_medications(&conn, "Ácida   Mezcla Rara 10 mg").unwrap();
        assert_eq!(unknown[0].candidate, "Ácida   Mezcla Rara");
    }

    #[test]
    fn searches_ingredients_by_any_name() {
        let options = search_ingredients("parac", 5);
        assert_eq!(options[0].id, "paracetamol");
        assert!(options[0].cnis);
        assert!(options[0].has_interaction_data);
        assert!(search_ingredients("p", 5).is_empty(), "minimo dos letras");
        let acetaminophen = search_ingredients("acetaminophen", 5);
        assert_eq!(acetaminophen[0].id, "paracetamol");
    }
}
