//! Exportacion HL7 FHIR R4 del expediente (paso 28, rebanada 5).
//!
//! Clase de residencia: CLINICO. Convierte los datos de `export::record_export`
//! en un Bundle FHIR R4 (JSON) de tipo `collection`, para llevar el expediente a
//! otro sistema o entregarselo al paciente (portabilidad ARCO). Se arma en Rust
//! y se escribe directo al archivo que eligio el medico: los documentos
//! adjuntos viajan dentro del Bundle sin pasar por la pagina.
//!
//! Mapeo:
//! - Paciente -> `Patient` (nombre, sexo, nacimiento, telefono, correo y responsable).
//! - Medico -> `Practitioner` con la cedula profesional como identificador.
//! - Alergias (texto libre) -> un `AllergyIntolerance` por termino; las
//!   negaciones ("niega", "ninguna") no se convierten en alergias.
//! - Antecedentes -> `Composition` "Antecedentes del paciente" (solo en el
//!   expediente completo, como el PDF).
//! - Consulta -> `Encounter` + `Composition` con la nota SOAP como narrativa, su
//!   estado de firma y la huella.
//! - Diagnosticos CIE-10 -> `Condition` con el sistema ICD-10 de la OMS (la
//!   CIE-10 de la Secretaria de Salud usa las mismas claves). Sin codigos, el
//!   diagnostico en texto libre sale como `Condition` solo con texto.
//! - Receta (texto libre) -> un `MedicationRequest` por medicamento: la linea
//!   que nombra un medicamento de la referencia local abre uno nuevo y las
//!   siguientes son sus indicaciones. El texto integro va tambien en la nota.
//! - Documentos -> `DocumentReference` con el archivo dentro (base64).
//!
//! Los ids son UUID v5 derivados de los ids locales: exportar dos veces el mismo
//! expediente da los mismos recursos y el sistema receptor puede reconocerlos.
//! La plantilla de especialidad (odontograma, etc.) todavia no se exporta.

use std::collections::{HashMap, HashSet};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use chrono::Datelike as _;
use rusqlite::{params, Connection};
use serde_json::{json, Map, Value};
use uuid::Uuid;

use crate::clinical::CodedDiagnosis;
use crate::export::{self, ExportDoctor, ExportDocument, ExportEncounter, ExportError, RecordExport};
use crate::medication;

/// Espacio de nombres de los UUID v5 de MiDoc. No cambiarlo: cambiaria los ids
/// de todo lo exportado.
const NAMESPACE: Uuid = Uuid::from_u128(0x8a33e6da_182a_475a_a41a_8b7c3d706990);

const LOINC: &str = "http://loinc.org";
const ICD10: &str = "http://hl7.org/fhir/sid/icd-10";

/// Un Bundle listo para escribir.
pub struct FhirExport {
    pub kind: &'static str,
    /// Nombre sugerido para "Guardar como", sin extension.
    pub file_stem: String,
    pub bytes: Vec<u8>,
}

/// Un medicamento de la receta: la linea que lo nombra y sus indicaciones.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct MedicationGroup {
    /// `None` si la receta no nombra ningun medicamento de la referencia: el
    /// texto completo queda como un solo pedido.
    pub medication: Option<String>,
    pub lines: Vec<String>,
}

/// Bundle FHIR de una consulta (`encounter_id`) o del expediente completo.
pub fn export_record(
    conn: &Connection,
    patient_id: &str,
    encounter_id: Option<&str>,
) -> Result<FhirExport, ExportError> {
    let data = export::record_export(conn, patient_id, encounter_id)?;

    let mut prescriptions = HashMap::new();
    for encounter in &data.encounters {
        if let Some(text) = encounter.prescription.as_deref() {
            let groups = group_prescription(text, |line| {
                Ok::<_, ExportError>(!medication::extract_medications(conn, line)?.is_empty())
            })?;
            prescriptions.insert(encounter.id.clone(), groups);
        }
    }

    let mut document_data = HashMap::new();
    for document in &data.documents {
        let bytes: Vec<u8> = conn.query_row(
            "SELECT content FROM documents WHERE id = ?1",
            params![document.id],
            |row| row.get(0),
        )?;
        document_data.insert(document.id.clone(), bytes);
    }

    let full_record = encounter_id.is_none();
    let bundle = build_bundle(&data, &prescriptions, &document_data, full_record, Uuid::new_v4());
    let bytes = serde_json::to_vec_pretty(&bundle)
        .map_err(|e| ExportError::Invalid(format!("no se pudo armar el FHIR: {e}")))?;

    let who = format!("{} {}", data.patient.first_name.trim(), data.patient.last_name.trim());
    let day = data.generated_at.get(..10).unwrap_or_default();
    let (kind, label) = if full_record { ("FHIR_EXPEDIENTE", "Expediente") } else { ("FHIR_CONSULTA", "Consulta") };
    Ok(FhirExport { kind, file_stem: format!("{label} FHIR {} {day}", who.trim()), bytes })
}

/* ---------- Armado del Bundle (puro) ---------- */

pub(crate) fn build_bundle(
    data: &RecordExport,
    prescriptions: &HashMap<String, Vec<MedicationGroup>>,
    document_data: &HashMap<String, Vec<u8>>,
    full_record: bool,
    bundle_id: Uuid,
) -> Value {
    let generated_at = instant(&data.generated_at)
        .unwrap_or_else(|| chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true));
    let patient_id = resource_id("Patient", &data.patient.id);
    let practitioner_id = practitioner_id(&data.doctor);
    let patient_ref = reference(&patient_id);
    let practitioner_ref = reference(&practitioner_id);

    let mut entries = vec![patient(data, &patient_id), practitioner(&data.doctor, &practitioner_id)];

    let allergy_ids: Vec<String> = allergy_terms(data.patient.allergies.as_deref().unwrap_or_default())
        .into_iter()
        .map(|term| {
            let id = resource_id(
                "AllergyIntolerance",
                &format!("{}/{}", data.patient.id, medication::normalize_name(&term)),
            );
            entries.push(
                Obj::resource("AllergyIntolerance", &id)
                    .set(
                        "clinicalStatus",
                        concept(
                            "http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical",
                            "active",
                            "Active",
                        ),
                    )
                    .set("code", json!({ "text": term }))
                    .set("patient", patient_ref.clone())
                    .build(),
            );
            id
        })
        .collect();

    if full_record {
        if let Some(summary) =
            summary_composition(data, &allergy_ids, &patient_ref, &practitioner_ref, &generated_at)
        {
            entries.push(summary);
        }
    }

    let exported_encounters: HashSet<&str> = data.encounters.iter().map(|e| e.id.as_str()).collect();
    for encounter in &data.encounters {
        let groups = prescriptions.get(&encounter.id).map(Vec::as_slice).unwrap_or_default();
        entries.extend(encounter_resources(
            encounter,
            groups,
            &data.doctor,
            &patient_ref,
            &practitioner_ref,
            &generated_at,
        ));
    }

    for document in &data.documents {
        // Una consulta vacia no se exporta; su documento si, sin la liga.
        let encounter = document
            .encounter_id
            .as_deref()
            .filter(|id| exported_encounters.contains(id));
        entries.push(document_reference(
            document,
            document_data.get(&document.id).map(Vec::as_slice),
            encounter,
            &patient_ref,
            &generated_at,
        ));
    }

    let id = bundle_id.to_string();
    json!({
        "resourceType": "Bundle",
        "id": id,
        "meta": { "lastUpdated": generated_at },
        "identifier": { "system": "urn:ietf:rfc:3986", "value": format!("urn:uuid:{id}") },
        "type": "collection",
        "timestamp": generated_at,
        "entry": entries
            .into_iter()
            .map(|resource| {
                let url = format!("urn:uuid:{}", resource["id"].as_str().unwrap_or_default());
                json!({ "fullUrl": url, "resource": resource })
            })
            .collect::<Vec<_>>(),
    })
}

fn patient(data: &RecordExport, id: &str) -> Value {
    let p = &data.patient;
    let family = clean(&p.last_name);
    let given = clean(&p.first_name);
    let full_name = clean(&format!("{} {}", p.first_name.trim(), p.last_name.trim()));
    let name = Obj::default()
        .set("use", "official")
        .opt("text", full_name)
        .opt("family", family)
        .list("given", given.into_iter().map(Value::from).collect())
        .build();

    let gender = match data.sex.as_deref().map(str::trim) {
        Some("F") => Some("female"),
        Some("M") => Some("male"),
        Some("O") => Some("other"),
        _ => None,
    };

    let contact = p.guardian.as_ref().and_then(|guardian| {
        let name = clean(&guardian.name);
        let telecom = telecom(guardian.phone.as_deref(), guardian.email.as_deref());
        // Un contacto sin nombre ni medio de contacto no es valido en FHIR (pat-1).
        if name.is_none() && telecom.is_empty() {
            return None;
        }
        Some(
            Obj::default()
                .list(
                    "relationship",
                    guardian
                        .relationship
                        .as_deref()
                        .and_then(clean)
                        .map(|text| vec![json!({ "text": text })])
                        .unwrap_or_default(),
                )
                .opt("name", name.map(|text| json!({ "text": text })))
                .list("telecom", telecom)
                .build(),
        )
    });

    Obj::resource("Patient", id)
        .set("name", json!([name]))
        .list("telecom", telecom(p.phone.as_deref(), p.email.as_deref()))
        .opt("gender", gender)
        .opt("birthDate", p.birth_date.as_deref().and_then(date))
        .list("contact", contact.into_iter().collect())
        .build()
}

fn telecom(phone: Option<&str>, email: Option<&str>) -> Vec<Value> {
    let mut points = Vec::new();
    if let Some(value) = phone.and_then(clean) {
        points.push(json!({ "system": "phone", "value": value }));
    }
    if let Some(value) = email.and_then(clean) {
        points.push(json!({ "system": "email", "value": value }));
    }
    points
}

fn practitioner_id(doctor: &ExportDoctor) -> String {
    let local = doctor
        .license
        .as_deref()
        .and_then(clean)
        .map(|license| format!("cedula/{license}"))
        .or_else(|| doctor.name.as_deref().and_then(clean))
        .unwrap_or_else(|| "medico-del-equipo".into());
    resource_id("Practitioner", &local)
}

fn practitioner(doctor: &ExportDoctor, id: &str) -> Value {
    let identifier = doctor.license.as_deref().and_then(clean).map(|license| {
        json!([{
            "type": {
                "coding": [{
                    "system": "http://terminology.hl7.org/CodeSystem/v2-0203",
                    "code": "MD",
                    "display": "Medical License number"
                }],
                "text": "Cédula profesional"
            },
            "value": license
        }])
    });
    Obj::resource("Practitioner", id)
        .opt("identifier", identifier)
        .opt("name", doctor.name.as_deref().and_then(clean).map(|text| json!([{ "text": text }])))
        .build()
}

fn summary_composition(
    data: &RecordExport,
    allergy_ids: &[String],
    patient_ref: &Value,
    practitioner_ref: &Value,
    generated_at: &str,
) -> Option<Value> {
    let p = &data.patient;
    let sections: Vec<Value> = [
        (
            "Alergias",
            ("48765-2", "Allergies and adverse reactions Document"),
            p.allergies.as_deref(),
            allergy_ids,
        ),
        (
            "Antecedentes personales",
            ("11348-0", "History of Past illness note"),
            p.medical_background.as_deref(),
            &[][..],
        ),
        (
            "Antecedentes heredofamiliares",
            ("10157-6", "History of family member diseases note"),
            p.family_background.as_deref(),
            &[][..],
        ),
    ]
    .into_iter()
    .filter_map(|(title, code, text, entries)| {
        let text = text.and_then(clean)?;
        Some(section(title, Some(code), &[text], entries))
    })
    .collect();

    if sections.is_empty() {
        return None;
    }
    Some(
        Obj::resource("Composition", &resource_id("Composition", &format!("{}/antecedentes", p.id)))
            .set("status", "final")
            .set("type", concept(LOINC, "60591-5", "Patient summary Document"))
            .set("subject", patient_ref.clone())
            .set("date", generated_at)
            .set("author", json!([practitioner_ref]))
            .set("title", "Antecedentes del paciente")
            .set("section", sections)
            .build(),
    )
}

fn encounter_resources(
    encounter: &ExportEncounter,
    groups: &[MedicationGroup],
    doctor: &ExportDoctor,
    patient_ref: &Value,
    practitioner_ref: &Value,
    generated_at: &str,
) -> Vec<Value> {
    let encounter_id = resource_id("Encounter", &encounter.id);
    let encounter_ref = reference(&encounter_id);
    let signed = encounter.status == "SIGNED";
    let opened_at = instant(&encounter.opened_at);
    let signed_at = encounter.signed_at.as_deref().and_then(instant);
    let note_date = signed_at
        .clone()
        .or_else(|| encounter.note_saved_at.as_deref().and_then(instant))
        .or_else(|| opened_at.clone())
        .unwrap_or_else(|| generated_at.to_string());

    let mut resources = Vec::new();

    // Diagnosticos.
    let mut diagnoses: Vec<(String, bool)> = Vec::new();
    let mut diagnosis_lines: Vec<String> = Vec::new();
    if let Some(note) = &encounter.note {
        for dx in &note.coded_diagnoses {
            let id = resource_id("Condition", &format!("{}/{}", encounter.id, dx.code));
            resources.push(condition(&id, Some(dx), &dx.name, encounter, &encounter_ref, patient_ref, practitioner_ref));
            diagnoses.push((id, dx.principal));
            diagnosis_lines.push(format!(
                "{} {}{}",
                icd10_code(&dx.code),
                dx.name,
                if dx.principal { " (principal)" } else { "" }
            ));
        }
        if let Some(text) = clean(&note.diagnosis) {
            if note.coded_diagnoses.is_empty() {
                let id = resource_id("Condition", &format!("{}/texto", encounter.id));
                resources.push(condition(&id, None, &text, encounter, &encounter_ref, patient_ref, practitioner_ref));
                diagnoses.push((id, false));
            }
            diagnosis_lines.push(text);
        }
    }

    // Receta.
    let mut medication_ids = Vec::new();
    for (index, group) in groups.iter().enumerate() {
        let id = resource_id("MedicationRequest", &format!("{}/{}", encounter.id, index + 1));
        let full_text = group.lines.join("\n");
        let (medication, dosage) = match &group.medication {
            Some(line) => (line.clone(), Some(json!([{ "text": full_text }]))),
            None => (full_text, None),
        };
        resources.push(
            Obj::resource("MedicationRequest", &id)
                // MiDoc no sabe si el paciente surtio o termino el tratamiento.
                .set("status", if signed { "unknown" } else { "draft" })
                .set("intent", "order")
                .set("medicationCodeableConcept", json!({ "text": medication }))
                .set("subject", patient_ref.clone())
                .set("encounter", encounter_ref.clone())
                .set("authoredOn", note_date.clone())
                .set("requester", practitioner_ref.clone())
                .opt("dosageInstruction", dosage)
                .build(),
        );
        medication_ids.push(id);
    }

    let period = opened_at.map(|start| json!({ "start": start }));
    resources.insert(
        0,
        Obj::resource("Encounter", &encounter_id)
            .set(
                "status",
                match encounter.status.as_str() {
                    "SIGNED" => "finished",
                    "OPEN" => "in-progress",
                    _ => "unknown",
                },
            )
            .set(
                "class",
                json!({
                    "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
                    "code": "AMB",
                    "display": "ambulatory"
                }),
            )
            .set("subject", patient_ref.clone())
            .set("participant", json!([{ "individual": practitioner_ref }]))
            .opt("period", period)
            .list(
                "diagnosis",
                diagnoses
                    .iter()
                    .map(|(id, principal)| {
                        let mut item = json!({ "condition": reference(id) });
                        if *principal {
                            item["rank"] = json!(1);
                        }
                        item
                    })
                    .collect(),
            )
            .build(),
    );

    if encounter.note.is_none() && groups.is_empty() {
        return resources;
    }

    // La nota de la consulta.
    let text_section = |title: &str, code: (&str, &str), text: &str| {
        clean(text).map(|text| section(title, Some(code), &[text], &[]))
    };
    let mut sections = Vec::new();
    if let Some(note) = &encounter.note {
        sections.extend(text_section("Subjetivo", ("61150-9", "Subjective Narrative"), &note.subjective));
        sections.extend(text_section("Objetivo", ("61149-1", "Objective Narrative"), &note.objective));
        sections.extend(text_section("Análisis", ("51848-0", "Evaluation note"), &note.assessment));
        if !diagnosis_lines.is_empty() {
            let ids: Vec<String> = diagnoses.iter().map(|(id, _)| id.clone()).collect();
            let title = if note.coded_diagnoses.is_empty() { "Diagnóstico" } else { "Diagnóstico (CIE-10)" };
            sections.push(section(title, Some(("29548-5", "Diagnosis Narrative")), &diagnosis_lines, &ids));
        }
        sections.extend(text_section("Plan", ("18776-5", "Plan of care note"), &note.plan));
        sections.extend(text_section("Indicaciones", ("69730-0", "Instructions"), &note.instructions));
    }
    if let Some(text) = encounter.prescription.as_deref().and_then(clean) {
        sections.push(section("Receta", Some(("57828-6", "Prescription list")), &[text], &medication_ids));
    }

    let version = encounter.note_version.map(|v| format!(" (versión {v})")).unwrap_or_default();
    let mut status_lines = vec![if signed {
        format!(
            "Nota firmada el {}{version}. Huella SHA-256: {}.",
            signed_at.as_deref().unwrap_or("fecha desconocida"),
            encounter.signed_hash.as_deref().unwrap_or("sin huella")
        )
    } else {
        format!("Consulta abierta: la nota no está firmada y puede cambiar{version}.")
    }];
    match (doctor.name.as_deref().and_then(clean), doctor.license.as_deref().and_then(clean)) {
        (Some(name), Some(license)) => status_lines.push(format!("Médico: {name}, cédula profesional {license}.")),
        (Some(name), None) => status_lines.push(format!("Médico: {name}.")),
        (None, Some(license)) => status_lines.push(format!("Cédula profesional {license}.")),
        (None, None) => {}
    }

    let attester = signed_at.as_ref().map(|time| {
        json!([{ "mode": "legal", "time": time, "party": practitioner_ref }])
    });
    resources.push(
        Obj::resource("Composition", &resource_id("Composition", &encounter.id))
            .set("text", narrative(&status_lines))
            .set("status", if signed { "final" } else { "preliminary" })
            .set("type", concept(LOINC, "11506-3", "Progress note"))
            .set("subject", patient_ref.clone())
            .set("encounter", encounter_ref)
            .set("date", note_date)
            .set("author", json!([practitioner_ref]))
            .set("title", "Nota de consulta")
            .opt("attester", attester)
            .list("section", sections)
            .build(),
    );
    resources
}

fn condition(
    id: &str,
    coded: Option<&CodedDiagnosis>,
    text: &str,
    encounter: &ExportEncounter,
    encounter_ref: &Value,
    patient_ref: &Value,
    practitioner_ref: &Value,
) -> Value {
    let mut code = Obj::default();
    if let Some(dx) = coded {
        // El nombre oficial va en `text`: la CIE-10 de la Secretaria de Salud
        // es la traduccion al espanol y el `display` del sistema es el de la OMS.
        code = code.set("coding", json!([{ "system": ICD10, "code": icd10_code(&dx.code) }]));
    }
    Obj::resource("Condition", id)
        .set(
            "category",
            json!([concept(
                "http://terminology.hl7.org/CodeSystem/condition-category",
                "encounter-diagnosis",
                "Encounter Diagnosis"
            )]),
        )
        .set("code", code.opt("text", clean(text)).build())
        .set("subject", patient_ref.clone())
        .set("encounter", encounter_ref.clone())
        .opt("recordedDate", instant(&encounter.opened_at))
        .set("recorder", practitioner_ref.clone())
        .build()
}

fn document_reference(
    document: &ExportDocument,
    data: Option<&[u8]>,
    encounter_id: Option<&str>,
    patient_ref: &Value,
    generated_at: &str,
) -> Value {
    let attachment = Obj::default()
        .opt("contentType", clean(&document.mime_type))
        .opt("data", data.map(|bytes| STANDARD.encode(bytes)))
        .opt("title", clean(&document.file_name))
        .opt("size", u32::try_from(document.size_bytes).ok())
        .build();
    Obj::resource("DocumentReference", &resource_id("DocumentReference", &document.id))
        .set("status", "current")
        .list(
            "category",
            document
                .category
                .as_deref()
                .and_then(category_label)
                .map(|label| vec![json!({ "text": label })])
                .unwrap_or_default(),
        )
        .set("subject", patient_ref.clone())
        .set("date", instant(&document.received_at).unwrap_or_else(|| generated_at.to_string()))
        .opt("description", document.title.as_deref().and_then(clean))
        .set("content", json!([{ "attachment": attachment }]))
        .opt(
            "context",
            encounter_id.map(|id| json!({ "encounter": [reference(&resource_id("Encounter", id))] })),
        )
        .build()
}

fn category_label(category: &str) -> Option<&'static str> {
    match category {
        "LABORATORIO" => Some("Laboratorio"),
        "IMAGEN" => Some("Imagen"),
        "REFERENCIA" => Some("Referencia"),
        "CONSENTIMIENTO" => Some("Consentimiento"),
        "OTRO" => Some("Otro"),
        _ => None,
    }
}

fn section(title: &str, code: Option<(&str, &str)>, lines: &[String], entries: &[String]) -> Value {
    Obj::default()
        .set("title", title)
        .opt("code", code.map(|(code, display)| concept(LOINC, code, display)))
        .set("text", narrative(lines))
        .list("entry", entries.iter().map(|id| reference(id)).collect())
        .build()
}

/* ---------- Ayudantes puros ---------- */

/// Objeto JSON que omite lo vacio: FHIR no admite `null`, cadenas ni listas vacias.
#[derive(Default)]
struct Obj(Map<String, Value>);

impl Obj {
    fn resource(resource_type: &str, id: &str) -> Self {
        Self::default().set("resourceType", resource_type).set("id", id)
    }

    fn set(mut self, key: &str, value: impl Into<Value>) -> Self {
        self.0.insert(key.to_string(), value.into());
        self
    }

    fn opt(self, key: &str, value: Option<impl Into<Value>>) -> Self {
        match value {
            Some(value) => self.set(key, value),
            None => self,
        }
    }

    fn list(self, key: &str, values: Vec<Value>) -> Self {
        if values.is_empty() {
            self
        } else {
            self.set(key, values)
        }
    }

    fn build(self) -> Value {
        Value::Object(self.0)
    }
}

pub(crate) fn resource_id(resource_type: &str, local_id: &str) -> String {
    Uuid::new_v5(&NAMESPACE, format!("{resource_type}/{local_id}").as_bytes()).to_string()
}

fn reference(id: &str) -> Value {
    json!({ "reference": format!("urn:uuid:{id}") })
}

fn concept(system: &str, code: &str, display: &str) -> Value {
    json!({ "coding": [{ "system": system, "code": code, "display": display }] })
}

/// Texto apto para un `string` de FHIR: sin caracteres de control, con los
/// espacios raros (no separables, los que pega Word) como espacio normal y
/// recortado. `None` si queda vacio: FHIR no admite cadenas vacias.
pub(crate) fn clean(raw: &str) -> Option<String> {
    let text: String = raw
        .replace("\r\n", "\n")
        .chars()
        .filter_map(|c| match c {
            ' ' | '\n' | '\t' => Some(c),
            '\r' => Some('\n'),
            '\u{feff}' => None,
            c if c.is_whitespace() => Some(' '),
            c if c.is_control() => None,
            c => Some(c),
        })
        .collect();
    let trimmed = text.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

/// Instante FHIR (con zona horaria, al segundo) a partir de RFC 3339.
pub(crate) fn instant(raw: &str) -> Option<String> {
    chrono::DateTime::parse_from_rfc3339(raw.trim())
        .ok()
        .map(|dt| dt.with_timezone(&chrono::Utc).to_rfc3339_opts(chrono::SecondsFormat::Secs, true))
}

/// Fecha FHIR (AAAA-MM-DD) si la de nacimiento es valida.
fn date(raw: &str) -> Option<String> {
    chrono::NaiveDate::parse_from_str(raw.trim(), "%Y-%m-%d")
        .ok()
        .filter(|d| d.year() >= 1)
        .map(|d| d.format("%Y-%m-%d").to_string())
}

/// Clave CIE-10 con punto, como la escribe el sistema ICD-10 (J459 -> J45.9).
pub(crate) fn icd10_code(code: &str) -> String {
    let code = code.trim().to_uppercase();
    if code.len() > 3 && code.is_ascii() {
        format!("{}.{}", &code[..3], &code[3..])
    } else {
        code
    }
}

/// Narrativa XHTML de FHIR: un parrafo por elemento, saltos de linea como `<br/>`.
pub(crate) fn narrative(paragraphs: &[String]) -> Value {
    let body: String = paragraphs
        .iter()
        .map(|p| format!("<p>{}</p>", escape_xml(p).replace('\n', "<br/>")))
        .collect();
    json!({
        "status": "generated",
        "div": format!("<div xmlns=\"http://www.w3.org/1999/xhtml\">{body}</div>"),
    })
}

fn escape_xml(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    for c in text.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            c => out.push(c),
        }
    }
    out
}

/// Terminos de alergia del texto libre, sin repetir y sin las negaciones
/// ("niega", "ninguna", "sin alergias"): esas dicen que no hay alergia, no son una.
pub(crate) fn allergy_terms(raw: &str) -> Vec<String> {
    const NEGATIONS: &[&str] =
        &["niega", "negad", "negativ", "ningun", "no ", "sin ", "nkda", "desconoce", "se ignora"];
    let mut seen = HashSet::new();
    raw.split([',', ';', '\n'])
        .filter_map(clean)
        .filter(|term| {
            let folded = medication::normalize_name(term);
            let negation = matches!(folded.as_str(), "no" | "na" | "n/a" | "nada" | "-")
                || NEGATIONS.iter().any(|prefix| folded.starts_with(prefix));
            !negation && seen.insert(folded)
        })
        .collect()
}

/// Agrupa la receta por medicamento. La linea que nombra un medicamento abre un
/// grupo; las siguientes son sus indicaciones. Lo que va antes del primer
/// medicamento (un "Rx:") se queda con el primero. Si no se reconoce ninguno,
/// toda la receta es un solo grupo sin medicamento identificado.
pub(crate) fn group_prescription<E>(
    text: &str,
    mut names_medication: impl FnMut(&str) -> Result<bool, E>,
) -> Result<Vec<MedicationGroup>, E> {
    let mut groups: Vec<MedicationGroup> = Vec::new();
    let mut leading: Vec<String> = Vec::new();
    for line in text.lines().filter_map(clean) {
        if names_medication(&line)? {
            let mut lines = std::mem::take(&mut leading);
            lines.push(line.clone());
            groups.push(MedicationGroup { medication: Some(line), lines });
        } else if let Some(current) = groups.last_mut() {
            current.lines.push(line);
        } else {
            leading.push(line);
        }
    }
    if groups.is_empty() && !leading.is_empty() {
        groups.push(MedicationGroup { medication: None, lines: leading });
    }
    Ok(groups)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clinical::{self, NoteContent};
    use crate::db::open_encrypted;
    use std::sync::OnceLock;

    fn test_conn(name: &str) -> Connection {
        let dir = std::env::temp_dir().join("midoc-fhir-tests");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(format!("{name}-{}.db", uuid::Uuid::new_v4()));
        open_encrypted(&path, "frase-de-prueba-123").unwrap()
    }

    /// Esquema JSON oficial de FHIR R4 (`test_data/fhir/`, CC0).
    fn r4_schema() -> &'static jsonschema::Validator {
        static VALIDATOR: OnceLock<jsonschema::Validator> = OnceLock::new();
        VALIDATOR.get_or_init(|| {
            let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("test_data/fhir/fhir-r4.schema.json.gz");
            let file = std::fs::File::open(path).expect("esquema FHIR R4 en test_data/fhir");
            let schema: Value = serde_json::from_reader(flate2::read::GzDecoder::new(file)).unwrap();
            jsonschema::draft6::new(&schema).expect("el esquema R4 compila")
        })
    }

    fn schema_errors(instance: &Value) -> Vec<String> {
        r4_schema()
            .iter_errors(instance)
            .map(|error| format!("{} en {}", error, error.instance_path()))
            .collect()
    }

    const PDF: &[u8] = b"%PDF-1.4\n%estudio de laboratorio";
    const PNG: &[u8] = &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0];

    struct Seeded {
        signed: String,
        open: String,
    }

    fn seed(conn: &Connection) -> Seeded {
        medication::install_bundled_reference(conn).unwrap();
        conn.execute(
            "INSERT INTO patients (id, first_name, last_name, phone, email, sex, birth_date, allergies,
                                   medical_background, family_background, guardian_name,
                                   guardian_relationship, guardian_phone, created_at, updated_at)
             VALUES ('p1', 'Ana', 'Ruiz López', '5512345678', 'ana@example.com', 'F', '2014-05-01',
                     'Penicilina, niega otras;  sulfas ', 'Asma desde la infancia',
                     'Madre con diabetes tipo 2', 'Rosa López', 'Madre', '5587654321',
                     '2026-01-01', '2026-01-01')",
            [],
        )
        .unwrap();
        crate::sync::set_state(conn, "doctor_name", "Dra. Eva Soto").unwrap();
        crate::sync::set_state(conn, "doctor_license", "1234567").unwrap();

        let signed = clinical::open_encounter_for_patient(conn, "p1").unwrap();
        clinical::save_note(
            conn,
            &signed.id,
            &NoteContent {
                subjective: "Tos nocturna <3 días> & sibilancias".into(),
                objective: "Sibilancias espiratorias\u{a0}bilaterales".into(),
                assessment: "Crisis asmática leve".into(),
                plan: "Broncodilatador y control en 1 semana".into(),
                diagnosis: "Asma en crisis".into(),
                instructions: "Acudir a urgencias si hay dificultad para respirar".into(),
                coded_diagnoses: vec![
                    CodedDiagnosis { code: "J459".into(), name: String::new(), principal: true },
                    CodedDiagnosis { code: "J00".into(), name: String::new(), principal: false },
                ],
                ..Default::default()
            },
        )
        .unwrap();
        clinical::save_prescription(
            conn,
            &signed.id,
            "Rx:\nParacetamol 500 mg tabletas\n1 cada 8 horas por 3 dias\n\nIbuprofeno 400 mg cada 12 horas si hay dolor",
        )
        .unwrap();
        clinical::sign_encounter(conn, &signed.id).unwrap();

        // Consulta abierta y vacia: no sale en el expediente completo.
        clinical::open_encounter_for_patient(conn, "p1").unwrap();

        let open = clinical::open_encounter_for_patient(conn, "p1").unwrap();
        clinical::save_note(
            conn,
            &open.id,
            &NoteContent { diagnosis: "Control de asma".into(), plan: "Seguimiento".into(), ..Default::default() },
        )
        .unwrap();

        let doc = |content: &[u8], name: &str, encounter: Option<&str>| crate::documents::NewDocument {
            patient_id: "p1".into(),
            encounter_id: encounter.map(str::to_string),
            file_name: name.into(),
            title: Some(format!("Estudio {name}")),
            category: "LABORATORIO".into(),
            content_base64: STANDARD.encode(content),
        };
        crate::documents::add_document(conn, &doc(PDF, "biometria.pdf", Some(&signed.id))).unwrap();
        crate::documents::add_document(conn, &doc(PNG, "radiografia.png", None)).unwrap();

        Seeded { signed: signed.id, open: open.id }
    }

    fn bundle_of(conn: &Connection, encounter: Option<&str>) -> Value {
        serde_json::from_slice(&export_record(conn, "p1", encounter).unwrap().bytes).unwrap()
    }

    fn resources<'a>(bundle: &'a Value, resource_type: &str) -> Vec<&'a Value> {
        bundle["entry"]
            .as_array()
            .unwrap()
            .iter()
            .map(|entry| &entry["resource"])
            .filter(|resource| resource["resourceType"] == resource_type)
            .collect()
    }

    fn collect_references(value: &Value, out: &mut Vec<String>) {
        match value {
            Value::Object(map) => {
                for (key, child) in map {
                    match (key.as_str(), child) {
                        ("reference", Value::String(target)) => out.push(target.clone()),
                        _ => collect_references(child, out),
                    }
                }
            }
            Value::Array(items) => items.iter().for_each(|item| collect_references(item, out)),
            _ => {}
        }
    }

    #[test]
    fn whole_record_validates_against_the_r4_schema() {
        let conn = test_conn("schema");
        seed(&conn);
        let bundle = bundle_of(&conn, None);
        let errors = schema_errors(&bundle);
        assert!(errors.is_empty(), "el Bundle no cumple el esquema R4:\n{}", errors.join("\n"));
    }

    #[test]
    fn the_schema_check_rejects_an_invalid_resource() {
        // Prueba del validador mismo: si aceptara cualquier cosa, la prueba de
        // arriba no demostraria nada.
        let conn = test_conn("invalid");
        seed(&conn);
        let mut bundle = bundle_of(&conn, None);
        bundle["entry"][0]["resource"]["gender"] = json!("F");
        assert!(!schema_errors(&bundle).is_empty());
    }

    #[test]
    fn single_encounter_validates_and_only_carries_that_encounter() {
        let conn = test_conn("single");
        let seeded = seed(&conn);
        let bundle = bundle_of(&conn, Some(&seeded.signed));
        let errors = schema_errors(&bundle);
        assert!(errors.is_empty(), "{}", errors.join("\n"));

        assert_eq!(resources(&bundle, "Encounter").len(), 1);
        let compositions = resources(&bundle, "Composition");
        assert_eq!(compositions.len(), 1, "sin antecedentes, como el PDF de consulta");
        assert_eq!(compositions[0]["title"], "Nota de consulta");
        let documents = resources(&bundle, "DocumentReference");
        assert_eq!(documents.len(), 1, "solo el documento de esta consulta");
        assert_eq!(documents[0]["content"][0]["attachment"]["title"], "biometria.pdf");
        assert_eq!(resources(&bundle, "AllergyIntolerance").len(), 2, "las alergias siempre viajan");

        let export = export_record(&conn, "p1", Some(&seeded.signed)).unwrap();
        assert_eq!(export.kind, "FHIR_CONSULTA");
        assert!(export.file_stem.starts_with("Consulta FHIR Ana Ruiz López "), "{}", export.file_stem);
    }

    #[test]
    fn maps_the_record_to_r4_resources() {
        let conn = test_conn("map");
        let seeded = seed(&conn);
        let bundle = bundle_of(&conn, None);
        assert_eq!(bundle["type"], "collection");

        let patient = resources(&bundle, "Patient")[0];
        assert_eq!(patient["gender"], "female");
        assert_eq!(patient["birthDate"], "2014-05-01");
        assert_eq!(patient["name"][0]["family"], "Ruiz López");
        assert_eq!(patient["name"][0]["given"][0], "Ana");
        assert_eq!(patient["contact"][0]["name"]["text"], "Rosa López");
        assert_eq!(patient["contact"][0]["relationship"][0]["text"], "Madre");

        let practitioner = resources(&bundle, "Practitioner")[0];
        assert_eq!(practitioner["name"][0]["text"], "Dra. Eva Soto");
        assert_eq!(practitioner["identifier"][0]["value"], "1234567");
        assert_eq!(practitioner["identifier"][0]["type"]["coding"][0]["code"], "MD");

        let allergies: Vec<&str> = resources(&bundle, "AllergyIntolerance")
            .iter()
            .map(|a| a["code"]["text"].as_str().unwrap())
            .collect();
        assert_eq!(allergies, vec!["Penicilina", "sulfas"], "sin la negacion");

        let encounters = resources(&bundle, "Encounter");
        assert_eq!(encounters.len(), 2, "sin la consulta vacia");
        let signed_id = resource_id("Encounter", &seeded.signed);
        let signed = encounters.iter().find(|e| e["id"] == signed_id.as_str()).unwrap();
        assert_eq!(signed["status"], "finished");
        let open_id = resource_id("Encounter", &seeded.open);
        let open = encounters.iter().find(|e| e["id"] == open_id.as_str()).unwrap();
        assert_eq!(open["status"], "in-progress");

        let conditions = resources(&bundle, "Condition");
        let codes: Vec<&str> = conditions
            .iter()
            .filter_map(|c| c["code"]["coding"][0]["code"].as_str())
            .collect();
        assert_eq!(codes, vec!["J45.9", "J00"]);
        assert_eq!(conditions[0]["code"]["coding"][0]["system"], ICD10);
        assert_eq!(conditions[0]["code"]["text"], "ASMA, NO ESPECIFICADO");
        let principal = &signed["diagnosis"][0];
        assert_eq!(principal["rank"], 1);
        assert_eq!(principal["condition"]["reference"], format!("urn:uuid:{}", conditions[0]["id"].as_str().unwrap()));
        let free_text = conditions.iter().find(|c| c["code"].get("coding").is_none()).unwrap();
        assert_eq!(free_text["code"]["text"], "Control de asma", "la consulta sin CIE-10 conserva su diagnostico");

        let requests = resources(&bundle, "MedicationRequest");
        assert_eq!(requests.len(), 2, "un pedido por medicamento");
        assert_eq!(requests[0]["medicationCodeableConcept"]["text"], "Paracetamol 500 mg tabletas");
        assert_eq!(
            requests[0]["dosageInstruction"][0]["text"],
            "Rx:\nParacetamol 500 mg tabletas\n1 cada 8 horas por 3 dias"
        );
        assert_eq!(requests[1]["medicationCodeableConcept"]["text"], "Ibuprofeno 400 mg cada 12 horas si hay dolor");
        assert_eq!(requests[0]["status"], "unknown");

        let compositions = resources(&bundle, "Composition");
        let summary = compositions.iter().find(|c| c["title"] == "Antecedentes del paciente").unwrap();
        assert_eq!(summary["section"].as_array().unwrap().len(), 3);
        let note = compositions
            .iter()
            .find(|c| c["encounter"]["reference"] == format!("urn:uuid:{signed_id}"))
            .unwrap();
        assert_eq!(note["status"], "final");
        assert_eq!(note["attester"][0]["mode"], "legal");
        let hash = clinical::get_encounter_detail(&conn, &seeded.signed).unwrap().encounter.signed_hash.unwrap();
        assert!(note["text"]["div"].as_str().unwrap().contains(&hash), "la huella de la firma viaja en la nota");
        let subjective = note["section"][0]["text"]["div"].as_str().unwrap();
        assert!(subjective.contains("Tos nocturna &lt;3 días&gt; &amp; sibilancias"), "{subjective}");
        let objective = note["section"][1]["text"]["div"].as_str().unwrap();
        assert!(objective.contains("espiratorias bilaterales"), "sin espacio no separable: {objective}");
        let titles: Vec<&str> = note["section"].as_array().unwrap().iter().map(|s| s["title"].as_str().unwrap()).collect();
        assert_eq!(titles, vec!["Subjetivo", "Objetivo", "Análisis", "Diagnóstico (CIE-10)", "Plan", "Indicaciones", "Receta"]);
        let open_note = compositions
            .iter()
            .find(|c| c["encounter"]["reference"] == format!("urn:uuid:{open_id}"))
            .unwrap();
        assert_eq!(open_note["status"], "preliminary");
        assert!(open_note.get("attester").is_none());

        let documents = resources(&bundle, "DocumentReference");
        assert_eq!(documents.len(), 2);
        let pdf = &documents[0]["content"][0]["attachment"];
        assert_eq!(pdf["contentType"], "application/pdf");
        assert_eq!(pdf["data"], STANDARD.encode(PDF));
        assert_eq!(pdf["size"], PDF.len());
        assert_eq!(documents[0]["context"]["encounter"][0]["reference"], format!("urn:uuid:{signed_id}"));
        assert_eq!(documents[0]["category"][0]["text"], "Laboratorio");
        assert!(documents[1].get("context").is_none(), "la radiografia no es de ninguna consulta");

        // Toda referencia apunta a un recurso del mismo Bundle.
        let full_urls: HashSet<&str> = bundle["entry"]
            .as_array()
            .unwrap()
            .iter()
            .map(|entry| entry["fullUrl"].as_str().unwrap())
            .collect();
        assert_eq!(full_urls.len(), bundle["entry"].as_array().unwrap().len(), "fullUrl repetido");
        let mut references = Vec::new();
        collect_references(&bundle, &mut references);
        for target in references {
            assert!(full_urls.contains(target.as_str()), "referencia rota: {target}");
        }

        let export = export_record(&conn, "p1", None).unwrap();
        assert_eq!(export.kind, "FHIR_EXPEDIENTE");
    }

    #[test]
    fn resource_ids_are_stable_between_exports() {
        let conn = test_conn("stable");
        seed(&conn);
        let ids = |bundle: &Value| -> Vec<String> {
            bundle["entry"].as_array().unwrap().iter().map(|e| e["fullUrl"].as_str().unwrap().to_string()).collect()
        };
        let first = bundle_of(&conn, None);
        let second = bundle_of(&conn, None);
        assert_eq!(ids(&first), ids(&second));
        assert_ne!(first["id"], second["id"], "cada exportacion es un Bundle distinto");
    }

    #[test]
    fn exports_a_minimal_patient_without_doctor_data() {
        let conn = test_conn("minimal");
        conn.execute(
            "INSERT INTO patients (id, first_name, last_name, birth_date, created_at, updated_at)
             VALUES ('p1', 'Solo', '', '05/01/1990', '2026-01-01', '2026-01-01')",
            [],
        )
        .unwrap();
        let bundle = bundle_of(&conn, None);
        let errors = schema_errors(&bundle);
        assert!(errors.is_empty(), "{}", errors.join("\n"));
        let patient = resources(&bundle, "Patient")[0];
        assert!(patient.get("birthDate").is_none(), "fecha que no es AAAA-MM-DD");
        assert!(patient["name"][0].get("family").is_none());
        assert_eq!(resources(&bundle, "Practitioner").len(), 1);
    }

    #[test]
    fn groups_prescription_lines_by_medication() {
        let known = |line: &str| Ok::<_, ()>(line.starts_with("Med"));
        let groups = group_prescription("Rx\nMed A 1 g\ncada 8 h\n\nMed B\n  por 5 dias  ", known).unwrap();
        assert_eq!(
            groups,
            vec![
                MedicationGroup { medication: Some("Med A 1 g".into()), lines: vec!["Rx".into(), "Med A 1 g".into(), "cada 8 h".into()] },
                MedicationGroup { medication: Some("Med B".into()), lines: vec!["Med B".into(), "por 5 dias".into()] },
            ]
        );

        let unknown = group_prescription("Formula magistral\nAplicar dos veces al dia", |_| Ok::<_, ()>(false)).unwrap();
        assert_eq!(unknown.len(), 1);
        assert_eq!(unknown[0].medication, None);
        assert_eq!(unknown[0].lines.len(), 2);

        assert!(group_prescription(" \n ", known).unwrap().is_empty());
    }

    #[test]
    fn allergy_terms_skip_negations_and_repeats() {
        assert_eq!(allergy_terms("Penicilina, PENICILINA; Ácaros\nNiega otras"), vec!["Penicilina", "Ácaros"]);
        assert!(allergy_terms("Ninguna conocida").is_empty());
        assert!(allergy_terms("Negadas").is_empty());
        assert!(allergy_terms("No conocidas").is_empty());
        assert!(allergy_terms("Sin alergias").is_empty());
        assert!(allergy_terms("N/A").is_empty());
        assert_eq!(allergy_terms("Nopal"), vec!["Nopal"]);
    }

    #[test]
    fn helpers_produce_valid_fhir_primitives() {
        assert_eq!(icd10_code("j459"), "J45.9");
        assert_eq!(icd10_code("A33"), "A33");
        assert_eq!(instant("2026-10-06T01:13:58.644123456+00:00").as_deref(), Some("2026-10-06T01:13:58Z"));
        assert_eq!(instant("2026-10-06T08:00:00-06:00").as_deref(), Some("2026-10-06T14:00:00Z"));
        assert_eq!(instant("ayer"), None);
        assert_eq!(date("1990-05-01").as_deref(), Some("1990-05-01"));
        assert_eq!(date("1990-13-01"), None);
        assert_eq!(clean(" \u{feff}a\u{a0}b\u{7}\r\nc ").as_deref(), Some("a b\nc"));
        assert_eq!(clean(" \n\t "), None);
        assert_eq!(
            narrative(&["a<b>\n\"c\" & 'd'".into()])["div"],
            "<div xmlns=\"http://www.w3.org/1999/xhtml\"><p>a&lt;b&gt;<br/>&quot;c&quot; &amp; &#39;d&#39;</p></div>"
        );
    }
}
