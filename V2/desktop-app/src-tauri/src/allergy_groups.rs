//! Grupos de alergia: cuando el expediente dice "alergia a cefalosporinas" o
//! "a sulfas", que medicamentos quedan cubiertos.
//!
//! Medido el 2026-11-15: la alerta solo comparaba contra la clase de la base de
//! interacciones (un subconjunto curado para interacciones, no para alergias),
//! asi que "Macrolidos" no alertaba con claritromicina, "Sulfas" no alertaba con
//! sulfametoxazol y "Aspirina" no alertaba con acido acetilsalicilico.
//!
//! ALCANCE: solo pertenencia a la MISMA familia farmacologica o el mismo
//! farmaco con otro nombre. La reactividad CRUZADA entre familias (penicilina y
//! cefalosporinas, aspirina y el resto de los AINE, codeina y otros opioides,
//! carbamazepina y oxcarbazepina) es decision clinica y no esta aqui; ver
//! PENDIENTES.md. Metamizol se deja fuera de AINE por la misma razon.
//!
//! Es logica pura sobre texto normalizado (minusculas, sin acentos).

/// Una familia: los nombres con que el medico la escribe en alergias y los
/// farmacos que la forman (genericos en espanol y en ingles de la base).
struct Group {
    name: &'static str,
    aliases: &'static [&'static str],
    members: &'static [&'static str],
}

const GROUPS: &[Group] = &[
    Group {
        name: "Penicilinas",
        aliases: &["penicilina", "penicilinas", "penicillin"],
        members: &[
            "penicilina",
            "bencilpenicilina",
            "amoxicilina",
            "ampicilina",
            "dicloxacilina",
            "piperacilina",
            "penicillin",
            "benzylpenicillin",
            "amoxicillin",
            "ampicillin",
            "dicloxacillin",
            "piperacillin",
        ],
    },
    Group {
        name: "Cefalosporinas",
        aliases: &["cefalosporina", "cefalosporinas"],
        members: &[
            "cefalexina",
            "cefalotina",
            "cefadroxilo",
            "cefaclor",
            "cefuroxima",
            "cefixima",
            "cefotaxima",
            "ceftriaxona",
            "ceftazidima",
            "cefepima",
            "cefazolina",
            "cefoxitina",
            "ceftarolina",
            "cefpodoxima",
            "cefprozilo",
        ],
    },
    Group {
        name: "Betalactamicos",
        aliases: &[
            "betalactamico",
            "betalactamicos",
            "beta lactamico",
            "beta lactamicos",
        ],
        members: &[
            "penicilina",
            "bencilpenicilina",
            "amoxicilina",
            "ampicilina",
            "dicloxacilina",
            "piperacilina",
            "penicillin",
            "benzylpenicillin",
            "amoxicillin",
            "ampicillin",
            "dicloxacillin",
            "piperacillin",
            "cefalexina",
            "cefalotina",
            "cefadroxilo",
            "cefaclor",
            "cefuroxima",
            "cefixima",
            "cefotaxima",
            "ceftriaxona",
            "ceftazidima",
            "cefepima",
            "cefazolina",
            "cefoxitina",
            "ceftarolina",
            "cefpodoxima",
            "cefprozilo",
            "imipenem",
            "meropenem",
            "ertapenem",
            "aztreonam",
        ],
    },
    Group {
        name: "Sulfonamidas",
        aliases: &[
            "sulfa",
            "sulfas",
            "sulfonamida",
            "sulfonamidas",
            "sulfamida",
            "sulfamidas",
        ],
        members: &[
            "sulfametoxazol",
            "sulfamethoxazole",
            "sulfadiazina",
            "sulfasalazina",
            "sulfacetamida",
        ],
    },
    Group {
        name: "AINE",
        aliases: &[
            "aine",
            "aines",
            "antiinflamatorio no esteroideo",
            "antiinflamatorios no esteroideos",
        ],
        members: &[
            "ibuprofeno",
            "ibuprofen",
            "naproxeno",
            "naproxen",
            "diclofenaco",
            "diclofenac",
            "ketorolaco",
            "ketorolac",
            "meloxicam",
            "celecoxib",
            "etoricoxib",
            "indometacina",
            "piroxicam",
            "nimesulida",
            "ketoprofeno",
            "dexketoprofeno",
            "aceclofenaco",
            "sulindaco",
            "acido mefenamico",
            "acido acetilsalicilico",
            "aspirina",
            "aspirin",
        ],
    },
    Group {
        name: "Aspirina",
        aliases: &["aspirina", "asa", "acido acetilsalicilico"],
        members: &["acido acetilsalicilico", "aspirina", "aspirin"],
    },
    Group {
        name: "Metamizol",
        aliases: &["metamizol", "dipirona", "pirazolona", "pirazolonas"],
        members: &["metamizol", "dipirona"],
    },
    Group {
        name: "Quinolonas",
        aliases: &[
            "quinolona",
            "quinolonas",
            "fluoroquinolona",
            "fluoroquinolonas",
        ],
        members: &[
            "ciprofloxacino",
            "ciprofloxacin",
            "levofloxacino",
            "levofloxacin",
            "moxifloxacino",
            "moxifloxacin",
            "norfloxacino",
            "ofloxacino",
        ],
    },
    Group {
        name: "Macrolidos",
        aliases: &["macrolido", "macrolidos"],
        members: &[
            "azitromicina",
            "azithromycin",
            "claritromicina",
            "clarithromycin",
            "eritromicina",
            "erythromycin",
        ],
    },
    Group {
        name: "Tetraciclinas",
        aliases: &["tetraciclina", "tetraciclinas"],
        members: &["tetraciclina", "doxiciclina", "minociclina"],
    },
    Group {
        name: "Opioides",
        aliases: &["opioide", "opioides", "opiaceo", "opiaceos"],
        members: &[
            "codeina",
            "codeine",
            "morfina",
            "morphine",
            "tramadol",
            "oxicodona",
            "oxycodone",
            "hidrocodona",
            "hydrocodone",
            "buprenorfina",
            "fentanilo",
            "fentanyl",
            "tapentadol",
            "nalbufina",
            "metadona",
            "hidromorfona",
        ],
    },
    Group {
        name: "IECA",
        aliases: &[
            "ieca",
            "iecas",
            "inhibidor de la eca",
            "inhibidores de la eca",
        ],
        members: &[
            "enalapril",
            "captopril",
            "lisinopril",
            "ramipril",
            "perindopril",
            "quinapril",
        ],
    },
];

/// `needle` aparece en `haystack` como palabra(s) completa(s).
fn has_words(haystack: &str, needle: &str) -> bool {
    crate::medication::find_word(haystack, needle).is_some()
}

/// Si la alergia registrada (`token`, normalizado) nombra una familia y alguno
/// de los nombres del farmaco (normalizados) pertenece a ella, devuelve el
/// nombre de la familia.
pub fn matching_group(token: &str, drug_names: &[&str]) -> Option<&'static str> {
    GROUPS
        .iter()
        .filter(|group| group.aliases.iter().any(|alias| has_words(token, alias)))
        .find(|group| {
            drug_names.iter().any(|name| {
                !name.is_empty() && group.members.iter().any(|member| has_words(name, member))
            })
        })
        .map(|group| group.name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_family_allergy_covers_its_members() {
        assert_eq!(
            matching_group("cefalosporinas", &["ceftriaxona"]),
            Some("Cefalosporinas")
        );
        assert_eq!(
            matching_group("sulfas", &["sulfametoxazol"]),
            Some("Sulfonamidas")
        );
        assert_eq!(
            matching_group("macrolidos", &["claritromicina"]),
            Some("Macrolidos")
        );
        assert_eq!(
            matching_group("aine", &["metamizol sodico", "celecoxib"]),
            Some("AINE")
        );
        assert_eq!(matching_group("opioides", &["tramadol"]), Some("Opioides"));
    }

    #[test]
    fn the_same_drug_by_another_name_matches() {
        assert_eq!(
            matching_group("aspirina", &["acido acetilsalicilico"]),
            Some("Aspirina")
        );
        assert_eq!(
            matching_group("dipirona", &["metamizol sodico"]),
            Some("Metamizol")
        );
    }

    #[test]
    fn cross_reactivity_between_families_is_not_assumed() {
        // Decision clinica pendiente: no se alerta por familia vecina.
        assert_eq!(matching_group("penicilina", &["cefalexina"]), None);
        assert_eq!(matching_group("aspirina", &["ibuprofeno"]), None);
        assert_eq!(matching_group("codeina", &["morfina"]), None);
        assert_eq!(matching_group("aine", &["metamizol sodico"]), None);
    }

    #[test]
    fn requires_whole_words() {
        // "penicilamina" no es una penicilina; "asa" no esta en "masaje".
        assert_eq!(matching_group("penicilina", &["penicilamina"]), None);
        assert_eq!(matching_group("masaje", &["aspirina"]), None);
        assert_eq!(matching_group("latex", &["ibuprofeno"]), None);
    }
}
