//! Claves del Compendio Nacional de Insumos para la Salud (CNIS) para codificar
//! medicamentos en el FHIR (decision del 2026-10-19).
//!
//! Fuente: el compendio que publica el Consejo de Salubridad General en el DOF,
//! leido de su PDF con `npm run cnis:build`. Es REFERENCIA publica, no PHI: va
//! empaquetado en el binario y se carga en memoria una sola vez.
//!
//! La receta es texto libre y el texto sigue siendo lo que vale. La clave es un
//! dato adicional para el sistema que recibe el expediente, asi que solo se
//! pone cuando la coincidencia es exacta y unica; ante cualquier duda, nada.
//! Producto (`010.000.XXXX`):
//!   - un solo generico del compendio en la linea, sin combinaciones;
//!   - la concentracion escrita es la del compendio (sin "mg/5 mL");
//!   - un solo producto con ese generico y esa concentracion, y nada en el
//!     compendio que no se haya podido leer y pudiera ser otro con la misma;
//!   - la forma escrita, si la hay, no contradice la del compendio.
//!
//! Clave completa con envase (decision del 2026-10-20, opcion 3): ademas, el
//! producto tiene un solo envase, o la receta dice la cantidad ("caja con 20")
//! y justo un envase del producto la trae.

use std::sync::OnceLock;

use crate::medication::{csv_fields_quoted, find_word, normalize_name};

const BUNDLED_CNIS_CSV: &str = include_str!("reference_data/cnis.csv");
pub const CATALOG_MANIFEST: &str = include_str!("reference_data/cnis.manifest.json");

/// Sistema de la clave completa (con envase). El CNIS no tiene un URI FHIR oficial.
pub const SYSTEM: &str = "https://midocapp.com.mx/fhir/CodeSystem/cnis";
/// Sistema de la clave de producto (sin envase): no es una clave oficial
/// completa, asi que va en un sistema propio aparte.
pub const PRODUCT_SYSTEM: &str = "https://midocapp.com.mx/fhir/CodeSystem/cnis-producto";

#[derive(Debug, Clone)]
struct Entry {
    clave: String,
    product: String,
    generic: String,
    form: String,
    strength: Option<(f64, String)>,
    /// Unidades del envase, si el compendio las dejo atribuir.
    package_qty: Option<u32>,
    packages: u32,
    complete: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct CnisCoding {
    /// Producto, p. ej. 010.000.0104.
    pub product: String,
    /// Clave completa con envase, solo cuando no hay duda de cual es.
    pub clave: Option<String>,
    /// Edicion del compendio de la que salio la clave.
    pub version: String,
}

struct Catalog {
    entries: Vec<Entry>,
    /// Nombres con los que se busca cada generico (el propio y los sinonimos
    /// revisados del catalogo de ingredientes), del mas largo al mas corto.
    terms: Vec<(String, String)>,
    version: String,
}

fn parse(csv: &str) -> Vec<Entry> {
    csv.lines()
        .skip(1)
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| {
            let f = csv_fields_quoted(line);
            if f.len() < 10 {
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
                package_qty: f[6].parse().ok(),
                packages: f[7].parse().unwrap_or(0),
                complete: f[8] == "1",
            })
        })
        .collect()
}

fn catalog() -> &'static Catalog {
    static CATALOG: OnceLock<Catalog> = OnceLock::new();
    CATALOG.get_or_init(|| {
        let entries = parse(BUNDLED_CNIS_CSV);
        let synonyms: Vec<(String, String)> = crate::ingredients::catalog()
            .iter()
            .filter(|i| i.cnis)
            .flat_map(|i| i.names.iter().map(|n| (n.clone(), i.id.clone())))
            .collect();
        let terms = search_terms(&entries, &synonyms);
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
            terms,
            version,
        }
    })
}

/// Cada generico se busca por su nombre y por los sinonimos que apuntan a el
/// (`(sinonimo, generico)`); los que no son genericos del compendio se ignoran.
fn search_terms(entries: &[Entry], synonyms: &[(String, String)]) -> Vec<(String, String)> {
    let generics: std::collections::BTreeSet<&str> =
        entries.iter().map(|e| e.generic.as_str()).collect();
    let mut terms: Vec<(String, String)> = generics
        .iter()
        .map(|g| (g.to_string(), g.to_string()))
        .chain(
            synonyms
                .iter()
                .filter(|(_, generic)| generics.contains(generic.as_str()))
                .cloned(),
        )
        .collect();
    terms.sort();
    terms.dedup();
    terms.sort_by_key(|(term, _)| std::cmp::Reverse(term.len()));
    terms
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
    // "con", "y" o "mas" unen farmacos, salvo en la cantidad del envase
    // ("caja con 20") o ante una cifra ("y 20 mg" ya no nombra otro farmaco
    // nuevo; si lo nombrara, la busqueda de genericos lo detecta).
    let words: Vec<&str> = text
        .split(|c: char| c.is_whitespace() || c == ',' || c == ';')
        .filter(|w| !w.is_empty())
        .collect();
    let joins_drugs = words.iter().enumerate().any(|(i, w)| {
        matches!(*w, "con" | "y" | "mas")
            && !(i > 0
                && matches!(
                    words[i - 1],
                    "caja" | "cajas" | "envase" | "frasco" | "blister" | "paquete"
                ))
            && !words
                .get(i + 1)
                .is_some_and(|next| next.starts_with(|c: char| c.is_ascii_digit()))
    });
    if joins_drugs {
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

    // Un solo generico: el nombre mas largo encontrado, y ningun otro generico
    // cuyo nombre no sea parte de el.
    let mut found: Vec<(usize, &String, &String)> = Vec::new();
    for (term, generic) in &catalog.terms {
        if let Some(pos) = find_word(&text, term) {
            found.push((pos, term, generic));
        }
    }
    let (pos, term, generic) = *found.first()?;
    if found
        .iter()
        .any(|(_, other_term, other)| other != &generic && !term.contains(other_term.as_str()))
    {
        return None;
    }

    let (value, unit) = match first_strength(&text, pos + term.len()) {
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
    if !form_compatible(&text, &entry.form) {
        return None;
    }

    // Envase: el unico que hay, o el que trae la cantidad escrita en la receta,
    // siempre que se hayan leido todos los envases del producto.
    let packages: Vec<&Entry> = catalog
        .entries
        .iter()
        .filter(|e| e.product == entry.product && &e.generic == generic)
        .collect();
    let clave = if entry.packages == 1 {
        Some(entry.clave.clone())
    } else {
        box_quantity(&text).and_then(|qty| {
            let read: std::collections::HashSet<&str> =
                packages.iter().map(|e| e.clave.as_str()).collect();
            let with_qty: Vec<&&Entry> = packages
                .iter()
                .filter(|e| e.package_qty == Some(qty))
                .collect();
            (read.len() as u32 == entry.packages && with_qty.len() == 1)
                .then(|| with_qty[0].clave.clone())
        })
    };
    Some(CnisCoding {
        product: entry.product.clone(),
        clave,
        version: catalog.version.clone(),
    })
}

/// Cantidad del envase escrita en la receta: "caja con 20", "envase de 30",
/// "frasco con 120 ml". "1 tableta cada 8 horas" no cuenta: es la dosis.
fn box_quantity(text: &str) -> Option<u32> {
    let words: Vec<&str> = text
        .split(|c: char| c.is_whitespace() || c == ',' || c == ';' || c == ':')
        .filter(|w| !w.is_empty())
        .collect();
    words.windows(3).find_map(|w| {
        let container = matches!(
            w[0],
            "caja" | "cajas" | "envase" | "frasco" | "blister" | "paquete"
        );
        let link = matches!(w[1], "con" | "de");
        let number = w[2].trim_end_matches('.');
        (container && link)
            .then(|| number.parse::<u32>().ok())
            .flatten()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const CSV: &str = "clave,product,generic,form,strength_value,strength_unit,package_qty,packages,complete,source
010.000.0104.00,010.000.0104,paracetamol,tableta,500,mg,10,1,1,pdf
010.000.0106.00,010.000.0106,paracetamol,solucion oral,100,mg,1,1,1,pdf
010.000.5940.00,010.000.5940,ibuprofeno,tableta o capsula,200,mg,10,2,1,pdf
010.000.5940.01,010.000.5940,ibuprofeno,tableta o capsula,200,mg,20,2,1,pdf
010.000.5941.00,010.000.5941,ibuprofeno,tableta o capsula,400,mg,10,3,1,pdf
010.000.5941.01,010.000.5941,ibuprofeno,tableta o capsula,400,mg,20,3,1,pdf
010.000.2114.00,010.000.2114,felodipino,tableta de liberacion prolongada,5,mg,10,1,1,pdf
010.000.0261.00,010.000.0261,lidocaina,solucion inyectable al 1%,,,,1,0,pdf
010.000.1042.00,010.000.1042,glibenclamida,tableta,5,mg,50,1,1,pdf
010.000.1043.00,010.000.1043,glibenclamida,tableta,5,mg,30,1,1,pdf
010.000.0472.00,010.000.0472,prednisona,tableta,5,mg,20,1,1,pdf
010.000.0473.00,010.000.0473,prednisona,tableta,50,mg,20,1,0,pdf
010.000.2501.00,010.000.2501,metformina,tableta,850,mg,30,1,1,pdf
010.000.4307.00,010.000.4307,cilostazol,tableta,100,mg,30,1,1,pdf
010.000.5186.00,010.000.5186,omeprazol,tableta o gragea o capsula,20,mg,7,3,1,pdf
010.000.5186.00,010.000.5186,pantoprazol,tableta o gragea o capsula,40,mg,7,3,1,pdf
010.000.5186.01,010.000.5186,omeprazol,tableta o gragea o capsula,20,mg,14,3,1,pdf
010.000.5186.02,010.000.5186,omeprazol,tableta o gragea o capsula,20,mg,28,3,1,pdf
";

    fn test_catalog() -> Catalog {
        let entries = parse(CSV);
        let synonyms = vec![
            ("acetaminofen".to_string(), "paracetamol".to_string()),
            (
                "tempra".to_string(),
                "no existe en el compendio".to_string(),
            ),
        ];
        let terms = search_terms(&entries, &synonyms);
        Catalog {
            entries,
            terms,
            version: "2025-04-26".into(),
        }
    }

    /// Clave completa, o None.
    fn code(line: &str) -> Option<String> {
        code_with(&test_catalog(), line).and_then(|c| c.clave)
    }

    /// Producto, o None.
    fn product(line: &str) -> Option<String> {
        code_with(&test_catalog(), line).map(|c| c.product)
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
        assert_eq!(coding.product, "010.000.2501");
        assert_eq!(coding.version, "2025-04-26");
    }

    #[test]
    fn reviewed_synonyms_find_their_generic() {
        assert_eq!(
            code("Acetaminofén 500 mg tabletas").as_deref(),
            Some("010.000.0104.00")
        );
        assert_eq!(
            product("Tempra 500 mg"),
            None,
            "solo sinonimos de genericos del compendio"
        );
        assert_eq!(
            product("Acetaminofén 500 mg con metformina 850 mg"),
            None,
            "dos farmacos"
        );
    }

    #[test]
    fn needs_the_strength_written() {
        assert_eq!(product("Paracetamol tabletas"), None);
        assert_eq!(product("Paracetamol 750 mg tabletas"), None);
    }

    #[test]
    fn rejects_per_volume_strengths() {
        assert_eq!(product("Paracetamol 100 mg/mL gotas"), None);
    }

    #[test]
    fn rejects_contradicting_forms() {
        assert_eq!(product("Paracetamol 500 mg jarabe"), None);
        assert_eq!(product("Paracetamol 500 mg ampolletas"), None);
    }

    #[test]
    fn requires_the_written_form_to_carry_modifiers() {
        // El compendio solo tiene felodipino de liberacion prolongada: sin
        // decirlo, la clave diria mas de lo que escribio el medico.
        assert_eq!(product("Felodipino 5 mg tabletas"), None);
        assert_eq!(
            code("Felodipino 5 mg tabletas de liberación prolongada").as_deref(),
            Some("010.000.2114.00")
        );
    }

    #[test]
    fn the_written_form_separates_products_with_the_same_strength() {
        let mut catalog = test_catalog();
        catalog.entries.extend(parse(
            "h\n010.000.5720.00,010.000.5720,paracetamol,solucion inyectable,500,mg,1,1,1,pdf\n",
        ));
        let coded = |line: &str| code_with(&catalog, line).and_then(|c| c.clave);
        assert_eq!(
            coded("Paracetamol 500 mg tabletas").as_deref(),
            Some("010.000.0104.00")
        );
        assert_eq!(
            coded("Paracetamol 500 mg ampolleta").as_deref(),
            Some("010.000.5720.00")
        );
        assert_eq!(
            code_with(&catalog, "Paracetamol 500 mg"),
            None,
            "sin forma escrita hay dos productos"
        );
    }

    #[test]
    fn several_packages_give_the_product_and_the_written_quantity_picks_one() {
        // Sin cantidad: producto si, envase no (no se inventa la caja).
        assert_eq!(
            product("Ibuprofeno 200 mg tabletas").as_deref(),
            Some("010.000.5940")
        );
        assert_eq!(code("Ibuprofeno 200 mg tabletas"), None);
        assert_eq!(
            code("Ibuprofeno 200 mg tabletas, 1 tableta cada 8 horas"),
            None
        );
        // Con la cantidad escrita y un envase que la trae: clave completa.
        assert_eq!(
            code("Ibuprofeno 200 mg tabletas, caja con 20").as_deref(),
            Some("010.000.5940.01")
        );
        assert_eq!(
            code("Ibuprofeno 200 mg, envase de 10 tabletas").as_deref(),
            Some("010.000.5940.00")
        );
        // Cantidad que no existe en el compendio: solo producto.
        assert_eq!(code("Ibuprofeno 200 mg tabletas, caja con 30"), None);
        assert_eq!(
            product("Ibuprofeno 200 mg tabletas, caja con 30").as_deref(),
            Some("010.000.5940")
        );
        // Un envase del producto sin leer (3 envases, 2 leidos): no se elige.
        assert_eq!(code("Ibuprofeno 400 mg tabletas, caja con 20"), None);
        assert_eq!(
            product("Ibuprofeno 400 mg tabletas").as_deref(),
            Some("010.000.5941")
        );
    }

    #[test]
    fn alternatives_in_one_product_code_each_with_its_strength() {
        assert_eq!(
            product("Omeprazol 20 mg cápsulas").as_deref(),
            Some("010.000.5186")
        );
        assert_eq!(
            code("Omeprazol 20 mg cápsulas, caja con 14").as_deref(),
            Some("010.000.5186.01")
        );
        assert_eq!(
            product("Pantoprazol 40 mg tabletas").as_deref(),
            Some("010.000.5186")
        );
        assert_eq!(
            product("Omeprazol 40 mg cápsulas"),
            None,
            "40 mg es del pantoprazol"
        );
    }

    #[test]
    fn rejects_two_products_with_the_same_strength() {
        assert_eq!(product("Glibenclamida 5 mg"), None);
    }

    #[test]
    fn rejects_when_an_unread_entry_could_be_the_same() {
        assert_eq!(product("Lidocaina 1% solucion inyectable"), None);
        // Una entrada incompleta con la misma concentracion bloquea; con otra, no.
        assert_eq!(product("Prednisona 50 mg"), None);
        assert_eq!(code("Prednisona 5 mg").as_deref(), Some("010.000.0472.00"));
    }

    #[test]
    fn rejects_combinations_and_two_drugs() {
        assert_eq!(product("Paracetamol 500 mg + cafeína 65 mg"), None);
        assert_eq!(product("Metformina/glibenclamida 500/5 mg"), None);
        assert_eq!(product("Paracetamol con metformina 500 mg"), None);
        assert_eq!(product("Paracetamol 500 mg metformina 850 mg"), None);
    }

    #[test]
    fn reads_the_box_quantity_only_from_container_words() {
        assert_eq!(box_quantity("caja con 20"), Some(20));
        assert_eq!(box_quantity("frasco de 120 ml"), Some(120));
        assert_eq!(box_quantity("envase con 30."), Some(30));
        assert_eq!(box_quantity("1 tableta cada 8 horas por 20 dias"), None);
        assert_eq!(box_quantity("caja con veinte"), None);
    }

    #[test]
    fn bundled_catalog_codes_common_products() {
        let catalog = catalog();
        assert!(
            catalog.entries.len() > 2000,
            "{} filas",
            catalog.entries.len()
        );
        assert!(!catalog.version.is_empty());
        let full = |line: &str| code_medication(line).and_then(|c| c.clave);
        let product = |line: &str| code_medication(line).map(|c| c.product);
        assert_eq!(
            full("Paracetamol 500 mg tabletas").as_deref(),
            Some("010.000.0104.00")
        );
        assert_eq!(
            full("Cilostazol 100 mg tabletas").as_deref(),
            Some("010.000.4307.00")
        );
        assert_eq!(
            product("Atorvastatina 20 mg tabletas").as_deref(),
            Some("010.000.5106")
        );
        assert_eq!(
            full("Atorvastatina 20 mg tabletas, caja con 30").as_deref(),
            Some("010.000.5106.01")
        );
        assert_eq!(
            product("Clonazepam 2 mg tabletas").as_deref(),
            Some("040.000.2612")
        );
        for entry in catalog.entries.iter().filter(|e| e.complete) {
            assert!(
                ["010", "020", "030", "040"].contains(&&entry.clave[..3]),
                "{}",
                entry.clave
            );
            assert_eq!(&entry.clave[..12], entry.product);
        }
    }
}
