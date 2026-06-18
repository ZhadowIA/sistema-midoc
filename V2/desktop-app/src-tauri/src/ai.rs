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
use serde::{Deserialize, Serialize};

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
    #[error("se alcanzo el presupuesto mensual de IA; ajustalo para continuar")]
    BudgetExceeded,
}

/// Alcance unico de consentimiento para asistencia de IA basada en el TEXTO del
/// expediente (SOAP, resumen, instrucciones, brechas). La transcripcion de voz
/// exige su propio consentimiento explicito.
pub const SCOPE_TEXT_ASSIST: &str = "TEXT_ASSIST";
pub const SCOPE_VOICE_TRANSCRIPTION: &str = "VOICE_TRANSCRIPTION";
pub const SCOPE_CONSULTATION_SCRIBE: &str = "CONSULTATION_SCRIBE";

/// Tipos de uso de IA de texto. El proveedor adapta su salida a cada uno.
pub const USAGE_SOAP_ASSIST: &str = "SOAP_ASSIST";
pub const USAGE_SUMMARY: &str = "LONGITUDINAL_SUMMARY";
pub const USAGE_INSTRUCTIONS: &str = "PATIENT_INSTRUCTIONS";
pub const USAGE_GAPS: &str = "CLINICAL_GAPS";
pub const USAGE_TRANSCRIPTION: &str = "TRANSCRIPTION";
pub const USAGE_CONSULTATION_STRUCTURING: &str = "CONSULTATION_STRUCTURING";
pub const AUDIO_RETENTION_DISCARD: &str = "discarded_after_transcription";

const TEXT_USAGES: &[&str] = &[USAGE_SUMMARY, USAGE_INSTRUCTIONS, USAGE_GAPS];

const PROMPT_VERSION_SOAP: &str = "soap-assist/v1";
const PROMPT_VERSION_SUMMARY: &str = "summary/v1";
const PROMPT_VERSION_INSTRUCTIONS: &str = "instructions/v1";
const PROMPT_VERSION_GAPS: &str = "gaps/v1";
const PROMPT_VERSION_TRANSCRIPTION: &str = "transcription/v1";
pub const PROMPT_VERSION_CONSULTATION_STRUCTURING: &str = "consultation-structuring/v1";
const MAX_AUDIO_BYTES: usize = 25 * 1024 * 1024;

fn prompt_version_for(usage_type: &str) -> &'static str {
    match usage_type {
        USAGE_SUMMARY => PROMPT_VERSION_SUMMARY,
        USAGE_INSTRUCTIONS => PROMPT_VERSION_INSTRUCTIONS,
        USAGE_GAPS => PROMPT_VERSION_GAPS,
        USAGE_CONSULTATION_STRUCTURING => PROMPT_VERSION_CONSULTATION_STRUCTURING,
        _ => PROMPT_VERSION_SOAP,
    }
}

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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsultationTurn {
    pub id: String,
    pub speaker: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemplateSegment {
    pub id: String,
    pub label: String,
    pub target: String,
    pub instructions: String,
    pub required: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SegmentDraft {
    pub segment_id: String,
    pub content: String,
    pub confidence: String,
    pub source_turns: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ConsultationStructuringOutput {
    segments: Vec<SegmentDraft>,
    #[serde(default)]
    missing: Vec<String>,
    #[serde(default)]
    warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct ConsultationStructuringDraft {
    pub run_id: String,
    pub usage_type: String,
    pub provider: String,
    pub model_version: String,
    pub estimated_cost_cents: i64,
    pub latency_ms: i64,
    pub segments: Vec<SegmentDraft>,
    pub missing: Vec<String>,
    pub warnings: Vec<String>,
}

#[derive(Serialize)]
struct ConsultationStructuringInput<'a> {
    task: &'a str,
    patient_name: &'a str,
    rules: &'a [&'a str],
    template_segments: &'a [TemplateSegment],
    turns: &'a [ConsultationTurn],
    encounter_context: String,
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
        #[cfg(test)]
        {
            Self::new(vec![Box::new(FakeProvider::new("fake-clinico"))])
        }
        #[cfg(not(test))]
        {
            if let Some(gemini) = GeminiProvider::from_env() {
                Self::new(vec![
                    Box::new(gemini),
                    Box::new(FakeProvider::new("fake-clinico")),
                ])
            } else {
                Self::new(vec![Box::new(FakeProvider::new("fake-clinico"))])
            }
        }
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
    cost_factor: i64,
}

impl FakeProvider {
    pub fn new(name: &str) -> Self {
        Self {
            name: name.to_string(),
            cost_factor: 1,
        }
    }

    /// Variante con multiplicador de costo, para comparar proveedores en el
    /// benchmark (un proveedor mas caro debe quedar peor a igualdad de calidad).
    pub fn with_cost(name: &str, cost_factor: i64) -> Self {
        Self {
            name: name.to_string(),
            cost_factor: cost_factor.max(1),
        }
    }
}

impl AiProvider for FakeProvider {
    fn name(&self) -> &str {
        &self.name
    }

    fn generate(&self, request: &AiRequest) -> Result<AiResponse, AiError> {
        let start = std::time::Instant::now();
        let context = request.redacted_input.trim();

        // Cada tipo de uso produce una salida determinista. El SOAP es JSON
        // estructurado (precarga el editor); los demas son texto. Ninguna
        // salida inventa hechos: deja marcadores para que el medico complete.
        let output = match request.usage_type.as_str() {
            USAGE_SOAP_ASSIST => {
                let draft = NoteContent {
                    subjective: format!("Borrador IA a partir del contexto disponible:\n{context}"),
                    objective: "Exploracion fisica: (a completar por el medico).".into(),
                    assessment: "Impresion diagnostica: (a confirmar por el medico).".into(),
                    plan: "Plan sugerido: (revisar y ajustar).".into(),
                    diagnosis: String::new(),
                    instructions: "Indicaciones al paciente: (a definir por el medico).".into(),
                    specialty: serde_json::Value::Null,
                };
                serde_json::to_string(&draft)
                    .map_err(|e| AiError::Invalid(format!("no se pudo serializar el borrador: {e}")))?
            }
            USAGE_SUMMARY => format!(
                "Resumen longitudinal (borrador):\nCon base en el expediente disponible:\n{context}\n\n(Revisar fidelidad antes de compartir.)"
            ),
            USAGE_INSTRUCTIONS => format!(
                "Indicaciones para el paciente (borrador):\n- Sigue el plan acordado en consulta.\n- Acude a tu proxima cita.\n- Contexto considerado:\n{context}\n\n(Ajustar a lenguaje del paciente y confirmar.)"
            ),
            USAGE_GAPS => format!(
                "Posibles brechas clinicas a revisar (borrador):\n- Verifica antecedentes y alergias.\n- Confirma seguimiento de diagnosticos previos.\n- Contexto considerado:\n{context}\n\n(Estas son sugerencias; el criterio es del medico.)"
            ),
            USAGE_CONSULTATION_STRUCTURING => fake_structuring_output(context)?,
            _ => return Err(AiError::Invalid("tipo de uso no soportado por el proveedor".into())),
        };

        // Costo estimado proporcional al tamano del contexto (modelo de la
        // fundacion; el proveedor real reporta el costo verdadero).
        let estimated_cost_cents = (1 + (context.len() as i64) / 500) * self.cost_factor;

        Ok(AiResponse {
            output,
            model_version: "fake-1".into(),
            estimated_cost_cents,
            latency_ms: start.elapsed().as_millis() as i64,
        })
    }
}

fn fake_structuring_output(context: &str) -> Result<String, AiError> {
    let parsed: serde_json::Value = serde_json::from_str(context).unwrap_or_default();
    let segments = parsed
        .get("template_segments")
        .and_then(|value| value.as_array())
        .cloned()
        .unwrap_or_default();
    let first_turn = parsed
        .get("turns")
        .and_then(|value| value.as_array())
        .and_then(|turns| turns.first())
        .and_then(|turn| turn.get("id"))
        .and_then(|value| value.as_str())
        .unwrap_or("turn-1")
        .to_string();
    let transcript = parsed
        .get("turns")
        .and_then(|value| value.as_array())
        .map(|turns| {
            turns
                .iter()
                .filter_map(|turn| turn.get("text").and_then(|text| text.as_str()))
                .collect::<Vec<_>>()
                .join(" ")
        })
        .filter(|text| !text.trim().is_empty())
        .unwrap_or_else(|| "No se encontro texto de conversacion.".into());

    let output_segments: Vec<SegmentDraft> = segments
        .iter()
        .take(4)
        .filter_map(|segment| {
            let id = segment.get("id")?.as_str()?.to_string();
            let label = segment
                .get("label")
                .and_then(|value| value.as_str())
                .unwrap_or("Segmento");
            Some(SegmentDraft {
                segment_id: id,
                content: format!("{label} (borrador IA): {transcript}"),
                confidence: "medium".into(),
                source_turns: vec![first_turn.clone()],
                warnings: vec!["Borrador determinista: revisar antes de usar.".into()],
            })
        })
        .collect();

    serde_json::to_string(&ConsultationStructuringOutput {
        segments: output_segments,
        missing: Vec::new(),
        warnings: vec!["Salida generada por proveedor fake local.".into()],
    })
    .map_err(|e| AiError::Invalid(format!("no se pudo serializar el borrador: {e}")))
}

#[cfg_attr(test, allow(dead_code))]
pub struct GeminiProvider {
    api_key: String,
    model: String,
}

#[cfg_attr(test, allow(dead_code))]
impl GeminiProvider {
    pub fn from_env() -> Option<Self> {
        let api_key = std::env::var("MIDOC_GEMINI_API_KEY").ok()?;
        let api_key = api_key.trim().to_string();
        if api_key.is_empty() {
            return None;
        }
        let model = std::env::var("MIDOC_GEMINI_MODEL")
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_else(|| "gemini-3-flash".into());
        Some(Self { api_key, model })
    }

    fn model_path(&self) -> String {
        if self.model.starts_with("models/") {
            self.model.clone()
        } else {
            format!("models/{}", self.model)
        }
    }
}

impl AiProvider for GeminiProvider {
    fn name(&self) -> &str {
        "gemini-direct"
    }

    fn generate(&self, request: &AiRequest) -> Result<AiResponse, AiError> {
        let start = std::time::Instant::now();
        let endpoint = format!(
            "https://generativelanguage.googleapis.com/v1beta/{}:generateContent",
            self.model_path()
        );

        let generation_config = if request.usage_type == USAGE_CONSULTATION_STRUCTURING {
            serde_json::json!({
                "temperature": 0.1,
                "responseMimeType": "application/json",
                "responseJsonSchema": consultation_structuring_schema()
            })
        } else {
            serde_json::json!({ "temperature": 0.2 })
        };

        let body = serde_json::json!({
            "systemInstruction": {
                "parts": [{
                    "text": "Eres apoyo documental clinico. No inventes informacion. Devuelve solo contenido derivado de la entrada y marca faltantes o ambiguedades."
                }]
            },
            "contents": [{
                "role": "user",
                "parts": [{ "text": request.redacted_input }]
            }],
            "generationConfig": generation_config
        });

        let client = reqwest::blocking::Client::new();
        let response = client
            .post(endpoint)
            .header("x-goog-api-key", &self.api_key)
            .json(&body)
            .send()
            .map_err(|e| AiError::Invalid(format!("Gemini no respondio: {e}")))?;
        if !response.status().is_success() {
            return Err(AiError::Invalid(format!(
                "Gemini rechazo la solicitud: {}",
                response.status()
            )));
        }
        let payload: serde_json::Value = response
            .json()
            .map_err(|e| AiError::Invalid(format!("respuesta Gemini invalida: {e}")))?;
        let output = payload
            .get("candidates")
            .and_then(|value| value.as_array())
            .and_then(|candidates| candidates.first())
            .and_then(|candidate| candidate.get("content"))
            .and_then(|content| content.get("parts"))
            .and_then(|value| value.as_array())
            .and_then(|parts| parts.first())
            .and_then(|part| part.get("text"))
            .and_then(|value| value.as_str())
            .ok_or_else(|| AiError::Invalid("Gemini no devolvio texto utilizable".into()))?
            .to_string();

        Ok(AiResponse {
            output,
            model_version: self.model.clone(),
            estimated_cost_cents: 1 + (request.redacted_input.len() as i64 / 4000),
            latency_ms: start.elapsed().as_millis() as i64,
        })
    }
}

#[cfg_attr(test, allow(dead_code))]
fn consultation_structuring_schema() -> serde_json::Value {
    serde_json::json!({
        "type": "object",
        "required": ["segments", "missing", "warnings"],
        "properties": {
            "segments": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["segment_id", "content", "confidence", "source_turns", "warnings"],
                    "properties": {
                        "segment_id": { "type": "string" },
                        "content": { "type": "string" },
                        "confidence": { "type": "string", "enum": ["high", "medium", "low"] },
                        "source_turns": { "type": "array", "items": { "type": "string" } },
                        "warnings": { "type": "array", "items": { "type": "string" } }
                    }
                }
            },
            "missing": { "type": "array", "items": { "type": "string" } },
            "warnings": { "type": "array", "items": { "type": "string" } }
        }
    })
}

/// Transcriptor fake determinista. Doble de pruebas del contrato: el flujo
/// gobernado real usa el proveedor Whisper local (`whisper-local`); en
/// produccion ya no se cablea el fake, por eso vive solo bajo `cfg(test)`.
#[cfg(test)]
pub struct FakeTranscriptionProvider {
    name: String,
}

#[cfg(test)]
impl FakeTranscriptionProvider {
    pub fn new(name: &str) -> Self {
        Self {
            name: name.to_string(),
        }
    }
}

#[cfg(test)]
impl TranscriptionProvider for FakeTranscriptionProvider {
    fn name(&self) -> &str {
        &self.name
    }

    fn transcribe(
        &self,
        request: &TranscriptionRequest,
        _audio: &AudioInput,
    ) -> Result<AiResponse, AiError> {
        let start = std::time::Instant::now();
        let duration = request
            .duration_seconds
            .map(|seconds| format!("{seconds} segundos"))
            .unwrap_or_else(|| "duracion no especificada".into());
        let output = format!(
            "Transcripcion (borrador): audio {media_type}, {duration}. \
            Revise terminos clinicos, medicamentos, dosis y hablantes antes de usarla.",
            media_type = request.media_type
        );

        Ok(AiResponse {
            output,
            model_version: "fake-transcription-1".into(),
            estimated_cost_cents: 1 + (request.byte_len as i64 / 1_000_000),
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

pub fn grant_consent(conn: &Connection, patient_id: &str, scope: &str) -> Result<String, AiError> {
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

/* ---------- Control de costo y creditos (RF29) ---------- */

const BUDGET_KEY: &str = "ai_monthly_budget_cents";

#[derive(Debug, Serialize)]
pub struct UsageByType {
    pub usage_type: String,
    pub run_count: i64,
    pub cost_cents: i64,
}

#[derive(Debug, Serialize)]
pub struct UsageSummary {
    /// Mes en formato YYYY-MM (UTC) sobre el que se reporta.
    pub month: String,
    /// Presupuesto mensual en centavos. 0 = sin limite.
    pub budget_cents: i64,
    pub spent_cents: i64,
    pub run_count: i64,
    pub by_usage: Vec<UsageByType>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiUsageReport {
    pub external_run_id: String,
    pub usage_type: String,
    pub status: String,
    pub provider_name: String,
    pub provider_type: String,
    // El portal valida estos opcionales con Zod `.optional().strict()`, que acepta
    // que la clave falte (undefined) pero RECHAZA `null`. Serde serializa
    // `Option::None` como `null`, asi que omitimos la clave cuando no hay valor
    // (p. ej. un run local de transcripcion sin costo ni version de modelo);
    // mandarla como `null` hacia que el sync fallara con "Datos invalidos.".
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_version: Option<String>,
    pub prompt_version: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub estimated_cost_cents: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latency_ms: Option<i64>,
    pub occurred_at: String,
    pub input_reference: serde_json::Value,
    pub output_reference: serde_json::Value,
}

/// Mes actual en UTC (YYYY-MM). El presupuesto es aproximado a zona UTC; es
/// suficiente para un control de costo, no para contabilidad fiscal.
fn current_month() -> String {
    chrono::Utc::now().format("%Y-%m").to_string()
}

pub fn get_budget_cents(conn: &Connection) -> Result<i64, AiError> {
    let value: Option<String> = conn
        .query_row(
            "SELECT value FROM app_meta WHERE key = ?1",
            params![BUDGET_KEY],
            |row| row.get(0),
        )
        .optional()?;
    Ok(value.and_then(|raw| raw.parse().ok()).unwrap_or(0))
}

pub fn set_budget_cents(conn: &Connection, cents: i64) -> Result<(), AiError> {
    if cents < 0 {
        return Err(AiError::Invalid(
            "el presupuesto no puede ser negativo".into(),
        ));
    }
    conn.execute(
        "INSERT INTO app_meta (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = ?2",
        params![BUDGET_KEY, cents.to_string()],
    )?;
    Ok(())
}

/// Gasto estimado de IA en un mes (YYYY-MM): suma el costo de todas las
/// ejecuciones, se hayan aprobado o descartado (generar ya consume).
fn month_spend_cents(conn: &Connection, month: &str) -> Result<i64, AiError> {
    let like = format!("{month}%");
    let total: i64 = conn.query_row(
        "SELECT COALESCE(SUM(estimated_cost_cents), 0) FROM ai_runs WHERE created_at LIKE ?1",
        params![like],
        |row| row.get(0),
    )?;
    Ok(total)
}

pub fn usage_summary(conn: &Connection) -> Result<UsageSummary, AiError> {
    let month = current_month();
    let like = format!("{month}%");

    let mut statement = conn.prepare(
        "SELECT usage_type, COUNT(*), COALESCE(SUM(estimated_cost_cents), 0)
         FROM ai_runs WHERE created_at LIKE ?1 GROUP BY usage_type ORDER BY usage_type",
    )?;
    let by_usage = statement
        .query_map(params![like], |row| {
            Ok(UsageByType {
                usage_type: row.get(0)?,
                run_count: row.get(1)?,
                cost_cents: row.get(2)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let run_count: i64 = by_usage.iter().map(|u| u.run_count).sum();
    let spent_cents: i64 = by_usage.iter().map(|u| u.cost_cents).sum();

    Ok(UsageSummary {
        month,
        budget_cents: get_budget_cents(conn)?,
        spent_cents,
        run_count,
        by_usage,
    })
}

pub fn pending_usage_reports(conn: &Connection, limit: i64) -> Result<Vec<AiUsageReport>, AiError> {
    if limit <= 0 {
        return Err(AiError::Invalid("el limite debe ser positivo".into()));
    }

    let mut statement = conn.prepare(
        "SELECT id, encounter_id, patient_id, usage_type, provider, model_version,
                prompt_version, status, estimated_cost_cents, latency_ms, created_at
         FROM ai_runs
         WHERE usage_reported_at IS NULL
         ORDER BY created_at ASC
         LIMIT ?1",
    )?;

    let reports = statement
        .query_map(params![limit], |row| {
            let run_id: String = row.get(0)?;
            let encounter_id: Option<String> = row.get(1)?;
            let patient_id: Option<String> = row.get(2)?;
            let usage_type: String = row.get(3)?;
            let (provider_type, input_kind, output_kind) = if usage_type == USAGE_TRANSCRIPTION {
                (
                    "TRANSCRIPTION",
                    "LOCAL_AI_AUDIO_INPUT",
                    "LOCAL_AI_TRANSCRIPT_OUTPUT",
                )
            } else {
                ("LLM", "LOCAL_AI_RUN_INPUT", "LOCAL_AI_RUN_OUTPUT")
            };
            let input_reference = usage_reference(
                input_kind,
                &run_id,
                encounter_id.as_deref(),
                patient_id.as_deref(),
            );
            let output_reference = usage_reference(
                output_kind,
                &run_id,
                encounter_id.as_deref(),
                patient_id.as_deref(),
            );

            Ok(AiUsageReport {
                external_run_id: run_id,
                usage_type,
                provider_name: row.get(4)?,
                provider_type: provider_type.into(),
                model_version: row.get(5)?,
                prompt_version: row.get(6)?,
                status: row.get(7)?,
                estimated_cost_cents: row.get(8)?,
                latency_ms: row.get(9)?,
                occurred_at: row.get(10)?,
                input_reference,
                output_reference,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(reports)
}

fn usage_reference(
    kind: &str,
    run_id: &str,
    encounter_id: Option<&str>,
    patient_id: Option<&str>,
) -> serde_json::Value {
    let mut value = serde_json::Map::new();
    value.insert("kind".into(), serde_json::Value::String(kind.into()));
    value.insert(
        "localRunId".into(),
        serde_json::Value::String(run_id.into()),
    );
    if let Some(encounter_id) = encounter_id {
        value.insert(
            "encounterId".into(),
            serde_json::Value::String(encounter_id.into()),
        );
    }
    if let Some(patient_id) = patient_id {
        value.insert(
            "patientId".into(),
            serde_json::Value::String(patient_id.into()),
        );
    }
    serde_json::Value::Object(value)
}

pub fn mark_usage_reports_sent(conn: &Connection, run_ids: &[String]) -> Result<(), AiError> {
    let reported_at = now();
    for run_id in run_ids {
        conn.execute(
            "UPDATE ai_runs SET usage_reported_at = ?2 WHERE id = ?1",
            params![run_id, reported_at],
        )?;
    }
    Ok(())
}

/// Verifica el presupuesto antes de ejecutar IA. Bloquea si ya se alcanzo el
/// limite del mes. Presupuesto 0 = sin limite.
fn ensure_within_budget(conn: &Connection) -> Result<(), AiError> {
    let budget = get_budget_cents(conn)?;
    if budget == 0 {
        return Ok(());
    }
    if month_spend_cents(conn, &current_month())? >= budget {
        return Err(AiError::BudgetExceeded);
    }
    Ok(())
}

/* ---------- Asistencia de IA sobre texto del expediente ---------- */

/// Construye el contexto clinico a partir del expediente: motivo de cita,
/// preconsulta, diagnosticos previos y nota actual. Comun a todos los usos.
fn build_context(detail: &clinical::EncounterDetail) -> String {
    let mut parts: Vec<String> = Vec::new();
    if let Some(reason) = &detail.appointment_reason {
        parts.push(format!("Motivo de consulta: {reason}"));
    }
    if let Some(preconsulta) = &detail.preconsulta {
        parts.push(format!("Preconsulta del paciente: {preconsulta}"));
    }
    if let Some(medical_history) = &detail.medical_history {
        parts.push(format!("Cuestionario de antecedentes del paciente: {medical_history}"));
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

/// Borrador de texto libre (resumen, instrucciones, brechas). Como el SOAP, es
/// solo un punto de partida para revision humana; nada se guarda automaticamente.
#[derive(Debug, Serialize)]
pub struct TextDraft {
    pub run_id: String,
    pub usage_type: String,
    pub provider: String,
    pub model_version: String,
    pub estimated_cost_cents: i64,
    pub latency_ms: i64,
    pub text: String,
}

#[derive(Debug, Serialize)]
pub struct TranscriptionDraft {
    pub run_id: String,
    pub usage_type: String,
    pub provider: String,
    pub model_version: String,
    pub estimated_cost_cents: i64,
    pub latency_ms: i64,
    pub transcript_text: String,
    pub audio_retention_policy: String,
}

/// Nucleo comun de toda asistencia de IA sobre el expediente: valida encuentro
/// abierto, exige consentimiento de texto vigente, seudonimiza el contexto,
/// invoca el orquestador (con fallback) y registra la traza en estado DRAFT.
/// Devuelve el id de la traza, el proveedor ganador y la respuesta cruda.
fn run_assist(
    conn: &Connection,
    encounter_id: &str,
    usage_type: &str,
    registry: &ProviderRegistry,
) -> Result<(String, String, AiResponse), AiError> {
    let detail =
        clinical::get_encounter_detail(conn, encounter_id).map_err(|_| AiError::NotFound)?;
    if detail.encounter.status == "SIGNED" {
        return Err(AiError::Invalid("el encuentro ya fue firmado".into()));
    }

    let patient_id = detail.encounter.patient_id.clone();
    let consent_id =
        active_consent(conn, &patient_id, SCOPE_TEXT_ASSIST)?.ok_or(AiError::ConsentMissing)?;

    // Control de costo: no se ejecuta IA si el mes ya alcanzo su presupuesto.
    ensure_within_budget(conn)?;

    let context = build_context(&detail);
    let redacted = redact(
        &context,
        &detail.patient.first_name,
        &detail.patient.last_name,
    );

    let request = AiRequest {
        usage_type: usage_type.into(),
        prompt_version: prompt_version_for(usage_type).into(),
        redacted_input: redacted.clone(),
    };
    let (provider, response) = registry.generate(&request)?;

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
            usage_type,
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
    audit(conn, "ai_run", &run_id, "draft-generated", Some(usage_type))?;
    Ok((run_id, provider, response))
}

/// Genera un borrador SOAP asistido (estructurado). No guarda nota.
pub fn assist_soap(
    conn: &Connection,
    encounter_id: &str,
    registry: &ProviderRegistry,
) -> Result<SoapDraft, AiError> {
    let (run_id, provider, response) = run_assist(conn, encounter_id, USAGE_SOAP_ASSIST, registry)?;
    let draft: NoteContent = serde_json::from_str(&response.output)
        .map_err(|e| AiError::Invalid(format!("borrador IA invalido: {e}")))?;
    Ok(SoapDraft {
        run_id,
        provider,
        model_version: response.model_version,
        estimated_cost_cents: response.estimated_cost_cents,
        latency_ms: response.latency_ms,
        draft,
    })
}

/// Genera un borrador de texto (resumen longitudinal, instrucciones al paciente
/// o brechas clinicas). Misma gobernanza que el SOAP; no guarda nada.
pub fn assist_text(
    conn: &Connection,
    encounter_id: &str,
    usage_type: &str,
    registry: &ProviderRegistry,
) -> Result<TextDraft, AiError> {
    if !TEXT_USAGES.contains(&usage_type) {
        return Err(AiError::Invalid(
            "tipo de asistencia de texto invalido".into(),
        ));
    }
    let (run_id, provider, response) = run_assist(conn, encounter_id, usage_type, registry)?;
    Ok(TextDraft {
        run_id,
        usage_type: usage_type.into(),
        provider,
        model_version: response.model_version,
        estimated_cost_cents: response.estimated_cost_cents,
        latency_ms: response.latency_ms,
        text: response.output,
    })
}

fn validate_consultation_turns(turns: &[ConsultationTurn]) -> Result<Vec<ConsultationTurn>, AiError> {
    let cleaned: Vec<ConsultationTurn> = turns
        .iter()
        .filter_map(|turn| {
            let text = turn.text.trim();
            if text.is_empty() {
                return None;
            }
            let speaker = turn.speaker.trim().to_uppercase();
            if speaker != "MEDICO" && speaker != "PACIENTE" {
                return None;
            }
            Some(ConsultationTurn {
                id: turn.id.trim().to_string(),
                speaker,
                text: text.to_string(),
            })
        })
        .collect();
    if cleaned.is_empty() {
        return Err(AiError::Invalid(
            "la conversacion debe incluir turnos validos".into(),
        ));
    }
    if cleaned.iter().any(|turn| turn.id.is_empty()) {
        return Err(AiError::Invalid("cada turno debe tener identificador".into()));
    }
    Ok(cleaned)
}

fn validate_template_segments(
    segments: &[TemplateSegment],
) -> Result<Vec<TemplateSegment>, AiError> {
    use std::collections::HashSet;

    let cleaned: Vec<TemplateSegment> = segments
        .iter()
        .filter_map(|segment| {
            let id = segment.id.trim();
            let label = segment.label.trim();
            let target = segment.target.trim();
            if id.is_empty() || label.is_empty() || target.is_empty() {
                return None;
            }
            Some(TemplateSegment {
                id: id.to_string(),
                label: label.to_string(),
                target: target.to_string(),
                instructions: segment.instructions.trim().to_string(),
                required: segment.required,
            })
        })
        .collect();
    if cleaned.is_empty() {
        return Err(AiError::Invalid(
            "la plantilla debe incluir segmentos validos".into(),
        ));
    }

    let mut ids = HashSet::new();
    for segment in &cleaned {
        if !ids.insert(segment.id.clone()) {
            return Err(AiError::Invalid(format!(
                "segmento duplicado en plantilla: {}",
                segment.id
            )));
        }
    }
    Ok(cleaned)
}

fn parse_structuring_output(
    raw: &str,
    template_segments: &[TemplateSegment],
    turns: &[ConsultationTurn],
) -> Result<ConsultationStructuringOutput, AiError> {
    use std::collections::HashSet;

    let output: ConsultationStructuringOutput = serde_json::from_str(raw)
        .map_err(|e| AiError::Invalid(format!("respuesta de acomodo invalida: {e}")))?;
    let allowed: HashSet<&str> = template_segments
        .iter()
        .map(|segment| segment.id.as_str())
        .collect();
    let allowed_turns: HashSet<&str> = turns.iter().map(|turn| turn.id.as_str()).collect();
    for segment in &output.segments {
        if !allowed.contains(segment.segment_id.as_str()) {
            return Err(AiError::Invalid(format!(
                "segmento desconocido devuelto por IA: {}",
                segment.segment_id
            )));
        }
        if !matches!(segment.confidence.as_str(), "high" | "medium" | "low") {
            return Err(AiError::Invalid(format!(
                "confianza invalida en segmento: {}",
                segment.segment_id
            )));
        }
        for source_turn in &segment.source_turns {
            if !allowed_turns.contains(source_turn.as_str()) {
                return Err(AiError::Invalid(format!(
                    "fuente desconocida en segmento {}: {}",
                    segment.segment_id, source_turn
                )));
            }
        }
        if segment.source_turns.is_empty() && segment.warnings.is_empty() {
            return Err(AiError::Invalid(format!(
                "segmento sin fuentes requiere advertencia: {}",
                segment.segment_id
            )));
        }
    }
    Ok(output)
}

/// Acomoda una conversacion Medico/Paciente dentro de la plantilla activa. La
/// salida es un borrador segmentado: no guarda nota ni firma el encuentro.
pub fn structure_consultation(
    conn: &Connection,
    encounter_id: &str,
    turns: Vec<ConsultationTurn>,
    template_segments: Vec<TemplateSegment>,
    registry: &ProviderRegistry,
) -> Result<ConsultationStructuringDraft, AiError> {
    let detail =
        clinical::get_encounter_detail(conn, encounter_id).map_err(|_| AiError::NotFound)?;
    if detail.encounter.status == "SIGNED" {
        return Err(AiError::Invalid("el encuentro ya fue firmado".into()));
    }

    let patient_id = detail.encounter.patient_id.clone();
    let consent_id = active_consent(conn, &patient_id, SCOPE_CONSULTATION_SCRIBE)?
        .ok_or(AiError::ConsentMissing)?;
    ensure_within_budget(conn)?;

    let turns = validate_consultation_turns(&turns)?;
    let template_segments = validate_template_segments(&template_segments)?;
    let patient_name = format!("{} {}", detail.patient.first_name, detail.patient.last_name);
    let rules = [
        "Devuelve JSON valido siguiendo el schema.",
        "No inventes datos; si falta informacion, agregala en missing.",
        "Usa solo segment_id presentes en template_segments.",
        "Incluye source_turns con ids de turnos que sustentan cada segmento.",
    ];
    let input = ConsultationStructuringInput {
        task: "Acomoda la conversacion en los segmentos de la plantilla clinica activa.",
        patient_name: &patient_name,
        rules: &rules,
        template_segments: &template_segments,
        turns: &turns,
        encounter_context: build_context(&detail),
    };
    let raw_input = serde_json::to_string(&input)
        .map_err(|e| AiError::Invalid(format!("entrada de acomodo invalida: {e}")))?;
    let redacted = redact(
        &raw_input,
        &detail.patient.first_name,
        &detail.patient.last_name,
    );

    let request = AiRequest {
        usage_type: USAGE_CONSULTATION_STRUCTURING.into(),
        prompt_version: PROMPT_VERSION_CONSULTATION_STRUCTURING.into(),
        redacted_input: redacted.clone(),
    };
    let (provider, response) = registry.generate(&request)?;
    let output = parse_structuring_output(&response.output, &template_segments, &turns)?;

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
            USAGE_CONSULTATION_STRUCTURING,
            provider,
            response.model_version,
            PROMPT_VERSION_CONSULTATION_STRUCTURING,
            redacted,
            response.output,
            response.estimated_cost_cents,
            response.latency_ms,
            consent_id,
            now()
        ],
    )?;
    audit(
        conn,
        "ai_run",
        &run_id,
        "consultation-structuring-draft-generated",
        Some(USAGE_CONSULTATION_STRUCTURING),
    )?;

    Ok(ConsultationStructuringDraft {
        run_id,
        usage_type: USAGE_CONSULTATION_STRUCTURING.into(),
        provider,
        model_version: response.model_version,
        estimated_cost_cents: response.estimated_cost_cents,
        latency_ms: response.latency_ms,
        segments: output.segments,
        missing: output.missing,
        warnings: output.warnings,
    })
}

fn validate_audio_input(audio: &AudioInput) -> Result<(), AiError> {
    if audio.bytes.is_empty() {
        return Err(AiError::Invalid("el audio no puede estar vacio".into()));
    }
    if audio.bytes.len() > MAX_AUDIO_BYTES {
        return Err(AiError::Invalid(
            "el audio excede el tamano permitido".into(),
        ));
    }
    let supported = matches!(
        audio.media_type.as_str(),
        "audio/webm" | "audio/wav" | "audio/mpeg" | "audio/mp4" | "audio/ogg"
    );
    if !supported {
        return Err(AiError::Invalid("formato de audio no soportado".into()));
    }
    if matches!(audio.duration_seconds, Some(seconds) if seconds <= 0) {
        return Err(AiError::Invalid(
            "la duracion del audio debe ser positiva".into(),
        ));
    }
    Ok(())
}

fn audio_input_metadata(audio: &AudioInput) -> Result<String, AiError> {
    serde_json::to_string(&serde_json::json!({
        "kind": "AUDIO_TRANSIENT",
        "fileName": audio.file_name,
        "mediaType": audio.media_type,
        "byteLength": audio.bytes.len(),
        "durationSeconds": audio.duration_seconds,
        "retention": AUDIO_RETENTION_DISCARD
    }))
    .map_err(|e| AiError::Invalid(format!("metadatos de audio invalidos: {e}")))
}

/// Transcribe audio de consulta con consentimiento explicito separado. El audio
/// se usa de forma transitoria y no se persiste; solo queda metadata operativa
/// y la transcripcion borrador en la base local cifrada para revision humana.
pub fn transcribe_audio(
    conn: &Connection,
    encounter_id: &str,
    audio: AudioInput,
    provider: &dyn TranscriptionProvider,
) -> Result<TranscriptionDraft, AiError> {
    validate_audio_input(&audio)?;

    let detail =
        clinical::get_encounter_detail(conn, encounter_id).map_err(|_| AiError::NotFound)?;
    if detail.encounter.status == "SIGNED" {
        return Err(AiError::Invalid("el encuentro ya fue firmado".into()));
    }

    let patient_id = detail.encounter.patient_id.clone();
    let consent_id = active_consent(conn, &patient_id, SCOPE_VOICE_TRANSCRIPTION)?
        .ok_or(AiError::ConsentMissing)?;
    ensure_within_budget(conn)?;

    let request = TranscriptionRequest {
        media_type: audio.media_type.clone(),
        byte_len: audio.bytes.len(),
        duration_seconds: audio.duration_seconds,
    };
    let input_metadata = audio_input_metadata(&audio)?;
    let response = provider.transcribe(&request, &audio)?;

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
            USAGE_TRANSCRIPTION,
            provider.name(),
            response.model_version,
            PROMPT_VERSION_TRANSCRIPTION,
            input_metadata,
            response.output,
            response.estimated_cost_cents,
            response.latency_ms,
            consent_id,
            now()
        ],
    )?;
    audit(
        conn,
        "ai_run",
        &run_id,
        "transcription-draft-generated",
        Some(USAGE_TRANSCRIPTION),
    )?;

    Ok(TranscriptionDraft {
        run_id,
        usage_type: USAGE_TRANSCRIPTION.into(),
        provider: provider.name().into(),
        model_version: response.model_version,
        estimated_cost_cents: response.estimated_cost_cents,
        latency_ms: response.latency_ms,
        transcript_text: response.output,
        audio_retention_policy: AUDIO_RETENTION_DISCARD.into(),
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

/* ---------- Benchmark clinico (RF41) ---------- */

/// Caso de benchmark con datos SIMULADOS (sin PHI). El benchmark se ejecuta
/// con datos simulados o autorizados con consentimiento; aqui solo simulados.
struct BenchmarkCase {
    usage_type: &'static str,
    context: &'static str,
}

/// Conjunto representativo minimo (medicina general y odontologia). Se amplia
/// cuando se cablee un proveedor real con audios/casos autorizados.
fn benchmark_cases() -> Vec<BenchmarkCase> {
    vec![
        BenchmarkCase {
            usage_type: USAGE_SOAP_ASSIST,
            context: "Tos y fiebre de tres dias.",
        },
        BenchmarkCase {
            usage_type: USAGE_SOAP_ASSIST,
            context: "Dolor abdominal epigastrico.",
        },
        BenchmarkCase {
            usage_type: USAGE_SOAP_ASSIST,
            context: "Dolor dental en molar inferior.",
        },
        BenchmarkCase {
            usage_type: USAGE_SUMMARY,
            context: "Paciente con HTA y DM2 en control.",
        },
        BenchmarkCase {
            usage_type: USAGE_INSTRUCTIONS,
            context: "Post extraccion dental.",
        },
        BenchmarkCase {
            usage_type: USAGE_GAPS,
            context: "Control de paciente cronico.",
        },
    ]
}

/// Completitud de una salida (0-100). Para SOAP cuenta las secciones clave no
/// vacias; para texto, basta con que la salida no este vacia.
fn completeness_pct(usage_type: &str, output: &str) -> i64 {
    if usage_type == USAGE_SOAP_ASSIST {
        let Ok(note) = serde_json::from_str::<NoteContent>(output) else {
            return 0;
        };
        let sections = [
            &note.subjective,
            &note.objective,
            &note.assessment,
            &note.plan,
        ];
        let filled = sections.iter().filter(|s| !s.trim().is_empty()).count();
        (filled as i64) * 100 / (sections.len() as i64)
    } else if output.trim().is_empty() {
        0
    } else {
        100
    }
}

#[derive(Debug, Serialize)]
pub struct BenchmarkResult {
    pub provider: String,
    pub success_count: i64,
    pub avg_latency_ms: i64,
    pub total_cost_cents: i64,
    pub completeness_pct: i64,
}

#[derive(Debug, Serialize)]
pub struct BenchmarkRun {
    pub id: String,
    pub name: String,
    pub case_count: i64,
    pub recommended_provider: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
    pub results: Vec<BenchmarkResult>,
}

/// Evalua un proveedor contra el set de casos y agrega sus metricas.
fn evaluate_provider(provider: &dyn AiProvider, cases: &[BenchmarkCase]) -> BenchmarkResult {
    let mut success = 0i64;
    let mut latency_sum = 0i64;
    let mut cost = 0i64;
    let mut completeness_sum = 0i64;

    for case in cases {
        let request = AiRequest {
            usage_type: case.usage_type.into(),
            prompt_version: prompt_version_for(case.usage_type).into(),
            redacted_input: case.context.into(),
        };
        if let Ok(response) = provider.generate(&request) {
            success += 1;
            latency_sum += response.latency_ms;
            cost += response.estimated_cost_cents;
            completeness_sum += completeness_pct(case.usage_type, &response.output);
        }
    }

    let n = cases.len().max(1) as i64;
    BenchmarkResult {
        provider: provider.name().to_string(),
        success_count: success,
        avg_latency_ms: if success > 0 {
            latency_sum / success
        } else {
            0
        },
        total_cost_cents: cost,
        completeness_pct: completeness_sum / n,
    }
}

/// Elige el proveedor recomendado: mayor exito, luego mayor completitud, luego
/// menor costo, luego menor latencia. Devuelve nombre y justificacion.
fn recommend(results: &[BenchmarkResult]) -> Option<(String, String)> {
    let best = results.iter().max_by(|a, b| {
        a.success_count
            .cmp(&b.success_count)
            .then(a.completeness_pct.cmp(&b.completeness_pct))
            .then(b.total_cost_cents.cmp(&a.total_cost_cents))
            .then(b.avg_latency_ms.cmp(&a.avg_latency_ms))
    })?;
    let notes = format!(
        "Recomendado por mayor exito/completitud y menor costo: {} exitos, {}% completitud, {} centavos, {} ms promedio.",
        best.success_count, best.completeness_pct, best.total_cost_cents, best.avg_latency_ms
    );
    Some((best.provider.clone(), notes))
}

/// Ejecuta el benchmark de los proveedores dados contra el set simulado,
/// guarda la corrida y los resultados, y documenta la decision.
pub fn run_benchmark(
    conn: &Connection,
    name: &str,
    providers: &[Box<dyn AiProvider>],
) -> Result<BenchmarkRun, AiError> {
    if providers.is_empty() {
        return Err(AiError::Invalid(
            "el benchmark necesita al menos un proveedor".into(),
        ));
    }
    let cases = benchmark_cases();
    let results: Vec<BenchmarkResult> = providers
        .iter()
        .map(|p| evaluate_provider(p.as_ref(), &cases))
        .collect();

    let recommendation = recommend(&results);
    let run_id = uuid::Uuid::new_v4().to_string();
    let created_at = now();
    conn.execute(
        "INSERT INTO ai_benchmark_runs (id, name, case_count, recommended_provider, notes, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            run_id,
            name,
            cases.len() as i64,
            recommendation.as_ref().map(|(p, _)| p.clone()),
            recommendation.as_ref().map(|(_, n)| n.clone()),
            created_at
        ],
    )?;
    for result in &results {
        conn.execute(
            "INSERT INTO ai_benchmark_results
                (id, run_id, provider, success_count, avg_latency_ms, total_cost_cents, completeness_pct)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                uuid::Uuid::new_v4().to_string(),
                run_id,
                result.provider,
                result.success_count,
                result.avg_latency_ms,
                result.total_cost_cents,
                result.completeness_pct
            ],
        )?;
    }
    audit(conn, "ai_benchmark", &run_id, "executed", Some(name))?;

    Ok(BenchmarkRun {
        id: run_id,
        name: name.into(),
        case_count: cases.len() as i64,
        recommended_provider: recommendation.as_ref().map(|(p, _)| p.clone()),
        notes: recommendation.map(|(_, n)| n),
        created_at,
        results,
    })
}

/// Ejecuta el benchmark con el set de proveedores por defecto de comparacion:
/// dos proveedores fake con distinto costo (el real entra en staging con BAA).
pub fn run_default_benchmark(conn: &Connection, name: &str) -> Result<BenchmarkRun, AiError> {
    let providers: Vec<Box<dyn AiProvider>> = vec![
        Box::new(FakeProvider::with_cost("openai-fake", 1)),
        Box::new(FakeProvider::with_cost("medlm-fake", 3)),
    ];
    run_benchmark(conn, name, &providers)
}

fn read_benchmark_results(
    conn: &Connection,
    run_id: &str,
) -> Result<Vec<BenchmarkResult>, AiError> {
    let mut statement = conn.prepare(
        "SELECT provider, success_count, avg_latency_ms, total_cost_cents, completeness_pct
         FROM ai_benchmark_results WHERE run_id = ?1 ORDER BY total_cost_cents ASC",
    )?;
    let rows = statement
        .query_map(params![run_id], |row| {
            Ok(BenchmarkResult {
                provider: row.get(0)?,
                success_count: row.get(1)?,
                avg_latency_ms: row.get(2)?,
                total_cost_cents: row.get(3)?,
                completeness_pct: row.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn list_benchmarks(conn: &Connection) -> Result<Vec<BenchmarkRun>, AiError> {
    let mut statement = conn.prepare(
        "SELECT id, name, case_count, recommended_provider, notes, created_at
         FROM ai_benchmark_runs ORDER BY created_at DESC",
    )?;
    // Cada corrida se materializa con sus resultados vacios; se rellenan en un
    // segundo paso para no anidar consultas dentro del query_map.
    let mut runs = statement
        .query_map([], |row| {
            Ok(BenchmarkRun {
                id: row.get(0)?,
                name: row.get(1)?,
                case_count: row.get(2)?,
                recommended_provider: row.get(3)?,
                notes: row.get(4)?,
                created_at: row.get(5)?,
                results: Vec::new(),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    for run in &mut runs {
        run.results = read_benchmark_results(conn, &run.id)?;
    }
    Ok(runs)
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

    struct RawProvider {
        output: String,
    }

    impl RawProvider {
        fn new(output: &str) -> Self {
            Self {
                output: output.to_string(),
            }
        }
    }

    impl AiProvider for RawProvider {
        fn name(&self) -> &str {
            "raw-scribe"
        }

        fn generate(&self, _request: &AiRequest) -> Result<AiResponse, AiError> {
            Ok(AiResponse {
                output: self.output.clone(),
                model_version: "raw-1".into(),
                estimated_cost_cents: 3,
                latency_ms: 4,
            })
        }
    }

    fn scribe_turns() -> Vec<ConsultationTurn> {
        vec![
            ConsultationTurn {
                id: "turn-1".into(),
                speaker: "MEDICO".into(),
                text: "¿Desde cuando tiene tos?".into(),
            },
            ConsultationTurn {
                id: "turn-2".into(),
                speaker: "PACIENTE".into(),
                text: "Desde hace tres dias, sin fiebre.".into(),
            },
        ]
    }

    fn scribe_segments() -> Vec<TemplateSegment> {
        vec![
            TemplateSegment {
                id: "subjective".into(),
                label: "S - Subjetivo".into(),
                target: "subjective".into(),
                instructions: "Resume lo referido por el paciente.".into(),
                required: true,
            },
            TemplateSegment {
                id: "plan".into(),
                label: "P - Plan".into(),
                target: "plan".into(),
                instructions: "Extrae el plan mencionado.".into(),
                required: false,
            },
        ]
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
    fn consultation_scribe_requires_specific_consent() {
        let conn = test_conn("scribe-consent");
        let (encounter_id, patient_id) = seed_encounter(&conn);
        grant_consent(&conn, &patient_id, SCOPE_TEXT_ASSIST).unwrap();
        grant_consent(&conn, &patient_id, SCOPE_VOICE_TRANSCRIPTION).unwrap();
        let registry = ProviderRegistry::default_local();

        assert!(matches!(
            structure_consultation(
                &conn,
                &encounter_id,
                scribe_turns(),
                scribe_segments(),
                &registry
            ),
            Err(AiError::ConsentMissing)
        ));
    }

    #[test]
    fn consultation_scribe_rejects_signed_encounters() {
        let conn = test_conn("scribe-signed");
        let (encounter_id, patient_id) = seed_encounter(&conn);
        grant_consent(&conn, &patient_id, SCOPE_CONSULTATION_SCRIBE).unwrap();
        clinical::save_note(&conn, &encounter_id, &NoteContent::default()).unwrap();
        clinical::sign_encounter(&conn, &encounter_id).unwrap();
        let registry = ProviderRegistry::default_local();

        assert!(matches!(
            structure_consultation(
                &conn,
                &encounter_id,
                scribe_turns(),
                scribe_segments(),
                &registry
            ),
            Err(AiError::Invalid(message)) if message.contains("firmado")
        ));
    }

    #[test]
    fn consultation_scribe_rejects_empty_inputs() {
        let conn = test_conn("scribe-empty");
        let (encounter_id, patient_id) = seed_encounter(&conn);
        grant_consent(&conn, &patient_id, SCOPE_CONSULTATION_SCRIBE).unwrap();
        let registry = ProviderRegistry::default_local();

        assert!(matches!(
            structure_consultation(&conn, &encounter_id, Vec::new(), scribe_segments(), &registry),
            Err(AiError::Invalid(message)) if message.contains("turnos")
        ));
        assert!(matches!(
            structure_consultation(&conn, &encounter_id, scribe_turns(), Vec::new(), &registry),
            Err(AiError::Invalid(message)) if message.contains("plantilla")
        ));
    }

    #[test]
    fn consultation_scribe_rejects_unknown_segment_ids() {
        let conn = test_conn("scribe-unknown-segment");
        let (encounter_id, patient_id) = seed_encounter(&conn);
        grant_consent(&conn, &patient_id, SCOPE_CONSULTATION_SCRIBE).unwrap();
        let registry = ProviderRegistry::new(vec![Box::new(RawProvider::new(
            r#"{"segments":[{"segment_id":"unknown","content":"texto","confidence":"high","source_turns":["turn-1"],"warnings":[]}],"missing":[],"warnings":[]}"#,
        ))]);

        assert!(matches!(
            structure_consultation(
                &conn,
                &encounter_id,
                scribe_turns(),
                scribe_segments(),
                &registry
            ),
            Err(AiError::Invalid(message)) if message.contains("segmento desconocido")
        ));
    }

    #[test]
    fn consultation_scribe_rejects_unknown_source_turns() {
        let conn = test_conn("scribe-unknown-source");
        let (encounter_id, patient_id) = seed_encounter(&conn);
        grant_consent(&conn, &patient_id, SCOPE_CONSULTATION_SCRIBE).unwrap();
        let registry = ProviderRegistry::new(vec![Box::new(RawProvider::new(
            r#"{"segments":[{"segment_id":"subjective","content":"tos de tres dias","confidence":"high","source_turns":["turn-404"],"warnings":[]}],"missing":[],"warnings":[]}"#,
        ))]);

        assert!(matches!(
            structure_consultation(
                &conn,
                &encounter_id,
                scribe_turns(),
                scribe_segments(),
                &registry
            ),
            Err(AiError::Invalid(message)) if message.contains("fuente desconocida")
        ));
    }

    #[test]
    fn consultation_scribe_requires_warning_when_segment_has_no_sources() {
        let conn = test_conn("scribe-source-warning");
        let (encounter_id, patient_id) = seed_encounter(&conn);
        grant_consent(&conn, &patient_id, SCOPE_CONSULTATION_SCRIBE).unwrap();
        let registry = ProviderRegistry::new(vec![Box::new(RawProvider::new(
            r#"{"segments":[{"segment_id":"subjective","content":"tos de tres dias","confidence":"low","source_turns":[],"warnings":[]}],"missing":[],"warnings":[]}"#,
        ))]);

        assert!(matches!(
            structure_consultation(
                &conn,
                &encounter_id,
                scribe_turns(),
                scribe_segments(),
                &registry
            ),
            Err(AiError::Invalid(message)) if message.contains("sin fuentes")
        ));
    }

    #[test]
    fn consultation_scribe_generates_segment_draft_trace() {
        let conn = test_conn("scribe-draft");
        let (encounter_id, patient_id) = seed_encounter(&conn);
        grant_consent(&conn, &patient_id, SCOPE_CONSULTATION_SCRIBE).unwrap();
        let registry = ProviderRegistry::default_local();

        let draft = structure_consultation(
            &conn,
            &encounter_id,
            scribe_turns(),
            scribe_segments(),
            &registry,
        )
        .unwrap();

        assert_eq!(draft.usage_type, USAGE_CONSULTATION_STRUCTURING);
        assert_eq!(draft.provider, "fake-clinico");
        assert!(draft.segments.iter().any(|segment| segment.segment_id == "subjective"));

        let run = read_run(&conn, &draft.run_id).unwrap();
        assert_eq!(run.status, "DRAFT");
        assert_eq!(run.usage_type, USAGE_CONSULTATION_STRUCTURING);
        assert_eq!(run.prompt_version, PROMPT_VERSION_CONSULTATION_STRUCTURING);

        let stored_input: String = conn
            .query_row(
                "SELECT input_redacted FROM ai_runs WHERE id = ?1",
                params![draft.run_id],
                |row| row.get(0),
            )
            .unwrap();
        assert!(!stored_input.contains("Hugo"));
        assert!(stored_input.contains("[PACIENTE]"));
    }

    #[test]
    fn consultation_scribe_usage_report_is_reference_only() {
        let conn = test_conn("scribe-report");
        let (encounter_id, patient_id) = seed_encounter(&conn);
        grant_consent(&conn, &patient_id, SCOPE_CONSULTATION_SCRIBE).unwrap();
        let registry = ProviderRegistry::default_local();

        let draft = structure_consultation(
            &conn,
            &encounter_id,
            scribe_turns(),
            scribe_segments(),
            &registry,
        )
        .unwrap();
        review_run(&conn, &draft.run_id, "APPROVED", None).unwrap();

        let report = pending_usage_reports(&conn, 10)
            .unwrap()
            .into_iter()
            .find(|report| report.external_run_id == draft.run_id)
            .unwrap();
        assert_eq!(report.usage_type, USAGE_CONSULTATION_STRUCTURING);
        assert_eq!(report.provider_type, "LLM");
        assert_eq!(report.input_reference["kind"], "LOCAL_AI_RUN_INPUT");
        assert_eq!(report.output_reference["kind"], "LOCAL_AI_RUN_OUTPUT");
        assert!(report.input_reference.get("content").is_none());
        assert!(report.output_reference.get("segments").is_none());
    }

    #[test]
    fn assist_generates_draft_with_full_trace_and_no_autosave() {
        let conn = test_conn("draft");
        let (encounter_id, patient_id) = seed_encounter(&conn);
        grant_consent(&conn, &patient_id, SCOPE_TEXT_ASSIST).unwrap();

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
        grant_consent(&conn, &patient_id, SCOPE_TEXT_ASSIST).unwrap();

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
        grant_consent(&conn, &patient_id, SCOPE_TEXT_ASSIST).unwrap();

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
        grant_consent(&conn, &patient_id, SCOPE_TEXT_ASSIST).unwrap();
        revoke_consent(&conn, &patient_id, SCOPE_TEXT_ASSIST).unwrap();

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
        grant_consent(&conn, &patient_id, SCOPE_TEXT_ASSIST).unwrap();
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

    #[test]
    fn text_assists_generate_drafts_under_same_governance() {
        let conn = test_conn("text");
        let (encounter_id, patient_id) = seed_encounter(&conn);
        let registry = ProviderRegistry::default_local();

        // Sin consentimiento: rechazado igual que el SOAP.
        assert!(matches!(
            assist_text(&conn, &encounter_id, USAGE_SUMMARY, &registry),
            Err(AiError::ConsentMissing)
        ));

        grant_consent(&conn, &patient_id, SCOPE_TEXT_ASSIST).unwrap();

        for usage in [USAGE_SUMMARY, USAGE_INSTRUCTIONS, USAGE_GAPS] {
            let draft = assist_text(&conn, &encounter_id, usage, &registry).unwrap();
            assert_eq!(draft.usage_type, usage);
            assert!(!draft.text.is_empty());
            // El contexto enviado al proveedor no lleva el nombre del paciente.
            let stored: String = conn
                .query_row(
                    "SELECT input_redacted FROM ai_runs WHERE id = ?1",
                    params![draft.run_id],
                    |row| row.get(0),
                )
                .unwrap();
            assert!(!stored.contains("Hugo"));
        }

        // Tipo de texto invalido se rechaza (SOAP no es un assist de texto libre).
        assert!(matches!(
            assist_text(&conn, &encounter_id, USAGE_SOAP_ASSIST, &registry),
            Err(AiError::Invalid(_))
        ));

        // Cada ejecucion dejo su traza con la version de prompt correcta.
        let runs = list_runs(&conn, &encounter_id).unwrap();
        assert_eq!(runs.len(), 3);
        assert!(runs.iter().any(|r| r.prompt_version == "summary/v1"));
        assert!(runs.iter().any(|r| r.prompt_version == "instructions/v1"));
        assert!(runs.iter().any(|r| r.prompt_version == "gaps/v1"));

        // No se guardo ninguna nota automaticamente.
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
    fn unlimited_budget_never_blocks_and_usage_aggregates() {
        let conn = test_conn("usage");
        let (encounter_id, patient_id) = seed_encounter(&conn);
        grant_consent(&conn, &patient_id, SCOPE_TEXT_ASSIST).unwrap();
        let registry = ProviderRegistry::default_local();

        assert_eq!(get_budget_cents(&conn).unwrap(), 0); // sin limite por defecto
        assist_soap(&conn, &encounter_id, &registry).unwrap();
        assist_text(&conn, &encounter_id, USAGE_SUMMARY, &registry).unwrap();

        let summary = usage_summary(&conn).unwrap();
        assert_eq!(summary.run_count, 2);
        assert_eq!(summary.budget_cents, 0);
        assert!(summary.spent_cents >= 2);
        assert_eq!(summary.by_usage.len(), 2);
    }

    #[test]
    fn budget_blocks_ai_once_month_spend_reaches_limit() {
        let conn = test_conn("budget");
        let (encounter_id, patient_id) = seed_encounter(&conn);
        grant_consent(&conn, &patient_id, SCOPE_TEXT_ASSIST).unwrap();
        let registry = ProviderRegistry::default_local();

        // Presupuesto minimo: la primera ejecucion pasa (aun no hay gasto),
        // pero deja el mes en el limite y bloquea la siguiente.
        set_budget_cents(&conn, 1).unwrap();
        assist_soap(&conn, &encounter_id, &registry).unwrap();

        assert!(matches!(
            assist_soap(&conn, &encounter_id, &registry),
            Err(AiError::BudgetExceeded)
        ));
        assert!(matches!(
            assist_text(&conn, &encounter_id, USAGE_GAPS, &registry),
            Err(AiError::BudgetExceeded)
        ));

        // Subir el presupuesto reabre la ejecucion.
        set_budget_cents(&conn, 1_000_000).unwrap();
        assist_text(&conn, &encounter_id, USAGE_GAPS, &registry).unwrap();
    }

    #[test]
    fn negative_budget_is_rejected() {
        let conn = test_conn("budget-neg");
        assert!(matches!(
            set_budget_cents(&conn, -1),
            Err(AiError::Invalid(_))
        ));
    }

    #[test]
    fn benchmark_compares_providers_and_recommends_cheapest_at_equal_quality() {
        let conn = test_conn("benchmark");
        let run = run_default_benchmark(&conn, "comparativa inicial").unwrap();

        assert_eq!(run.results.len(), 2);
        assert!(run.case_count >= 6);
        // Ambos fakes tienen igual exito y completitud; el mas barato gana.
        assert_eq!(run.recommended_provider.as_deref(), Some("openai-fake"));
        assert!(run.notes.is_some());

        let cheap = run
            .results
            .iter()
            .find(|r| r.provider == "openai-fake")
            .unwrap();
        let pricey = run
            .results
            .iter()
            .find(|r| r.provider == "medlm-fake")
            .unwrap();
        assert_eq!(cheap.success_count, run.case_count);
        assert!(pricey.total_cost_cents > cheap.total_cost_cents);
        // Completitud alta (SOAP llena las 4 secciones clave; textos no vacios).
        assert!(cheap.completeness_pct >= 90);

        // Se persistio y se relee.
        let listed = list_benchmarks(&conn).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].results.len(), 2);
        assert_eq!(
            listed[0].recommended_provider.as_deref(),
            Some("openai-fake")
        );
    }

    #[test]
    fn benchmark_requires_a_provider() {
        let conn = test_conn("benchmark-empty");
        assert!(matches!(
            run_benchmark(&conn, "vacio", &[]),
            Err(AiError::Invalid(_))
        ));
    }

    #[test]
    fn pending_usage_reports_are_references_only_and_mark_reported() {
        let conn = test_conn("usage-report");
        let (encounter_id, patient_id) = seed_encounter(&conn);
        grant_consent(&conn, &patient_id, SCOPE_TEXT_ASSIST).unwrap();
        let registry = ProviderRegistry::default_local();

        let draft = assist_soap(&conn, &encounter_id, &registry).unwrap();
        review_run(&conn, &draft.run_id, "APPROVED", None).unwrap();

        let reports = pending_usage_reports(&conn, 10).unwrap();
        assert_eq!(reports.len(), 1);
        let report = &reports[0];
        assert_eq!(report.external_run_id, draft.run_id);
        assert_eq!(report.usage_type, "SOAP_ASSIST");
        assert_eq!(report.status, "APPROVED");
        assert_eq!(report.provider_name, "fake-clinico");
        assert_eq!(report.input_reference["localRunId"], draft.run_id);
        assert_eq!(report.output_reference["localRunId"], draft.run_id);
        let serialized = serde_json::to_string(report).unwrap();
        assert!(!serialized.contains("Tos persistente"));
        assert!(!serialized.contains("Borrador IA"));

        mark_usage_reports_sent(&conn, &[draft.run_id]).unwrap();
        assert!(pending_usage_reports(&conn, 10).unwrap().is_empty());
    }

    #[test]
    fn transcription_requires_separate_voice_consent() {
        let conn = test_conn("voice-consent");
        let (encounter_id, patient_id) = seed_encounter(&conn);
        let provider = FakeTranscriptionProvider::new("fake-transcriptor");
        let audio = AudioInput {
            file_name: Some("consulta.webm".into()),
            media_type: "audio/webm".into(),
            bytes: b"audio bytes only".to_vec(),
            duration_seconds: Some(42),
        };

        grant_consent(&conn, &patient_id, SCOPE_TEXT_ASSIST).unwrap();
        assert!(matches!(
            transcribe_audio(&conn, &encounter_id, audio.clone(), &provider),
            Err(AiError::ConsentMissing)
        ));

        grant_consent(&conn, &patient_id, SCOPE_VOICE_TRANSCRIPTION).unwrap();
        let draft = transcribe_audio(&conn, &encounter_id, audio, &provider).unwrap();
        assert_eq!(draft.provider, "fake-transcriptor");
        assert_eq!(draft.usage_type, USAGE_TRANSCRIPTION);
    }

    #[test]
    fn transcription_discards_audio_and_stores_reviewable_draft() {
        let conn = test_conn("voice-draft");
        let (encounter_id, patient_id) = seed_encounter(&conn);
        grant_consent(&conn, &patient_id, SCOPE_VOICE_TRANSCRIPTION).unwrap();
        let provider = FakeTranscriptionProvider::new("fake-transcriptor");

        let draft = transcribe_audio(
            &conn,
            &encounter_id,
            AudioInput {
                file_name: Some("consulta.webm".into()),
                media_type: "audio/webm".into(),
                bytes: b"raw audio should never be stored".to_vec(),
                duration_seconds: Some(60),
            },
            &provider,
        )
        .unwrap();

        assert!(draft.transcript_text.contains("Transcripcion"));
        assert_eq!(draft.audio_retention_policy, AUDIO_RETENTION_DISCARD);

        let (input_meta, stored_output, prompt_version, status): (String, String, String, String) =
            conn.query_row(
                "SELECT input_redacted, output, prompt_version, status FROM ai_runs WHERE id = ?1",
                params![draft.run_id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();
        assert!(input_meta.contains(AUDIO_RETENTION_DISCARD));
        assert!(input_meta.contains("\"byteLength\""));
        assert!(!input_meta.contains("raw audio should never be stored"));
        assert!(stored_output.contains("Transcripcion"));
        assert_eq!(prompt_version, PROMPT_VERSION_TRANSCRIPTION);
        assert_eq!(status, "DRAFT");

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
    fn transcription_usage_report_is_reference_only_and_transcription_provider() {
        let conn = test_conn("voice-report");
        let (encounter_id, patient_id) = seed_encounter(&conn);
        grant_consent(&conn, &patient_id, SCOPE_VOICE_TRANSCRIPTION).unwrap();
        let provider = FakeTranscriptionProvider::new("fake-transcriptor");

        let draft = transcribe_audio(
            &conn,
            &encounter_id,
            AudioInput {
                file_name: Some("consulta.wav".into()),
                media_type: "audio/wav".into(),
                bytes: b"audio bytes".to_vec(),
                duration_seconds: Some(30),
            },
            &provider,
        )
        .unwrap();
        review_run(&conn, &draft.run_id, "APPROVED", None).unwrap();

        let reports = pending_usage_reports(&conn, 10).unwrap();
        assert_eq!(reports.len(), 1);
        let report = &reports[0];
        assert_eq!(report.usage_type, USAGE_TRANSCRIPTION);
        assert_eq!(report.provider_type, "TRANSCRIPTION");
        assert_eq!(report.input_reference["kind"], "LOCAL_AI_AUDIO_INPUT");
        assert_eq!(
            report.output_reference["kind"],
            "LOCAL_AI_TRANSCRIPT_OUTPUT"
        );
        let serialized = serde_json::to_string(report).unwrap();
        assert!(!serialized.contains("audio bytes"));
        assert!(!serialized.contains("Transcripcion"));
    }

    #[test]
    fn usage_report_omits_empty_optionals_instead_of_sending_null() {
        // El portal valida con Zod `.optional().strict()`: la clave puede faltar,
        // pero un `null` explicito lo rechaza ("Datos invalidos."). Un reporte con
        // costo/latencia/version de modelo vacios debe OMITIR esas claves.
        let report = AiUsageReport {
            external_run_id: "run-1".into(),
            usage_type: USAGE_TRANSCRIPTION.into(),
            status: "APPROVED".into(),
            provider_name: "whisper-local".into(),
            provider_type: "TRANSCRIPTION".into(),
            model_version: None,
            prompt_version: "v1".into(),
            estimated_cost_cents: None,
            latency_ms: None,
            occurred_at: "2026-06-16T12:00:00+00:00".into(),
            input_reference: serde_json::json!({}),
            output_reference: serde_json::json!({}),
        };
        let value = serde_json::to_value(&report).unwrap();
        let object = value.as_object().unwrap();
        assert!(!object.contains_key("modelVersion"));
        assert!(!object.contains_key("estimatedCostCents"));
        assert!(!object.contains_key("latencyMs"));
        // Sin valores `null` en ningun campo del reporte.
        assert!(object.values().all(|v| !v.is_null()));
    }
}

#[derive(Clone, Debug)]
pub struct AudioInput {
    pub file_name: Option<String>,
    pub media_type: String,
    pub bytes: Vec<u8>,
    pub duration_seconds: Option<i64>,
}

/// Metadata del audio para el proveedor de transcripcion. El proveedor Whisper
/// local no la necesita (transcribe de las muestras decodificadas); la consume el
/// fake en pruebas y, mas adelante, el proveedor en nube (rebanada 3). Acotado a
/// `allow(dead_code)` fuera de pruebas hasta entonces.
#[cfg_attr(not(test), allow(dead_code))]
pub struct TranscriptionRequest {
    pub media_type: String,
    pub byte_len: usize,
    pub duration_seconds: Option<i64>,
}

pub trait TranscriptionProvider: Send + Sync {
    fn name(&self) -> &str;
    /// Transcribe el audio. Recibe la metadata (`request`) y el audio en bruto
    /// (`audio`). El proveedor real (Whisper local) decodifica el audio en
    /// memoria; el proveedor fake lo ignora. El audio nunca se persiste.
    fn transcribe(
        &self,
        request: &TranscriptionRequest,
        audio: &AudioInput,
    ) -> Result<AiResponse, AiError>;
}
