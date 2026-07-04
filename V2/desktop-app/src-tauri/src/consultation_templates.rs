use crate::ai::TemplateSegment;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

const TEMPLATE_STORE_KEY: &str = "consultation_templates_v1";

#[derive(Debug, thiserror::Error)]
pub enum TemplateError {
    #[error("error de base de datos: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("error de plantilla: {0}")]
    Json(#[from] serde_json::Error),
    #[error("{0}")]
    Invalid(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredTemplate {
    pub id: String,
    pub name: String,
    pub clinical_profile: String,
    pub segments: Vec<TemplateSegment>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

pub fn list_templates(conn: &Connection) -> Result<Vec<StoredTemplate>, TemplateError> {
    let raw: Option<String> = conn
        .query_row(
            "SELECT value FROM app_meta WHERE key = ?1",
            [TEMPLATE_STORE_KEY],
            |row| row.get(0),
        )
        .optional()?;

    match raw {
        Some(value) => Ok(serde_json::from_str(&value)?),
        None => Ok(Vec::new()),
    }
}

pub fn save_template(
    conn: &Connection,
    mut template: StoredTemplate,
) -> Result<StoredTemplate, TemplateError> {
    validate_template(&template)?;

    let mut templates = list_templates(conn)?;
    let now = chrono::Utc::now().to_rfc3339();
    let created_at = templates
        .iter()
        .find(|current| current.id == template.id)
        .and_then(|current| current.created_at.clone())
        .or_else(|| template.created_at.clone())
        .unwrap_or_else(|| now.clone());

    template.created_at = Some(created_at);
    template.updated_at = Some(now);

    if let Some(current) = templates
        .iter_mut()
        .find(|current| current.id == template.id)
    {
        *current = template.clone();
    } else {
        templates.push(template.clone());
    }

    persist_templates(conn, &templates)?;
    Ok(template)
}

pub fn delete_template(conn: &Connection, id: &str) -> Result<(), TemplateError> {
    let mut templates = list_templates(conn)?;
    templates.retain(|template| template.id != id);
    persist_templates(conn, &templates)
}

fn persist_templates(conn: &Connection, templates: &[StoredTemplate]) -> Result<(), TemplateError> {
    let value = serde_json::to_string(templates)?;
    conn.execute(
        "INSERT INTO app_meta (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![TEMPLATE_STORE_KEY, value],
    )?;
    Ok(())
}

fn validate_template(template: &StoredTemplate) -> Result<(), TemplateError> {
    if !is_safe_id(&template.id) {
        return Err(TemplateError::Invalid("id de plantilla invalido".into()));
    }
    if template.name.trim().is_empty() {
        return Err(TemplateError::Invalid("nombre de plantilla requerido".into()));
    }
    if !matches!(
        template.clinical_profile.as_str(),
        "GENERAL_MEDICINE" | "ODONTOLOGY"
    ) {
        return Err(TemplateError::Invalid("perfil clinico no soportado".into()));
    }
    if template.segments.is_empty() {
        return Err(TemplateError::Invalid(
            "la plantilla requiere al menos un segmento".into(),
        ));
    }

    let mut ids = std::collections::HashSet::new();
    for segment in &template.segments {
        if !is_safe_id(&segment.id) || !ids.insert(segment.id.as_str()) {
            return Err(TemplateError::Invalid("id de segmento invalido".into()));
        }
        if segment.label.trim().is_empty() {
            return Err(TemplateError::Invalid("etiqueta de segmento requerida".into()));
        }
        if !is_allowed_target(&template.clinical_profile, &segment.target) {
            return Err(TemplateError::Invalid(
                "target de segmento no permitido".into(),
            ));
        }
    }

    Ok(())
}

fn is_safe_id(value: &str) -> bool {
    let value = value.trim();
    !value.is_empty()
        && value.len() <= 80
        && value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '_' || ch == '-')
}

fn is_allowed_target(profile: &str, target: &str) -> bool {
    const SOAP_TARGETS: &[&str] = &[
        "subjective",
        "objective",
        "assessment",
        "diagnosis",
        "plan",
        "instructions",
    ];
    const GENERAL_TARGETS: &[&str] = &[
        "specialty.riskFactors",
        "specialty.reviewOfSystems",
        "specialty.physicalExam",
        "specialty.labs",
        "specialty.screenings",
        "specialty.preventivePlan",
        "specialty.followUp",
    ];
    const DENTAL_TARGETS: &[&str] = &["specialty.hygienePlan", "specialty.nextRevision"];

    SOAP_TARGETS.contains(&target)
        || match profile {
            "GENERAL_MEDICINE" => GENERAL_TARGETS.contains(&target),
            "ODONTOLOGY" => DENTAL_TARGETS.contains(&target),
            _ => false,
        }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute(
            "CREATE TABLE app_meta (
                key TEXT PRIMARY KEY NOT NULL,
                value TEXT NOT NULL
            )",
            [],
        )
        .unwrap();
        conn
    }

    fn template(id: &str) -> StoredTemplate {
        StoredTemplate {
            id: id.into(),
            name: "Control cronico".into(),
            clinical_profile: "GENERAL_MEDICINE".into(),
            segments: vec![TemplateSegment {
                id: "follow_up".into(),
                label: "Seguimiento".into(),
                target: "specialty.followUp".into(),
                instructions: "Extrae el siguiente control.".into(),
                required: false,
            }],
            created_at: None,
            updated_at: None,
        }
    }

    #[test]
    fn stores_templates_in_app_meta_without_new_migration() {
        let conn = conn();
        let saved = save_template(&conn, template("custom-general-control")).unwrap();

        assert_eq!(saved.id, "custom-general-control");
        assert!(saved.created_at.is_some());
        assert!(saved.updated_at.is_some());

        let listed = list_templates(&conn).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].segments[0].target, "specialty.followUp");
    }

    #[test]
    fn rejects_non_textual_or_structural_targets() {
        let conn = conn();
        let mut unsafe_template = template("custom-odontogram");
        unsafe_template.segments[0].target = "specialty.odontogram".into();

        let err = save_template(&conn, unsafe_template).unwrap_err();
        assert!(err.to_string().contains("target de segmento no permitido"));
    }

    #[test]
    fn deletes_only_the_requested_template() {
        let conn = conn();
        save_template(&conn, template("one")).unwrap();
        save_template(&conn, template("two")).unwrap();

        delete_template(&conn, "one").unwrap();

        let listed = list_templates(&conn).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, "two");
    }
}
