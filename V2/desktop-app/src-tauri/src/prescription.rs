//! Receta con doble denominacion (paso 33, etapa 4).
//!
//! El medico escribe la receta como quiera (marca o generico). Para cada linea
//! que nombra un medicamento, la app agrega la denominacion generica y, si la
//! coincidencia es exacta, la clave del CNIS. Lo escrito por el medico nunca se
//! cambia: esto va aparte, en el PDF y en el FHIR, y el medico lo ve antes de
//! firmar. Determinista, sin IA; la receta no sale del equipo.

use rusqlite::Connection;
use serde::Serialize;

use crate::medication::{self, normalize_name, MedicationError};
use crate::{brands, cnis, ingredients};

/// Lo que la app agrega a una linea de la receta.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct PrescriptionItem {
    /// La linea tal como la escribio el medico.
    pub line: String,
    /// Marca reconocida (nucleo curado o del medico), si la linea nombra una.
    pub brand: Option<String>,
    /// Principios activos, como se muestran ("Paracetamol + Cafeína").
    pub generic: String,
    /// Los mismos principios activos, como ids del catalogo de ingredientes.
    pub ingredient_ids: Vec<String>,
    /// Denominacion del CNIS cuando hay clave ("Paracetamol 500 mg tableta").
    pub cnis_description: Option<String>,
    pub cnis_product: Option<String>,
    pub cnis_clave: Option<String>,
    pub cnis_version: Option<String>,
}

fn brand_error(error: brands::BrandError) -> MedicationError {
    MedicationError::Invalid(error.to_string())
}

/// La linea nombra un medicamento: de la base de interacciones, del catalogo de
/// ingredientes o una marca (nucleo curado o del medico).
pub fn names_medication(conn: &Connection, line: &str) -> Result<bool, MedicationError> {
    let text = normalize_name(line);
    Ok(!medication::extract_medications(conn, line)?.is_empty()
        || !ingredients::catalog().find_in_text(&text).is_empty()
        || !brands::find_in_text(conn, &text)
            .map_err(brand_error)?
            .is_empty())
}

/// Denominacion generica y clave CNIS de una linea, o `None` si la linea no
/// nombra un principio activo conocido (o nombra dos marcas: no se adivina).
pub fn analyze_line(
    conn: &Connection,
    line: &str,
) -> Result<Option<PrescriptionItem>, MedicationError> {
    let text = normalize_name(line);
    let found_brands = brands::find_in_text(conn, &text).map_err(brand_error)?;
    if found_brands.len() > 1 {
        return Ok(None);
    }
    let catalog = ingredients::catalog();
    let (brand, ids, cnis_text) = match found_brands.first() {
        Some(brand) => {
            // Para buscar la clave, la marca se lee como su generico
            // ("tempra 500 mg" -> "paracetamol 500 mg"); solo si es un solo principio.
            let cnis_text = match brand.ingredient_ids.as_slice() {
                [single] => Some(format!(
                    "{}{}{}",
                    &text[..brand.position],
                    single,
                    &text[brand.position + brand.name.len()..]
                )),
                _ => None,
            };
            (
                Some(brand.display.clone()),
                brand.ingredient_ids.clone(),
                cnis_text,
            )
        }
        None => {
            let mut ids: Vec<String> = Vec::new();
            for found in catalog.find_in_text(&text) {
                if !ids.contains(&found.ingredient.id) {
                    ids.push(found.ingredient.id.clone());
                }
            }
            (None, ids, Some(text.clone()))
        }
    };
    if ids.is_empty() {
        return Ok(None);
    }
    let generic = ids
        .iter()
        .map(|id| {
            catalog
                .resolve(id)
                .map(|i| i.display.clone())
                .unwrap_or_else(|| id.clone())
        })
        .collect::<Vec<_>>()
        .join(" + ");
    let coding = cnis_text.as_deref().and_then(cnis::code_medication);
    Ok(Some(PrescriptionItem {
        line: line.trim().to_string(),
        brand,
        generic,
        ingredient_ids: ids,
        cnis_description: coding.as_ref().map(|c| c.description.clone()),
        cnis_product: coding.as_ref().map(|c| c.product.clone()),
        cnis_clave: coding.as_ref().and_then(|c| c.clave.clone()),
        cnis_version: coding.map(|c| c.version),
    }))
}

/// Analiza cada linea de la receta que nombra un medicamento.
pub fn analyze(
    conn: &Connection,
    prescription: &str,
) -> Result<Vec<PrescriptionItem>, MedicationError> {
    let mut items = Vec::new();
    for line in prescription
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
    {
        if let Some(item) = analyze_line(conn, line)? {
            items.push(item);
        }
    }
    Ok(items)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_encrypted;

    fn test_conn(name: &str) -> Connection {
        let dir = std::env::temp_dir().join("midoc-prescription-tests");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(format!("{name}-{}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        let conn = open_encrypted(&path, "clave-de-prueba").unwrap();
        medication::install_bundled_reference(&conn).unwrap();
        conn
    }

    #[test]
    fn a_generic_line_gets_its_cnis_denomination() {
        let conn = test_conn("generic");
        let item = analyze_line(&conn, "Paracetamol 500 mg tabletas, 1 cada 8 h")
            .unwrap()
            .unwrap();
        assert_eq!(item.brand, None);
        assert_eq!(item.generic, "Paracetamol");
        assert_eq!(
            item.cnis_description.as_deref(),
            Some("Paracetamol 500 mg tableta")
        );
        assert_eq!(item.cnis_product.as_deref(), Some("010.000.0104"));
        assert_eq!(item.cnis_clave.as_deref(), Some("010.000.0104.00"));
    }

    #[test]
    fn a_brand_line_is_read_as_its_generic_for_the_cnis() {
        let conn = test_conn("brand");
        // Marca ficticia del medico: las pruebas no afirman la composicion de una real.
        brands::save_local(&conn, "Fictimed", &["paracetamol".to_string()]).unwrap();
        let item = analyze_line(&conn, "Fictimed 500 mg tabletas cada 8 h")
            .unwrap()
            .unwrap();
        assert_eq!(item.brand.as_deref(), Some("Fictimed"));
        assert_eq!(item.generic, "Paracetamol");
        assert_eq!(item.cnis_clave.as_deref(), Some("010.000.0104.00"));
        assert_eq!(
            item.line, "Fictimed 500 mg tabletas cada 8 h",
            "lo escrito no cambia"
        );
    }

    #[test]
    fn a_combination_brand_lists_its_ingredients_without_a_cnis_key() {
        let conn = test_conn("combination");
        brands::save_local(
            &conn,
            "Mezclafic",
            &["paracetamol".to_string(), "ibuprofeno".to_string()],
        )
        .unwrap();
        let item = analyze_line(&conn, "Mezclafic 1 tableta cada 8 h")
            .unwrap()
            .unwrap();
        assert_eq!(item.generic, "Paracetamol + Ibuprofeno");
        assert_eq!(item.cnis_product, None);
    }

    #[test]
    fn plain_generic_without_a_key_adds_nothing() {
        let conn = test_conn("plain");
        let item = analyze_line(&conn, "Paracetamol si hay fiebre")
            .unwrap()
            .unwrap();
        assert_eq!(item.cnis_product, None);
    }

    #[test]
    fn lines_without_a_medication_are_skipped() {
        let conn = test_conn("skip");
        brands::save_local(&conn, "Fictimed", &["paracetamol".to_string()]).unwrap();
        brands::save_local(&conn, "Probadol", &["ibuprofeno".to_string()]).unwrap();
        let items = analyze(
            &conn,
            "Rx:\nParacetamol 500 mg tabletas\n1 cada 8 horas por 3 dias\nFictimed o Probadol 400 mg\n\nReposo",
        )
        .unwrap();
        assert_eq!(items.len(), 1, "dos marcas en una linea no se adivinan");
        assert_eq!(items[0].generic, "Paracetamol");
        assert!(names_medication(&conn, "Fictimed 500 mg").unwrap());
        assert!(!names_medication(&conn, "Reposo 3 dias").unwrap());
    }
}
