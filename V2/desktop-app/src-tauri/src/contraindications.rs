//! Medicamento contra padecimiento y alertas graves al firmar (paso 33, etapa 5).
//!
//! Reglas revisadas (`reference_data/contraindications.csv`, generadas con
//! `npm run contraindications:build` desde `scripts/contraindications/reglas.csv`
//! con fuente y revisor): un principio activo contra un diagnostico CIE-10 o su
//! grupo. Se cruzan con los diagnosticos CIE-10 del paciente (esta consulta y
//! las anteriores). Los antecedentes en texto libre no se interpretan.
//!
//! Alertas graves (decision del 2026-10-20): contraindicaciones, alergias e
//! interacciones contraindicadas o mayores. Si la receta guardada tiene alguna,
//! firmar exige que el medico la confirme antes; la confirmacion queda en la
//! bitacora (sin nombres de farmacos ni diagnosticos, solo una huella). Nunca
//! bloquean definitivamente: decide el medico.
//!
//! Todo esto va tras el interruptor de la seguridad farmacologica
//! (`capabilities`): apagado, firmar no pide nada.

use std::sync::OnceLock;

use rusqlite::{params, Connection};
use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::medication::{self, csv_fields_quoted, MedicationError};
use crate::{capabilities, cie10, clinical, ingredients, prescription};

const BUNDLED_RULES_CSV: &str = include_str!("reference_data/contraindications.csv");

#[derive(Debug, Clone, PartialEq)]
struct Rule {
    ingredient: String,
    cie10: String,
    condition: String,
    severity: String,
    recommendation: String,
    source: String,
}

/// Contraindicacion o precaucion encontrada.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct ContraindicationAlert {
    /// Principio activo, como se muestra.
    pub drug: String,
    /// La linea de la receta de la que salio.
    pub line: String,
    pub condition: String,
    /// Diagnostico del paciente que la dispara (A18.2) y su nombre.
    pub diagnosis_code: String,
    pub diagnosis_name: String,
    /// CONTRAINDICADA | PRECAUCION.
    pub severity: String,
    pub recommendation: String,
    pub source: String,
    /// El diagnostico es de esta consulta (si no, de una anterior).
    pub current_encounter: bool,
}

/// Alerta grave que hay que confirmar antes de firmar.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct SevereAlert {
    /// Identifica la alerta para la huella (sin texto clinico).
    pub key: String,
    /// Lo que ve el medico.
    pub text: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct PendingSevereAlerts {
    pub alerts: Vec<SevereAlert>,
    /// Huella de las alertas; la confirmacion debe traer la misma.
    pub fingerprint: String,
    /// Ya se confirmaron estas mismas alertas.
    pub acknowledged: bool,
}

fn parse(csv: &str) -> Vec<Rule> {
    csv.lines()
        .skip(1)
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| {
            let f = csv_fields_quoted(line);
            (f.len() >= 6 && !f[0].is_empty()).then(|| Rule {
                ingredient: f[0].clone(),
                cie10: f[1].clone(),
                condition: f[2].clone(),
                severity: f[3].clone(),
                recommendation: f[4].clone(),
                source: f[5].clone(),
            })
        })
        .collect()
}

fn rules() -> &'static [Rule] {
    static RULES: OnceLock<Vec<Rule>> = OnceLock::new();
    RULES.get_or_init(|| parse(BUNDLED_RULES_CSV))
}

/// Diagnosticos CIE-10 del paciente: `(clave, nombre, es de esta consulta)`.
fn patient_diagnoses(
    conn: &Connection,
    encounter_id: &str,
) -> Result<Vec<(String, String, bool)>, MedicationError> {
    let detail = clinical::get_encounter_detail(conn, encounter_id)
        .map_err(|e| MedicationError::Invalid(e.to_string()))?;
    let history = clinical::history_entries(conn, &detail.encounter.patient_id, None)
        .map_err(|e| MedicationError::Invalid(e.to_string()))?;
    let mut codes: Vec<(String, String, bool)> = Vec::new();
    for entry in history {
        let current = entry.encounter_id == encounter_id;
        for diagnosis in entry.coded_diagnoses {
            match codes.iter_mut().find(|(code, ..)| *code == diagnosis.code) {
                Some(existing) => existing.2 |= current,
                None => codes.push((diagnosis.code, diagnosis.name, current)),
            }
        }
    }
    Ok(codes)
}

fn check_with(
    rules: &[Rule],
    items: &[prescription::PrescriptionItem],
    diagnoses: &[(String, String, bool)],
) -> Vec<ContraindicationAlert> {
    let mut alerts = Vec::new();
    for item in items {
        for ingredient in &item.ingredient_ids {
            for rule in rules.iter().filter(|r| &r.ingredient == ingredient) {
                for (code, name, current) in diagnoses
                    .iter()
                    .filter(|(c, ..)| c.starts_with(&rule.cie10))
                {
                    alerts.push(ContraindicationAlert {
                        drug: ingredients::catalog()
                            .resolve(ingredient)
                            .map(|i| i.display.clone())
                            .unwrap_or_else(|| ingredient.clone()),
                        line: item.line.clone(),
                        condition: rule.condition.clone(),
                        diagnosis_code: cie10::display_code(code),
                        diagnosis_name: name.clone(),
                        severity: rule.severity.clone(),
                        recommendation: rule.recommendation.clone(),
                        source: rule.source.clone(),
                        current_encounter: *current,
                    });
                }
            }
        }
    }
    alerts
}

/// Contraindicaciones y precauciones de la receta para el paciente de la consulta.
pub fn check(
    conn: &Connection,
    encounter_id: &str,
    prescription_text: &str,
) -> Result<Vec<ContraindicationAlert>, MedicationError> {
    let items = prescription::analyze(conn, prescription_text)?;
    let diagnoses = patient_diagnoses(conn, encounter_id)?;
    Ok(check_with(rules(), &items, &diagnoses))
}

/// Alertas graves de la receta guardada de la consulta.
fn severe_alerts(
    conn: &Connection,
    encounter_id: &str,
) -> Result<Vec<SevereAlert>, MedicationError> {
    let detail = clinical::get_encounter_detail(conn, encounter_id)
        .map_err(|e| MedicationError::Invalid(e.to_string()))?;
    let Some(text) = detail.prescription.filter(|t| !t.trim().is_empty()) else {
        return Ok(Vec::new());
    };
    let mut alerts: Vec<SevereAlert> = check(conn, encounter_id, &text)?
        .into_iter()
        .filter(|a| a.severity == "CONTRAINDICADA")
        .map(|a| SevereAlert {
            key: format!("ci:{}:{}", a.drug, a.diagnosis_code),
            text: format!(
                "{} contraindicado con {} ({} {}). {}",
                a.drug, a.condition, a.diagnosis_code, a.diagnosis_name, a.recommendation
            ),
        })
        .collect();

    let names = medication::extract_medications(conn, &text)?;
    if !names.is_empty() {
        let report = medication::check_prescription(
            conn,
            encounter_id,
            &names,
            detail.patient.allergies.as_deref(),
        )?;
        for alert in report
            .interactions
            .iter()
            .filter(|a| matches!(a.severity.as_str(), "CONTRAINDICATED" | "MAJOR"))
        {
            alerts.push(SevereAlert {
                key: format!("ddi:{}:{}", alert.drug_a, alert.drug_b),
                text: format!(
                    "Interacción grave: {} + {}. {}",
                    alert.drug_a, alert.drug_b, alert.description
                ),
            });
        }
        for alert in &report.triple_interactions {
            alerts.push(SevereAlert {
                key: format!("tri:{}:{}:{}", alert.drug_a, alert.drug_b, alert.drug_c),
                text: format!(
                    "Interacción triple: {} + {} + {}. {}",
                    alert.drug_a, alert.drug_b, alert.drug_c, alert.description
                ),
            });
        }
        for alert in &report.allergy_alerts {
            alerts.push(SevereAlert {
                key: format!("alg:{}:{}", alert.drug, alert.matched_allergy),
                text: format!(
                    "Alergia: {} coincide con la alergia registrada \"{}\".",
                    alert.drug, alert.matched_allergy
                ),
            });
        }
    }
    alerts.sort_by(|a, b| a.key.cmp(&b.key));
    alerts.dedup_by(|a, b| a.key == b.key);
    Ok(alerts)
}

/// Huella de un conjunto de alertas graves: cambia solo si cambian las alertas
/// (lo ya confirmado no se vuelve a pedir por un cambio que no agrega ninguna).
fn fingerprint(encounter_id: &str, alerts: &[SevereAlert]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(encounter_id.as_bytes());
    for alert in alerts {
        hasher.update(b"\n");
        hasher.update(alert.key.as_bytes());
    }
    hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn acknowledged(
    conn: &Connection,
    encounter_id: &str,
    print: &str,
) -> Result<bool, MedicationError> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM clinical_audit
         WHERE entity = 'medication_alerts' AND entity_id = ?1 AND action = 'acknowledged'
           AND details = ?2",
        params![encounter_id, format!("fingerprint={print}")],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

/// Alertas graves pendientes de la receta guardada, con su huella.
pub fn pending(
    conn: &Connection,
    encounter_id: &str,
) -> Result<PendingSevereAlerts, MedicationError> {
    let alerts = severe_alerts(conn, encounter_id)?;
    let print = fingerprint(encounter_id, &alerts);
    let acknowledged = alerts.is_empty() || acknowledged(conn, encounter_id, &print)?;
    Ok(PendingSevereAlerts {
        alerts,
        fingerprint: print,
        acknowledged,
    })
}

/// El medico confirma que reviso estas alertas. La huella debe ser la de las
/// alertas actuales: si la receta cambio, hay que volver a verlas.
pub fn acknowledge(
    conn: &Connection,
    encounter_id: &str,
    print: &str,
) -> Result<(), MedicationError> {
    let current = pending(conn, encounter_id)?;
    if current.fingerprint != print {
        return Err(MedicationError::Invalid(
            "las alertas cambiaron; revisalas de nuevo".into(),
        ));
    }
    // Solo la cantidad y la huella: nada clinico en la bitacora (regla 4).
    conn.execute(
        "INSERT INTO clinical_audit (entity, entity_id, action, at, details)
         VALUES ('medication_alerts', ?1, 'acknowledged', ?2, ?3)",
        params![
            encounter_id,
            chrono::Utc::now().to_rfc3339(),
            format!("fingerprint={print}")
        ],
    )?;
    Ok(())
}

/// Candado de la firma: con la seguridad farmacologica encendida, no se firma
/// con alertas graves sin confirmar.
pub fn require_acknowledged(conn: &Connection, encounter_id: &str) -> Result<(), String> {
    if !capabilities::current().medication_safety {
        return Ok(());
    }
    require_acknowledged_when_enabled(conn, encounter_id)
}

fn require_acknowledged_when_enabled(conn: &Connection, encounter_id: &str) -> Result<(), String> {
    let pending = pending(conn, encounter_id).map_err(|e| e.to_string())?;
    if pending.acknowledged {
        Ok(())
    } else {
        Err(format!(
            "La receta tiene {} alerta(s) grave(s) de medicamentos sin confirmar. Revisalas antes de firmar.",
            pending.alerts.len()
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_encrypted;

    fn test_conn(name: &str) -> Connection {
        let dir = std::env::temp_dir().join("midoc-contraindications-tests");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(format!("{name}-{}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        let conn = open_encrypted(&path, "clave-de-prueba").unwrap();
        medication::install_bundled_reference(&conn).unwrap();
        conn
    }

    // Reglas de prueba: las reales las escriben y revisan el medico piloto y el farmaceutico.
    const RULES: &str = "ingredient,cie10,condition,severity,recommendation,source\n\
ibuprofeno,K25,Ulcera gastrica,CONTRAINDICADA,Evitar AINE,Prueba\n\
metformina,N18,Enfermedad renal cronica,PRECAUCION,Ajustar dosis,Prueba\n";

    fn item(line: &str, ids: &[&str]) -> prescription::PrescriptionItem {
        prescription::PrescriptionItem {
            line: line.into(),
            brand: None,
            generic: String::new(),
            ingredient_ids: ids.iter().map(|s| s.to_string()).collect(),
            cnis_description: None,
            cnis_product: None,
            cnis_clave: None,
            cnis_version: None,
        }
    }

    #[test]
    fn matches_rules_against_diagnosis_groups() {
        let rules = parse(RULES);
        let items = vec![
            item("Ibuprofeno 400 mg", &["ibuprofeno"]),
            item("Metformina 850 mg", &["metformina"]),
            item("Paracetamol 500 mg", &["paracetamol"]),
        ];
        let diagnoses = vec![
            ("K259".to_string(), "ULCERA GASTRICA".to_string(), false),
            (
                "N189".to_string(),
                "ENFERMEDAD RENAL CRONICA".to_string(),
                true,
            ),
        ];
        let alerts = check_with(&rules, &items, &diagnoses);
        assert_eq!(alerts.len(), 2);
        assert_eq!(alerts[0].severity, "CONTRAINDICADA");
        assert_eq!(alerts[0].diagnosis_code, "K25.9");
        assert!(!alerts[0].current_encounter);
        assert_eq!(alerts[1].severity, "PRECAUCION");
        assert!(alerts[1].current_encounter);
        assert!(
            check_with(&rules, &items, &[]).is_empty(),
            "sin diagnosticos no hay alertas"
        );
    }

    fn seed_encounter(conn: &Connection, prescription: &str, diagnosis: &str) -> String {
        let patient = clinical::create_patient(
            conn,
            &clinical::NewPatientInput {
                first_name: "Paciente".into(),
                last_name: "Ficticio".into(),
                phone: None,
                email: None,
                birth_date: None,
                sex: None,
            },
        )
        .unwrap();
        conn.execute(
            "UPDATE patients SET allergies = 'Penicilina' WHERE id = ?1",
            params![patient.id],
        )
        .unwrap();
        let today = chrono::Utc::now().date_naive();
        let encounter = clinical::open_encounter_for_patient(conn, &patient.id, today).unwrap();
        let mut note = clinical::NoteContent {
            diagnosis: "Prueba".into(),
            ..Default::default()
        };
        note.coded_diagnoses = vec![clinical::CodedDiagnosis {
            code: diagnosis.into(),
            name: String::new(),
            principal: true,
        }];
        clinical::save_note(conn, &encounter.id, &note).unwrap();
        clinical::save_prescription(conn, &encounter.id, prescription).unwrap();
        encounter.id
    }

    #[test]
    fn severe_alerts_must_be_acknowledged_before_signing() {
        let conn = test_conn("severe");
        // Alergia a penicilina + amoxicilina: alerta grave real de la base.
        let encounter = seed_encounter(&conn, "Amoxicilina 500 mg cada 8 h", "J00");
        let pending_alerts = pending(&conn, &encounter).unwrap();
        assert!(!pending_alerts.alerts.is_empty(), "{pending_alerts:?}");
        assert!(!pending_alerts.acknowledged);
        assert!(pending_alerts.alerts.iter().all(|a| !a.key.is_empty()));
        assert!(require_acknowledged_when_enabled(&conn, &encounter).is_err());

        assert!(acknowledge(&conn, &encounter, "otra huella").is_err());
        acknowledge(&conn, &encounter, &pending_alerts.fingerprint).unwrap();
        assert!(require_acknowledged_when_enabled(&conn, &encounter).is_ok());

        // Un cambio que no agrega alertas graves no pide confirmar otra vez...
        clinical::save_prescription(&conn, &encounter, "Amoxicilina 500 mg cada 12 h").unwrap();
        assert!(pending(&conn, &encounter).unwrap().acknowledged);
        // ...pero una alerta grave nueva si (acenocumarol + aspirina, interaccion mayor).
        clinical::save_prescription(
            &conn,
            &encounter,
            "Amoxicilina 500 mg cada 12 h\nAcenocumarol 4 mg\nAspirina 100 mg",
        )
        .unwrap();
        let changed = pending(&conn, &encounter).unwrap();
        assert_ne!(changed.fingerprint, pending_alerts.fingerprint);
        assert!(!changed.acknowledged);

        // La bitacora no guarda nombres de farmacos ni diagnosticos.
        let details: String = conn
            .query_row(
                "SELECT details FROM clinical_audit WHERE entity = 'medication_alerts'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(details.starts_with("fingerprint="));
        assert!(!details.to_lowercase().contains("amoxicilina"));
    }

    #[test]
    fn a_prescription_without_severe_alerts_signs_freely() {
        let conn = test_conn("clean");
        let encounter = seed_encounter(&conn, "Paracetamol 500 mg tabletas", "J00");
        let pending_alerts = pending(&conn, &encounter).unwrap();
        assert!(pending_alerts.alerts.is_empty());
        assert!(pending_alerts.acknowledged);
        assert!(require_acknowledged_when_enabled(&conn, &encounter).is_ok());
    }

    #[test]
    fn the_bundled_rules_parse() {
        // Arranca sin reglas hasta que las revisen; si hay, deben tener fuente.
        for rule in rules() {
            assert!(!rule.source.is_empty());
            assert!(matches!(
                rule.severity.as_str(),
                "CONTRAINDICADA" | "PRECAUCION"
            ));
        }
    }
}
