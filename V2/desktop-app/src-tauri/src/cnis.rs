//! Claves del Compendio Nacional de Insumos para la Salud (CNIS) para codificar
//! medicamentos en el FHIR (decision del 2026-10-19).
//!
//! Fuente: el compendio que publica el Consejo de Salubridad General en el DOF,
//! leido de su PDF con `npm run cnis:build`. Es REFERENCIA publica, no PHI: va
//! empaquetado en el binario y se carga en memoria una sola vez.
//!
//! La receta es texto libre y el texto sigue siendo lo que vale. La clave es un
//! dato adicional para el sistema que recibe el expediente, asi que solo se
//! pone cuando la coincidencia es exacta y unica; ante cualquier duda, nada:
//!   - un solo generico del compendio en la linea, sin combinaciones;
//!   - la concentracion escrita es la del compendio (sin "mg/5 mL");
//!   - un solo producto con ese generico y esa concentracion, y nada en el
//!     compendio que no se haya podido leer y pudiera ser otro con la misma;
//!   - ese producto tiene un solo envase (la clave incluye el envase);
//!   - la forma escrita, si la hay, no contradice la del compendio.

use std::sync::OnceLock;

use crate::medication::{csv_fields_quoted, find_word, normalize_name};

const BUNDLED_CNIS_CSV: &str = include_str!("reference_data/cnis.csv");
pub const CATALOG_MANIFEST: &str = include_str!("reference_data/cnis.manifest.json");

/// Sistema de codificacion: el CNIS no tiene un URI FHIR oficial.
pub const SYSTEM: &str = "https://midocapp.com.mx/fhir/CodeSystem/cnis";

#[derive(Debug, Clone)]
struct Entry {
    clave: String,
    product: String,
    generic: String,
    form: String,
    strength: Option<(f64, String)>,
    packages: u32,
    complete: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CnisCoding {
    pub clave: String,
    /// Edicion del compendio de la que salio la clave.
    pub version: String,
}

struct Catalog {
    entries: Vec<Entry>,
    /// Genericos distintos, del mas largo al mas corto.
    generics: Vec<String>,
    version: String,
}

fn parse(csv: &str) -> Vec<Entry> {
    csv.lines()
        .skip(1)
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| {
            let f = csv_fields_quoted(line);
            if f.len() < 8 {
                return None;
            }
            let strength = f[4]
                .parse::<f64>()
                .ok()
                .filter(|_| !f[5].is_empty())
                .map(|value| (value, f[5].clone()));
            Some(Entry {
                clave: f[0].clone(),
                product: f[1].clone(),
                generic: f[2].clone(),
                form: f[3].clone(),
                strength,
                packages: f[6].parse().unwrap_or(0),
                complete: f[7] == "1",
            })
        })
        .collect()
}

fn catalog() -> &'static Catalog {
    static CATALOG: OnceLock<Catalog> = OnceLock::new();
    CATALOG.get_or_init(|| {
        let entries = parse(BUNDLED_CNIS_CSV);
        let mut generics: Vec<String> = entries.iter().map(|e| e.generic.clone()).collect();
        generics.sort();
        generics.dedup();
        generics.sort_by_key(|g| std::cmp::Reverse(g.len()));
        let version = serde_json::from_str::<serde_json::Value>(CATALOG_MANIFEST)
            .ok()
            .and_then(|m| {
                m["version"]
                    .as_str()
                    .map(|v| v.trim_start_matches("cnis-").to_string())
            })
            .unwrap_or_default();
        Catalog {
            entries,
            generics,
            version,
        }
    })
}

/// Unidad canonica, igual que el pipeline (scripts/cnis/catalog.ts).
fn canonical_unit(unit: &str) -> Option<(&'static str, f64)> {
    Some(match unit {
        "mg" => ("mg", 1.0),
        "g" | "gr" => ("mg", 1000.0),
        "mcg" | "µg" | "μg" | "ug" => ("mcg", 1.0),
        "ui" | "u" => ("UI", 1.0),
        "ml" => ("mL", 1.0),
        "%" => ("%", 1.0),
        "meq" => ("mEq", 1.0),
        "mmol" => ("mmol", 1.0),
        _ => return None,
    })
}

enum Strength {
    Found(f64, &'static str),
    /// "250 mg/5 ml": concentracion por volumen, que el compendio expresa
    /// distinto ("Cada 100 mL contienen ...").
    PerVolume,
    Missing,
}

/// Primera concentracion (numero + unidad) desde `from` en el texto ya normalizado.
fn first_strength(text: &str, from: usize) -> Strength {
    let chars: Vec<(usize, char)> = text.char_indices().filter(|(i, _)| *i >= from).collect();
    let mut k = 0;
    while k < chars.len() {
        let (_, c) = chars[k];
        let starts_number = c.is_ascii_digit() && (k == 0 || !chars[k - 1].1.is_alphanumeric());
        if !starts_number {
            k += 1;
            continue;
        }
        let mut number = String::new();
        let mut j = k;
        while j < chars.len()
            && (chars[j].1.is_ascii_digit()
                || ((chars[j].1 == '.' || chars[j].1 == ',')
                    && j + 1 < chars.len()
                    && chars[j + 1].1.is_ascii_digit()))
        {
            number.push(if chars[j].1 == ',' { '.' } else { chars[j].1 });
            j += 1;
        }
        while j < chars.len() && chars[j].1 == ' ' {
            j += 1;
        }
        let mut unit = String::new();
        while j < chars.len() && (chars[j].1.is_alphabetic() || chars[j].1 == '%') {
            unit.push(chars[j].1);
            j += 1;
            if unit == "%" {
                break;
            }
        }
        if let (Ok(value), Some((canonical, factor))) =
            (number.parse::<f64>(), canonical_unit(&unit))
        {
            let mut rest = j;
            while rest < chars.len() && chars[rest].1 == ' ' {
                rest += 1;
            }
            if rest < chars.len() && chars[rest].1 == '/' {
                return Strength::PerVolume;
            }
            return Strength::Found(value * factor, canonical);
        }
        k = j.max(k + 1);
    }
    Strength::Missing
}

fn same_strength(a: (f64, &str), b: &(f64, String)) -> bool {
    a.1 == b.1 && (a.0 - b.0).abs() <= 1e-9 * a.0.abs().max(1.0)
}

/// Combinaciones ("losartan/hidroclorotiazida", "lidocaina con epinefrina").
fn names_combination(text: &str) -> bool {
    if text.contains('+') {
        return true;
    }
    if text
        .split_whitespace()
        .any(|w| matches!(w, "con" | "y" | "mas"))
    {
        return true;
    }
    let chars: Vec<char> = text.chars().collect();
    chars.iter().enumerate().any(|(i, c)| {
        *c == '/'
            && i > 0
            && chars[..i]
                .iter()
                .rev()
                .find(|c| **c != ' ')
                .is_some_and(|c| c.is_alphabetic())
            && chars[i + 1..]
                .iter()
                .find(|c| **c != ' ')
                .is_some_and(|c| c.is_alphabetic())
    })
}

/// Familias de forma: palabras de la receta -> raices aceptadas en el compendio.
const FORM_FAMILIES: &[(&[&str], &[&str])] = &[
    (
        &[
            "tableta",
            "tabletas",
            "tab",
            "tabs",
            "comprimido",
            "comprimidos",
            "gragea",
            "grageas",
        ],
        &["tableta", "comprimido", "gragea"],
    ),
    (&["capsula", "capsulas", "caps", "cap"], &["capsula"]),
    (
        &[
            "inyectable",
            "ampolleta",
            "ampolletas",
            "ampula",
            "amp",
            "iny",
            "vial",
        ],
        &["inyectable"],
    ),
    (&["jarabe"], &["jarabe"]),
    (&["suspension"], &["suspension"]),
    (&["solucion"], &["solucion"]),
    (&["gotas"], &["solucion", "suspension"]),
    (&["crema"], &["crema"]),
    (&["unguento", "pomada"], &["unguento"]),
    (&["gel"], &["gel"]),
    (&["supositorio", "supositorios"], &["supositorio"]),
    (&["ovulo", "ovulos"], &["ovulo"]),
    (&["parche", "parches"], &["parche"]),
    (&["aerosol", "inhalador"], &["aerosol"]),
    (&["sobre", "sobres", "polvo"], &["polvo", "granulado"]),
];

/// Rasgos de la forma del compendio que la receta debe mencionar para que la
/// clave no diga mas de lo que escribio el medico.
const FORM_MODIFIERS: &[(&str, &[&str])] = &[
    ("liberacion", &["liberacion", "lp", "retard", "xl", "sr"]),
    ("oftalm", &["oftalm"]),
    ("otic", &["otic"]),
    ("nasal", &["nasal"]),
    ("vaginal", &["vaginal"]),
    ("rectal", &["rectal"]),
    ("dialisis", &["dialisis"]),
    ("nebuliz", &["nebuliz"]),
    ("inhala", &["inhala"]),
    ("masticable", &["masticable"]),
    ("efervescente", &["efervescente"]),
];

fn has_word_prefix(text: &str, stem: &str) -> bool {
    text.split(|c: char| !c.is_alphanumeric())
        .any(|w| w == stem || (stem.len() > 3 && w.starts_with(stem)))
}

/// Raices de la familia de forma que nombra la receta, si nombra alguna.
fn written_family(line: &str) -> Option<&'static [&'static str]> {
    FORM_FAMILIES.iter().find_map(|(words, stems)| {
        words
            .iter()
            .any(|w| line.split(|c: char| !c.is_alphanumeric()).any(|t| t == *w))
            .then_some(*stems)
    })
}

fn form_compatible(line: &str, form: &str) -> bool {
    for (words, stems) in FORM_FAMILIES {
        if words
            .iter()
            .any(|w| line.split(|c: char| !c.is_alphanumeric()).any(|t| t == *w))
            && !stems.iter().any(|s| form.contains(s))
        {
            return false;
        }
    }
    FORM_MODIFIERS.iter().all(|(stem, synonyms)| {
        !form.contains(stem) || synonyms.iter().any(|s| has_word_prefix(line, s))
    })
}

/// Clave CNIS para la linea de la receta que nombra un medicamento, solo si la
/// coincidencia es exacta y unica (ver el encabezado del modulo).
pub fn code_medication(line: &str) -> Option<CnisCoding> {
    code_with(catalog(), line)
}

fn code_with(catalog: &Catalog, line: &str) -> Option<CnisCoding> {
    let text = normalize_name(line);
    if text.is_empty() || names_combination(&text) {
        return None;
    }

    // Un solo generico: el mas largo encontrado, y ningun otro que no sea parte de el.
    let mut found: Vec<(usize, &String)> = Vec::new();
    for generic in &catalog.generics {
        if let Some(pos) = find_word(&text, generic) {
            found.push((pos, generic));
        }
    }
    let (pos, generic) = *found.first()?;
    if found
        .iter()
        .any(|(_, other)| !generic.contains(other.as_str()))
    {
        return None;
    }

    let (value, unit) = match first_strength(&text, pos + generic.len()) {
        Strength::Found(value, unit) => (value, unit),
        Strength::PerVolume | Strength::Missing => return None,
    };

    // La familia escrita (tabletas, ampolletas...) descarta las otras; una entrada
    // sin forma legible no se descarta.
    let family = written_family(&text);
    let fits = |e: &Entry| {
        e.form.is_empty() || family.is_none_or(|stems| stems.iter().any(|s| e.form.contains(s)))
    };
    let mut product: Option<&Entry> = None;
    for entry in catalog
        .entries
        .iter()
        .filter(|e| &e.generic == generic && fits(e))
    {
        let matches = match &entry.strength {
            Some(strength) => same_strength((value, unit), strength),
            // Sin concentracion legible podria ser este mismo: no se adivina.
            None => return None,
        };
        if !matches {
            continue;
        }
        if !entry.complete {
            return None;
        }
        match product {
            Some(previous) if previous.product != entry.product => return None,
            _ => product = Some(entry),
        }
    }
    let entry = product?;
    if entry.packages != 1 || !form_compatible(&text, &entry.form) {
        return None;
    }
    Some(CnisCoding {
        clave: entry.clave.clone(),
        version: catalog.version.clone(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const CSV: &str = "clave,product,generic,form,strength_value,strength_unit,packages,complete\n\
010.000.0104.00,0104,paracetamol,tableta,500,mg,1,1\n\
010.000.0106.00,0106,paracetamol,solucion oral,100,mg,1,1\n\
010.000.5940.00,5940,ibuprofeno,tableta o capsula,200,mg,2,1\n\
010.000.5940.01,5940,ibuprofeno,tableta o capsula,200,mg,2,1\n\
010.000.2114.00,2114,felodipino,tableta de liberacion prolongada,5,mg,1,1\n\
010.000.0261.00,0261,lidocaina,solucion inyectable al 1%,,,1,0\n\
010.000.1042.00,1042,glibenclamida,tableta,5,mg,1,1\n\
010.000.1043.00,1043,glibenclamida,tableta,5,mg,1,1\n\
010.000.0472.00,0472,prednisona,tableta,5,mg,1,1\n\
010.000.0473.00,0473,prednisona,tableta,50,mg,1,0\n\
010.000.2501.00,2501,metformina,tableta,850,mg,1,1\n\
010.000.4307.00,4307,cilostazol,tableta,100,mg,1,1\n";

    fn test_catalog() -> Catalog {
        let entries = parse(CSV);
        let mut generics: Vec<String> = entries.iter().map(|e| e.generic.clone()).collect();
        generics.sort();
        generics.dedup();
        generics.sort_by_key(|g| std::cmp::Reverse(g.len()));
        Catalog {
            entries,
            generics,
            version: "2025-04-26".into(),
        }
    }

    fn code(line: &str) -> Option<String> {
        code_with(&test_catalog(), line).map(|c| c.clave)
    }

    #[test]
    fn codes_an_exact_unique_match() {
        assert_eq!(
            code("Paracetamol 500 mg tabletas").as_deref(),
            Some("010.000.0104.00")
        );
        assert_eq!(
            code("PARACETAMOL 500mg").as_deref(),
            Some("010.000.0104.00")
        );
        assert_eq!(
            code("Paracetamol 0.5 g, 1 tableta cada 8 h").as_deref(),
            Some("010.000.0104.00")
        );
        assert_eq!(
            code("Cilostazol 100 mg").as_deref(),
            Some("010.000.4307.00")
        );
        let coding = code_with(&test_catalog(), "Metformina 850 mg").unwrap();
        assert_eq!(coding.version, "2025-04-26");
    }

    #[test]
    fn needs_the_strength_written() {
        assert_eq!(code("Paracetamol tabletas"), None);
        assert_eq!(code("Paracetamol 750 mg tabletas"), None);
    }

    #[test]
    fn rejects_per_volume_strengths() {
        assert_eq!(code("Paracetamol 100 mg/mL gotas"), None);
    }

    #[test]
    fn rejects_contradicting_forms() {
        assert_eq!(code("Paracetamol 500 mg jarabe"), None);
        assert_eq!(code("Paracetamol 500 mg ampolletas"), None);
    }

    #[test]
    fn requires_the_written_form_to_carry_modifiers() {
        // El compendio solo tiene felodipino de liberacion prolongada: sin
        // decirlo, la clave diria mas de lo que escribio el medico.
        assert_eq!(code("Felodipino 5 mg tabletas"), None);
        assert_eq!(
            code("Felodipino 5 mg tabletas de liberación prolongada").as_deref(),
            Some("010.000.2114.00")
        );
    }

    #[test]
    fn the_written_form_separates_products_with_the_same_strength() {
        let mut catalog = test_catalog();
        catalog.entries.extend(parse(
            "h
010.000.5720.00,5720,paracetamol,solucion inyectable,500,mg,1,1
",
        ));
        let coded = |line: &str| code_with(&catalog, line).map(|c| c.clave);
        assert_eq!(
            coded("Paracetamol 500 mg tabletas").as_deref(),
            Some("010.000.0104.00")
        );
        assert_eq!(
            coded("Paracetamol 500 mg ampolleta").as_deref(),
            Some("010.000.5720.00")
        );
        assert_eq!(
            coded("Paracetamol 500 mg"),
            None,
            "sin forma escrita hay dos productos"
        );
    }

    #[test]
    fn rejects_products_with_several_packages() {
        assert_eq!(code("Ibuprofeno 200 mg tabletas"), None);
    }

    #[test]
    fn rejects_two_products_with_the_same_strength() {
        assert_eq!(code("Glibenclamida 5 mg"), None);
    }

    #[test]
    fn rejects_when_an_unread_entry_could_be_the_same() {
        assert_eq!(code("Lidocaina 1% solucion inyectable"), None);
        // Una entrada incompleta con la misma concentracion bloquea; con otra, no.
        assert_eq!(code("Prednisona 50 mg"), None);
        assert_eq!(code("Prednisona 5 mg").as_deref(), Some("010.000.0472.00"));
    }

    #[test]
    fn rejects_combinations_and_two_drugs() {
        assert_eq!(code("Paracetamol 500 mg + cafeína 65 mg"), None);
        assert_eq!(code("Metformina/glibenclamida 500/5 mg"), None);
        assert_eq!(code("Paracetamol con metformina 500 mg"), None);
        assert_eq!(code("Paracetamol 500 mg metformina 850 mg"), None);
    }

    #[test]
    fn bundled_catalog_codes_common_single_package_products() {
        let catalog = catalog();
        assert!(
            catalog.entries.len() > 2000,
            "{} claves",
            catalog.entries.len()
        );
        assert!(!catalog.version.is_empty());
        assert_eq!(
            code_medication("Paracetamol 500 mg tabletas")
                .map(|c| c.clave)
                .as_deref(),
            Some("010.000.0104.00")
        );
        assert_eq!(
            code_medication("Cilostazol 100 mg tabletas")
                .map(|c| c.clave)
                .as_deref(),
            Some("010.000.4307.00")
        );
        // Las claves codificables deben serlo de verdad: un solo envase y completas.
        for entry in catalog.entries.iter().filter(|e| e.complete) {
            assert!(entry.clave.starts_with("010.000."), "{}", entry.clave);
            assert_eq!(&entry.clave[8..12], entry.product);
        }
    }
}
