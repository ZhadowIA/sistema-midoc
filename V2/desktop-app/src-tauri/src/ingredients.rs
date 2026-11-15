//! Ingredientes canonicos (paso 33, etapa 2): una sola identidad por principio
//! activo que une su generico del CNIS, su clave en la base de interacciones y
//! sus nombres revisados.
//!
//! Se genera con `npm run ingredients:build` y va empaquetado en el binario. Es
//! REFERENCIA publica, no PHI. Solo trae nombres que coinciden exacto o que una
//! persona reviso (`scripts/ingredients/sinonimos.csv`); las marcas son de la
//! etapa 3.

use std::collections::HashMap;
use std::sync::OnceLock;

use crate::medication::{csv_fields_quoted, normalize_name};

const BUNDLED_INGREDIENTS_CSV: &str = include_str!("reference_data/ingredients.csv");

#[derive(Debug, Clone, PartialEq)]
pub struct Ingredient {
    /// Nombre normalizado; el generico del CNIS cuando existe.
    pub id: String,
    /// Como se muestra ("Ácido acetilsalicílico").
    pub display: String,
    /// Nombres normalizados que lo identifican (incluye el id).
    pub names: Vec<String>,
    /// Clave de la base de interacciones (ingles), si se ligo.
    pub interaction_key: Option<String>,
    /// Tiene genericos en el CNIS.
    pub cnis: bool,
}

/// Un ingrediente encontrado en un texto ya normalizado.
#[derive(Debug, Clone, PartialEq)]
pub struct Found<'a> {
    pub position: usize,
    /// El nombre con el que se encontro (normalizado).
    pub name: &'a str,
    pub ingredient: &'a Ingredient,
}

pub struct Catalog {
    ingredients: Vec<Ingredient>,
    /// Nombre -> indice del ingrediente.
    by_name: HashMap<String, usize>,
    /// Nombres del mas largo al mas corto, para preferir "acido acetilsalicilico"
    /// sobre un fragmento.
    names_longest_first: Vec<String>,
}

pub(crate) fn parse(csv: &str) -> Catalog {
    let ingredients: Vec<Ingredient> = csv
        .lines()
        .skip(1)
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| {
            let f = csv_fields_quoted(line);
            if f.len() < 5 || f[0].is_empty() {
                return None;
            }
            Some(Ingredient {
                id: f[0].clone(),
                display: f[1].clone(),
                names: f[2]
                    .split('|')
                    .map(str::trim)
                    .filter(|n| !n.is_empty())
                    .map(String::from)
                    .collect(),
                interaction_key: Some(f[3].clone()).filter(|k| !k.is_empty()),
                cnis: f[4] == "1",
            })
        })
        .collect();
    let mut by_name = HashMap::new();
    for (index, ingredient) in ingredients.iter().enumerate() {
        for name in &ingredient.names {
            by_name.entry(name.clone()).or_insert(index);
        }
    }
    let mut names_longest_first: Vec<String> = by_name.keys().cloned().collect();
    names_longest_first.sort();
    names_longest_first.sort_by_key(|n| std::cmp::Reverse(n.len()));
    Catalog {
        ingredients,
        by_name,
        names_longest_first,
    }
}

pub fn catalog() -> &'static Catalog {
    static CATALOG: OnceLock<Catalog> = OnceLock::new();
    CATALOG.get_or_init(|| parse(BUNDLED_INGREDIENTS_CSV))
}

impl Catalog {
    pub fn iter(&self) -> impl Iterator<Item = &Ingredient> {
        self.ingredients.iter()
    }

    /// El ingrediente que nombra exactamente `term` (cualquier escritura).
    pub fn resolve(&self, term: &str) -> Option<&Ingredient> {
        self.by_name
            .get(&normalize_name(term))
            .map(|&index| &self.ingredients[index])
    }

    /// Ingredientes nombrados en un texto ya normalizado, en orden de aparicion
    /// y sin traslapes (gana el nombre mas largo).
    pub fn find_in_text<'a>(&'a self, text: &str) -> Vec<Found<'a>> {
        let mut taken: Vec<(usize, usize)> = Vec::new();
        let mut found: Vec<Found<'a>> = Vec::new();
        for name in &self.names_longest_first {
            for position in word_positions(text, name) {
                let end = position + name.len();
                if taken.iter().any(|&(a, b)| position < b && a < end) {
                    continue;
                }
                taken.push((position, end));
                found.push(Found {
                    position,
                    name,
                    ingredient: &self.ingredients[self.by_name[name]],
                });
            }
        }
        found.sort_by_key(|f| f.position);
        found
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    const CSV: &str = "id,display,names,interaction_key,cnis\n\
acido acetilsalicilico,Ácido acetilsalicílico,acido acetilsalicilico|aspirin|aspirina,aspirin,1\n\
paracetamol,Paracetamol,acetaminofen|acetaminophen|paracetamol,acetaminophen,1\n\
acido folico,Ácido fólico,acido folico,,1\n\
fenelzina,Fenelzina,fenelzina|phenelzine,phenelzine,0\n";

    #[test]
    fn resolves_any_reviewed_name() {
        let catalog = parse(CSV);
        assert_eq!(catalog.iter().count(), 4);
        let asa = catalog.resolve("Aspirina").unwrap();
        assert_eq!(asa.id, "acido acetilsalicilico");
        assert_eq!(asa.display, "Ácido acetilsalicílico");
        assert_eq!(asa.interaction_key.as_deref(), Some("aspirin"));
        assert_eq!(
            catalog.resolve("ACETAMINOFÉN").map(|i| i.id.as_str()),
            Some("paracetamol")
        );
        assert_eq!(
            catalog.resolve("acido folico").unwrap().interaction_key,
            None
        );
        assert!(
            catalog.resolve("tempra").is_none(),
            "las marcas son de la etapa 3"
        );
    }

    #[test]
    fn finds_ingredients_in_text_preferring_the_longest_name() {
        let catalog = parse(CSV);
        let text =
            normalize_name("Ácido acetilsalicílico 100 mg y paracetamol 500 mg; ácido fólico");
        let found: Vec<(&str, &str)> = catalog
            .find_in_text(&text)
            .iter()
            .map(|f| (f.ingredient.id.as_str(), f.name))
            .collect();
        assert_eq!(
            found,
            vec![
                ("acido acetilsalicilico", "acido acetilsalicilico"),
                ("paracetamol", "paracetamol"),
                ("acido folico", "acido folico"),
            ]
        );
        assert!(
            catalog.find_in_text("paracetamolito").is_empty(),
            "respeta palabras"
        );
    }

    #[test]
    fn bundled_catalog_unites_cnis_and_interactions() {
        let catalog = catalog();
        assert!(
            catalog.iter().count() > 900,
            "{} ingredientes",
            catalog.iter().count()
        );
        let paracetamol = catalog.resolve("paracetamol").unwrap();
        assert!(paracetamol.cnis);
        assert_eq!(
            paracetamol.interaction_key.as_deref(),
            Some("acetaminophen")
        );
        let amoxicillin = catalog.resolve("amoxicilina").unwrap();
        assert_eq!(amoxicillin.interaction_key.as_deref(), Some("amoxicillin"));
        assert!(catalog.resolve("ácido acetilsalicílico").unwrap().cnis);
        // Todo nombre apunta a un solo ingrediente.
        let mut seen = std::collections::HashSet::new();
        for ingredient in catalog.iter() {
            for name in &ingredient.names {
                assert!(seen.insert(name.clone()), "nombre repetido: {name}");
            }
        }
    }
}
