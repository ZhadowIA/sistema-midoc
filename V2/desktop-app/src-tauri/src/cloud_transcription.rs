//! Respaldo de transcripcion en nube gobernado (paso 15, rebanada 3).
//!
//! Cuando el equipo no rinde para Whisper local (o el medico lo prefiere), la
//! transcripcion puede delegarse a un proveedor en nube (estilo Deepgram: un solo
//! POST con el audio que devuelve el texto). Es la unica via en la que el audio
//! sale del equipo, asi que esta gobernada:
//!
//! - Exige consentimiento de voz vigente (lo aplica el flujo `ai::transcribe_audio`).
//! - Solo se envian los BYTES del audio: nunca el nombre de archivo ni
//!   identificadores del paciente (seudonimizacion del envio).
//! - El audio no se persiste; la traza local guarda solo metadata (regla 4).
//! - El proveedor real se cablea solo en staging con BAA (paso 16); sin
//!   configuracion (`MIDOC_CLOUD_STT_*`) la via en nube se rechaza con una guia.
//!
//! El parser de la respuesta es puro y testeable (contrato contra respuestas
//! fake); la llamada HTTP es una frontera fina (regla 5).

use std::time::Instant;

use crate::ai::{AiError, AiResponse, AudioInput, TranscriptionProvider, TranscriptionRequest};

/// Configuracion del proveedor en nube, resuelta de variables de entorno del
/// build/instalacion. Ausente => la via en nube no esta habilitada.
#[derive(Debug, Clone)]
pub struct CloudConfig {
    pub provider: String,
    pub api_key: String,
    pub endpoint: String,
}

impl CloudConfig {
    /// Lee la configuracion del entorno. `None` si falta cualquier dato (la via en
    /// nube queda deshabilitada: se cablea en staging con BAA).
    pub fn from_env() -> Option<Self> {
        let provider = non_empty(option_env!("MIDOC_CLOUD_STT_PROVIDER"))?;
        let api_key = non_empty(option_env!("MIDOC_CLOUD_STT_API_KEY"))?;
        let endpoint = non_empty(option_env!("MIDOC_CLOUD_STT_ENDPOINT"))?;
        Some(Self {
            provider,
            api_key,
            endpoint,
        })
    }
}

fn non_empty(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|v| !v.is_empty())
        .map(str::to_string)
}

/// Extrae el texto de la transcripcion de la respuesta JSON del proveedor.
/// Modela la forma de Deepgram (`results.channels[].alternatives[].transcript`),
/// que es la forma sincrona de un solo POST. Funcion pura y testeable.
pub fn parse_transcript(body: &str) -> Result<String, String> {
    let json: serde_json::Value =
        serde_json::from_str(body).map_err(|e| format!("respuesta de la nube ilegible: {e}"))?;

    let transcript = json
        .get("results")
        .and_then(|r| r.get("channels"))
        .and_then(|c| c.as_array())
        .and_then(|channels| channels.first())
        .and_then(|ch| ch.get("alternatives"))
        .and_then(|a| a.as_array())
        .and_then(|alts| alts.first())
        .and_then(|alt| alt.get("transcript"))
        .and_then(|t| t.as_str());

    match transcript {
        Some(text) => Ok(text.trim().to_string()),
        None => Err("la respuesta de la nube no trae transcripcion".into()),
    }
}

/// Estima el costo en centavos de una transcripcion en nube por su duracion
/// (referencia ~0.26 centavos/min, estilo Deepgram). Minimo 1 centavo.
fn estimate_cost_cents(duration_seconds: Option<i64>) -> i64 {
    let seconds = duration_seconds.unwrap_or(0).max(0);
    let minutes = (seconds as f64 / 60.0).ceil() as i64;
    (minutes * 26 / 100).max(1)
}

/// Proveedor de transcripcion en nube (respaldo gobernado).
pub struct CloudTranscriptionProvider {
    name: String,
    config: CloudConfig,
}

impl CloudTranscriptionProvider {
    pub fn new(config: CloudConfig) -> Self {
        Self {
            name: format!("cloud-{}", config.provider),
            config,
        }
    }
}

impl TranscriptionProvider for CloudTranscriptionProvider {
    fn name(&self) -> &str {
        &self.name
    }

    fn transcribe(
        &self,
        request: &TranscriptionRequest,
        audio: &AudioInput,
    ) -> Result<AiResponse, AiError> {
        let start = Instant::now();

        // Frontera de red. El comando que llama a esto es sincrono (corre en un
        // hilo de trabajo de Tauri), asi que un cliente bloqueante es seguro.
        // Seudonimizacion del envio: solo van los bytes y el tipo de medio; nunca
        // el nombre de archivo ni identificadores del paciente.
        let client = reqwest::blocking::Client::new();
        let response = client
            .post(&self.config.endpoint)
            .header("Authorization", format!("Token {}", self.config.api_key))
            .header(reqwest::header::CONTENT_TYPE, request.media_type.clone())
            .body(audio.bytes.clone())
            .send()
            .map_err(|e| AiError::Invalid(format!("no se pudo contactar la nube: {e}")))?;

        if !response.status().is_success() {
            return Err(AiError::Invalid(format!(
                "el proveedor en nube respondio {}",
                response.status()
            )));
        }
        let body = response
            .text()
            .map_err(|e| AiError::Invalid(format!("respuesta de la nube ilegible: {e}")))?;
        let text = parse_transcript(&body).map_err(AiError::Invalid)?;

        Ok(AiResponse {
            output: text,
            model_version: self.name.clone(),
            estimated_cost_cents: estimate_cost_cents(request.duration_seconds),
            latency_ms: start.elapsed().as_millis() as i64,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_deepgram_style_transcript() {
        let body = r#"{
            "results": {
                "channels": [
                    { "alternatives": [ { "transcript": "  paciente con dolor abdominal  " } ] }
                ]
            }
        }"#;
        assert_eq!(
            parse_transcript(body).unwrap(),
            "paciente con dolor abdominal"
        );
    }

    #[test]
    fn rejects_missing_or_malformed_responses() {
        assert!(parse_transcript("no es json").is_err());
        assert!(parse_transcript(r#"{"results":{"channels":[]}}"#).is_err());
        assert!(parse_transcript(r#"{"error":"bad key"}"#).is_err());
    }

    #[test]
    fn cost_grows_with_duration_and_has_a_floor() {
        assert_eq!(estimate_cost_cents(None), 1, "piso de 1 centavo");
        assert_eq!(estimate_cost_cents(Some(30)), 1, "menos de un minuto: piso");
        assert!(estimate_cost_cents(Some(60 * 60)) > estimate_cost_cents(Some(60)));
    }
}
