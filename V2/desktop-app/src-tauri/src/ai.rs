//! IA clinica gobernada (paso 11) — fundacion + SOAP asistido.
//!
//! Invariantes (REGLAS_DESARROLLO.md §3-4 y 11_recomendaciones_ia_medica.md):
//! - La IA nunca reemplaza el criterio medico: toda salida es BORRADOR hasta
//!   que el medico la revisa y aprueba. Nada se guarda como nota clinica de
//!   forma automatica.
//! - El contenido clinico se procesa localmente. Lo que se envia a un proveedor
//!   va seudonimizado (sin nombre del paciente) y requiere consentimiento.
//! - Cada ejecucion deja traza completa: proveedor, modelo, version de prompt,
//!   costo, latencia, consentimiento, estado de revision y feedback.
//! - Capa multi-proveedor con fallback. El proveedor real se cablea en staging
//!   contra BAA; aqui la fundacion usa un proveedor fake determinista.

use crate::clinical::{self, NoteContent};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AiError {
    #[error("error de base de datos: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("{0}")]
    Invalid(String),
    #[error("no encontrado")]
    NotFound,
    #[error("falta el consentimiento del paciente para asistencia de IA")]
    ConsentMissing,
    #[error("ningun proveedor de IA pudo completar la solicitud")]
    AllProvidersFailed,
}

/// Alcance de consentimiento de IA. En esta rebanada solo SOAP asistido.
pub const SCOPE_SOAP_ASSIST: &str = "SOAP_ASSIST";
const PROMPT_VERSION_SOAP: &str = "soap-assist/v1";

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

/* ---------- Capa multi-proveedor ---------- */

pub struct AiRequest {
    pub usage_type: String,
    pub prompt_version: String,
    /// Contexto clinico ya seudonimizado (sin identificadores directos).
    pub redacted_input: String,
}

pub struct AiResponse {
    pub output: String,
    pub model_version: String,
    pub estimated_cost_cents: i64,
    pub latency_ms: i64,
}

/// Adaptador de proveedor de IA. Implementaciones reales (OpenAI, MedLM, …) se
/// agregan en rebanadas posteriores; todas cumplen este contrato.
pub trait AiProvider: Send + Sync {
    fn name(&self) -> &str;
    fn generate(&self, request: &AiRequest) -> Result<AiResponse, AiError>;
}

/// Orquestador: intenta los proveedores en orden y devuelve la primera
/// respuesta exitosa (fallback). El nombre del proveedor ganador se registra
/// en la traza.
pub struct ProviderRegistry {
    providers: Vec<Box<dyn AiProvider>>,
}

impl ProviderRegistry {
    pub fn new(providers: Vec<Box<dyn AiProvider>>) -> Self {
        Self { providers }
    }

    /// Registro por defecto de la fundacion: proveedor fake determinista. El
    /// proveedor real entra en staging (requiere BAA); no se cablea aqui para
    /// no enviar PHI sin acuerdo contractual.
    pub fn default_local() -> Self {
        Self::new(vec![Box::new(FakeProvider::new("fake-clinico"))])
    }

    fn generate(&self, request: &AiRequest) -> Result<(String, AiResponse), AiError> {
        for provider in &self.providers {
            if let Ok(response) = provider.generate(request) {
                return Ok((provider.name().to_string(), response));
            }
        }
        Err(AiError::AllProvidersFailed)
    }
}

/// Proveedor fake determinista para fundacion, desarrollo y pruebas. Genera un
/// borrador SOAP estructurado a partir del contexto seudonimizado. No hace red.
pub struct FakeProvider {
    name: String,
}

impl FakeProvider {
    pub fn new(name: &str) -> Self {
        Self { name: name.to_string() }
    }
}

impl AiProvider for FakeProvider {
    fn name(&self) -> &str {
        &self.name
    }

    fn generate(&self, request: &AiRequest) -> Result<AiResponse, AiError> {
        let start = std::time::Instant::now();
        if request.usage_type != SCOPE_SOAP_ASSIST {
            return Err(AiError::Invalid("tipo de uso no soportado por el proveedor".into()));
        }

        // Borrador SOAP: estructura determinista a partir del contexto. No
        // inventa diagnosticos; deja secciones para que el medico complete.
        let context = request.redacted_input.trim();
        let draft = NoteContent {
            subjective: format!(
                "Borrador IA a partir del contexto disponible:\n{context}"
            ),
            objective: "Exploracion fisica: (a completar por el medico).".into(),
            assessment: "Impresion diagnostica: (a confirmar por el medico).".into(),
            plan: "Plan sugerido: (revisar y ajustar).".into(),
            diagnosis: String::new(),
            instructions: "Indicaciones al paciente: (a definir por el medico).".into(),
            specialty: serde_json::Value::Null,
        };
        let output = serde_json::to_string(&draft)
            .map_err(|e| AiError::Invalid(format!("no se pudo serializar el borrador: {e}")))?;

        // Costo estimado proporcional al tamano del contexto (modelo de la
        // fundacion; el proveedor real reporta el costo verdadero).
        let estimated_cost_cents = 1 + (context.len() as i64) / 500;

        Ok(AiResponse {
            output,
            model_version: "fake-1".into(),
            estimated_cost_cents,
            latency_ms: start.elapsed().as_millis() as i64,
        })
    }
}

/// Seudonimiza el contexto antes de enviarlo a un proveedor: reemplaza el
/// nombre del paciente por un marcador. Minimo viable; se endurece cuando se
/// cablee un proveedor real.
pub fn redact(context: &str, first_name: &str, last_name: &str) -> String {
    let mut out = context.to_string();
    for token in [first_name, last_name] {
        let token = token.trim();
        if token.len() >= 3 {
            out = out.replace(token, "[PACIENTE]");
        }
    }
    out
}

/* ---------- Consentimiento ---------- */

pub fn grant_consent(
    conn: &Connection,
    patient_id: &str,
    scope: &str,
) -> Result<String, AiError> {
    let exists: bool = conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM patients WHERE id = ?1)",
        params![patient_id],
        |row| row.get(0),
    )?;
    if !exists {
        return Err(AiError::NotFound);
    }
    // Revoca consentimientos previos vigentes del mismo alcance y crea uno nuevo.
    conn.execute(
        "UPDATE ai_consents SET revoked_at = ?3
         WHERE patient_id = ?1 AND scope = ?2 AND revoked_at IS NULL",
        params![patient_id, scope, now()],
    )?;
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO ai_consents (id, patient_id, scope, granted_at) VALUES (?1, ?2, ?3, ?4)",
        params![id, patient_id, scope, now()],
    )?;
    audit(conn, "ai_consent", &id, "granted", Some(scope))?;
    Ok(id)
}

pub fn revoke_consent(conn: &Connection, patient_id: &str, scope: &str) -> Result<(), AiError> {
    conn.execute(
        "UPDATE ai_consents SET revoked_at = ?3
         WHERE patient_id = ?1 AND scope = ?2 AND revoked_at IS NULL",
        params![patient_id, scope, now()],
    )?;
    audit(conn, "ai_consent", patient_id, "revoked", Some(scope))?;
    Ok(())
}

/// Devuelve el id del consentimiento vigente, si lo hay.
pub fn active_consent(
    conn: &Connection,
    patient_id: &str,
    scope: &str,
) -> Result<Option<String>, AiError> {
    conn.query_row(
        "SELECT id FROM ai_consents
         WHERE patient_id = ?1 AND scope = ?2 AND revoked_at IS NULL
         ORDER BY granted_at DESC LIMIT 1",
        params![patient_id, scope],
        |row| row.get::<_, String>(0),
    )
    .optional()
    .map_err(AiError::from)
}

/* ---------- Trazas ---------- */

#[derive(Debug, Serialize)]
pub struct AiRun {
    pub id: String,
    pub encounter_id: Option<String>,
    pub patient_id: Option<String>,
    pub usage_type: String,
    pub provider: String,
    pub model_version: Option<String>,
    pub prompt_version: String,
    pub status: String,
    pub estimated_cost_cents: Option<i64>,
    pub latency_ms: Option<i64>,
    pub feedback: Option<String>,
    pub reviewed_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize)]
pub struct SoapDraft {
    pub run_id: String,
    pub provider: String,
    pub model_version: String,
    pub estimated_cost_cents: i64,
    pub latency_ms: i64,
    /// Borrador estructurado para precargar el editor SOAP. El medico lo revisa
    /// y edita antes de guardar; nunca se guarda como nota de forma automatica.
    pub draft: NoteContent,
}

fn audit(
    conn: &Connection,
    entity: &str,
    entity_id: &str,
    action: &str,
    details: Option<&str>,
) -> Result<(), AiError> {
    conn.execute(
        "INSERT INTO clinical_audit (entity, entity_id, action, at, details)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![entity, entity_id, action, now(), details],
    )?;
    Ok(())
}

fn read_run(conn: &Connection, run_id: &str) -> Result<AiRun, AiError> {
    conn.query_row(
        "SELECT id, encounter_id, patient_id, usage_type, provider, model_version,
                prompt_version, status, estimated_cost_cents, latency_ms, feedback,
                reviewed_at, created_at
         FROM ai_runs WHERE id = ?1",
        params![run_id],
        |row| {
            Ok(AiRun {
                id: row.get(0)?,
                encounter_id: row.get(1)?,
                patient_id: row.get(2)?,
                usage_type: row.get(3)?,
                provider: row.get(4)?,
                model_version: row.get(5)?,
                prompt_version: row.get(6)?,
                status: row.get(7)?,
                estimated_cost_cents: row.get(8)?,
                latency_ms: row.get(9)?,
                feedback: row.get(10)?,
                reviewed_at: row.get(11)?,
                created_at: row.get(12)?,
            })
        },
    )
    .optional()?
    .ok_or(AiError::NotFound)
}

pub fn list_runs(conn: &Connection, encounter_id: &str) -> Result<Vec<AiRun>, AiError> {
    let mut statement = conn.prepare(
        "SELECT id, encounter_id, patient_id, usage_type, provider, model_version,
                prompt_version, status, estimated_cost_cents, latency_ms, feedback,
                reviewed_at, created_at
         FROM ai_runs WHERE encounter_id = ?1 ORDER BY created_at DESC",
    )?;
    let rows = statement
        .query_map(params![encounter_id], |row| {
            Ok(AiRun {
                id: row.get(0)?,
                encounter_id: row.get(1)?,
                patient_id: row.get(2)?,
                usage_type: row.get(3)?,
                provider: row.get(4)?,
                model_version: row.get(5)?,
                prompt_version: row.get(6)?,
                status: row.get(7)?,
                estimated_cost_cents: row.get(8)?,
                latency_ms: row.get(9)?,
                feedback: row.get(10)?,
                reviewed_at: row.get(11)?,
                created_at: row.get(12)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/* ---------- SOAP asistido ---------- */

/// Construye el contexto clinico (seudonimizado) a partir del expediente:
/// motivo de cita, preconsulta, diagnosticos previos y nota actual.
fn build_soap_context(detail: &clinical::EncounterDetail) -> String {
    let mut parts: Vec<String> = Vec::new();
    if let Some(reason) = &detail.appointment_reason {
        parts.push(format!("Motivo de consulta: {reason}"));
    }
    if let Some(precheckin) = &detail.precheckin {
        parts.push(format!("Preconsulta del paciente: {precheckin}"));
    }
    if let Some(allergies) = &detail.patient.allergies {
        parts.push(format!("Alergias: {allergies}"));
    }
    if let Some(background) = &detail.patient.medical_background {
        parts.push(format!("Antecedentes: {background}"));
    }
    let previous: Vec<String> = detail
        .history
        .iter()
        .filter(|h| !h.diagnosis.is_empty())
        .map(|h| h.diagnosis.clone())
        .collect();
    if !previous.is_empty() {
        parts.push(format!("Diagnosticos previos: {}", previous.join("; ")));
    }
    if let Some(note) = &detail.note {
        if !note.content.subjective.is_empty() {
            parts.push(format!("Subjetivo capturado: {}", note.content.subjective));
        }
    }
    parts.join("\n")
}

/// Genera un borrador SOAP asistido por IA. Requiere consentimiento vigente.
/// Registra la traza completa y devuelve el borrador SIN guardarlo como nota.
pub fn assist_soap(
    conn: &Connection,
    encounter_id: &str,
    registry: &ProviderRegistry,
) -> Result<SoapDraft, AiError> {
    let detail = clinical::get_encounter_detail(conn, encounter_id)
        .map_err(|_| AiError::NotFound)?;

    if detail.encounter.status == "SIGNED" {
        return Err(AiError::Invalid("el encuentro ya fue firmado".into()));
    }

    let patient_id = detail.encounter.patient_id.clone();
    let consent_id = active_consent(conn, &patient_id, SCOPE_SOAP_ASSIST)?
        .ok_or(AiError::ConsentMissing)?;

    let context = build_soap_context(&detail);
    let redacted = redact(&context, &detail.patient.first_name, &detail.patient.last_name);

    let request = AiRequest {
        usage_type: SCOPE_SOAP_ASSIST.into(),
        prompt_version: PROMPT_VERSION_SOAP.into(),
        redacted_input: redacted.clone(),
    };
    let (provider, response) = registry.generate(&request)?;

    let draft: NoteContent = serde_json::from_str(&response.output)
        .map_err(|e| AiError::Invalid(format!("borrador IA invalido: {e}")))?;

    let run_id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO ai_runs
            (id, encounter_id, patient_id, usage_type, provider, model_version,
             prompt_version, status, input_redacted, output, estimated_cost_cents,
             latency_ms, consent_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'DRAFT', ?8, ?9, ?10, ?11, ?12, ?13)",
        params![
            run_id,
            encounter_id,
            patient_id,
            SCOPE_SOAP_ASSIST,
            provider,
            response.model_version,
            request.prompt_version,
            redacted,
            response.output,
            response.estimated_cost_cents,
            response.latency_ms,
            consent_id,
            now()
        ],
    )?;
    audit(conn, "ai_run", &run_id, "draft-generated", Some(&provider))?;

    Ok(SoapDraft {
        run_id,
        provider,
        model_version: response.model_version,
        estimated_cost_cents: response.estimated_cost_cents,
        latency_ms: response.latency_ms,
        draft,
    })
}

/// Registra el resultado de la revision humana del borrador: APPROVED cuando el
/// medico lo uso (tras editarlo y guardarlo como nota) o DISCARDED si lo
/// descarto. La nota clinica la guarda el flujo manual existente; aqui solo se
/// cierra la traza con el veredicto y el feedback.
pub fn review_run(
    conn: &Connection,
    run_id: &str,
    status: &str,
    feedback: Option<&str>,
) -> Result<AiRun, AiError> {
    if status != "APPROVED" && status != "DISCARDED" {
        return Err(AiError::Invalid("estado de revision invalido".into()));
    }
    let run = read_run(conn, run_id)?;
    if run.status != "DRAFT" {
        return Err(AiError::Invalid("el borrador ya fue revisado".into()));
    }
    conn.execute(
        "UPDATE ai_runs SET status = ?2, feedback = ?3, reviewed_at = ?4 WHERE id = ?1",
        params![run_id, status, feedback, now()],
    )?;
    audit(conn, "ai_run", run_id, "reviewed", Some(status))?;
    read_run(conn, run_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_encrypted;
    use rusqlite::params;

    fn test_conn(name: &str) -> Connection {
        let dir = std::env::temp_dir().join("midoc-ai-tests");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(format!("{name}-{}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        open_encrypted(&path, "clave-de-prueba").unwrap()
    }

    fn seed_encounter(conn: &Connection) -> (String, String) {
        let appointment_id = "appt-ai";
        let patient_id = "pat-ai";
        conn.execute(
            "INSERT INTO appointments (id, status, scheduled_start, scheduled_end,
                service_name, reason, patient_id, patient_first_name,
                patient_last_name, patient_phone, updated_at)
             VALUES (?1, 'CONFIRMED', '2026-06-22T15:00:00Z', '2026-06-22T15:30:00Z',
                'Consulta', 'Tos persistente', ?2, 'Hugo', 'Paz', '6140001111', '0')",
            params![appointment_id, patient_id],
        )
        .unwrap();
        let encounter = clinical::open_encounter_for_appointment(conn, appointment_id).unwrap();
        (encounter.id, patient_id.to_string())
    }

    /// Proveedor que siempre falla, para probar el fallback.
    struct FailingProvider;
    impl AiProvider for FailingProvider {
        fn name(&self) -> &str {
            "failing"
        }
        fn generate(&self, _request: &AiRequest) -> Result<AiResponse, AiError> {
            Err(AiError::AllProvidersFailed)
        }
    }

    #[test]
    fn redaction_removes_patient_name() {
        let redacted = redact("Hugo Paz refiere tos. Hugo no tiene fiebre.", "Hugo", "Paz");
        assert!(!redacted.contains("Hugo"));
        assert!(!redacted.contains("Paz"));
        assert!(redacted.contains("[PACIENTE]"));
    }

    #[test]
    fn assist_requires_consent() {
        let conn = test_conn("consent");
        let (encounter_id, _patient_id) = seed_encounter(&conn);
        let registry = ProviderRegistry::default_local();

        // Sin consentimiento: rechazado.
        assert!(matches!(
            assist_soap(&conn, &encounter_id, &registry),
            Err(AiError::ConsentMissing)
        ));
    }

    #[test]
    fn assist_generates_draft_with_full_trace_and_no_autosave() {
        let conn = test_conn("draft");
        let (encounter_id, patient_id) = seed_encounter(&conn);
        grant_consent(&conn, &patient_id, SCOPE_SOAP_ASSIST).unwrap();

        let registry = ProviderRegistry::default_local();
        let draft = assist_soap(&conn, &encounter_id, &registry).unwrap();

        assert_eq!(draft.provider, "fake-clinico");
        assert!(draft.draft.subjective.contains("Tos persistente"));
        // El contexto enviado al proveedor no lleva el nombre del paciente.
        let stored_input: String = conn
            .query_row(
                "SELECT input_redacted FROM ai_runs WHERE id = ?1",
                params![draft.run_id],
                |row| row.get(0),
            )
            .unwrap();
        assert!(!stored_input.contains("Hugo"));

        // La traza quedo completa y en estado borrador.
        let run = read_run(&conn, &draft.run_id).unwrap();
        assert_eq!(run.status, "DRAFT");
        assert_eq!(run.prompt_version, PROMPT_VERSION_SOAP);
        assert!(run.estimated_cost_cents.is_some());
        assert!(run.latency_ms.is_some());

        // No se guardo ninguna nota automaticamente (regla: revision humana).
        let note_count: i64 = conn
            .query_row(
                "SELECT count(*) FROM note_versions WHERE encounter_id = ?1",
                params![encounter_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(note_count, 0);
    }

    #[test]
    fn provider_fallback_picks_next_on_failure() {
        let conn = test_conn("fallback");
        let (encounter_id, patient_id) = seed_encounter(&conn);
        grant_consent(&conn, &patient_id, SCOPE_SOAP_ASSIST).unwrap();

        let registry = ProviderRegistry::new(vec![
            Box::new(FailingProvider),
            Box::new(FakeProvider::new("respaldo")),
        ]);
        let draft = assist_soap(&conn, &encounter_id, &registry).unwrap();
        assert_eq!(draft.provider, "respaldo");
    }

    #[test]
    fn all_providers_failing_surfaces_error() {
        let conn = test_conn("all-fail");
        let (encounter_id, patient_id) = seed_encounter(&conn);
        grant_consent(&conn, &patient_id, SCOPE_SOAP_ASSIST).unwrap();

        let registry = ProviderRegistry::new(vec![Box::new(FailingProvider)]);
        assert!(matches!(
            assist_soap(&conn, &encounter_id, &registry),
            Err(AiError::AllProvidersFailed)
        ));
    }

    #[test]
    fn consent_revocation_blocks_new_runs() {
        let conn = test_conn("revoke");
        let (encounter_id, patient_id) = seed_encounter(&conn);
        grant_consent(&conn, &patient_id, SCOPE_SOAP_ASSIST).unwrap();
        revoke_consent(&conn, &patient_id, SCOPE_SOAP_ASSIST).unwrap();

        let registry = ProviderRegistry::default_local();
        assert!(matches!(
            assist_soap(&conn, &encounter_id, &registry),
            Err(AiError::ConsentMissing)
        ));
    }

    #[test]
    fn review_closes_trace_and_is_idempotent() {
        let conn = test_conn("review");
        let (encounter_id, patient_id) = seed_encounter(&conn);
        grant_consent(&conn, &patient_id, SCOPE_SOAP_ASSIST).unwrap();
        let registry = ProviderRegistry::default_local();
        let draft = assist_soap(&conn, &encounter_id, &registry).unwrap();

        let reviewed = review_run(&conn, &draft.run_id, "APPROVED", Some("util")).unwrap();
        assert_eq!(reviewed.status, "APPROVED");
        assert_eq!(reviewed.feedback.as_deref(), Some("util"));
        assert!(reviewed.reviewed_at.is_some());

        // Ya revisado: no se vuelve a revisar.
        assert!(matches!(
            review_run(&conn, &draft.run_id, "DISCARDED", None),
            Err(AiError::Invalid(_))
        ));

        let runs = list_runs(&conn, &encounter_id).unwrap();
        assert_eq!(runs.len(), 1);
    }
}
