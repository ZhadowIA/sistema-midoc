//! Respaldo de transcripcion en nube gobernado por el portal MiDoc (Ruta B, F3).
//!
//! Cuando el equipo no rinde para Whisper local (o el medico lo prefiere), la
//! transcripcion se delega al portal, que media con el proveedor real (OpenAI),
//! cobra por duracion autoritativa y devuelve el texto. Es la unica via en la que
//! el audio sale del equipo, asi que esta gobernada:
//!
//! - Exige consentimiento de voz vigente (lo aplica el flujo `ai::transcribe_audio`).
//! - El desktop NO conoce la clave del proveedor: envia el audio al endpoint
//!   autenticado del portal con el token del dispositivo vinculado.
//! - Solo se envian los campos aprobados (bytes con nombre neutro, `runId`, modo):
//!   nunca el nombre original ni identificadores del paciente.
//! - El audio no se persiste; la traza local guarda solo metadata (regla 4).
//! - El proveedor real se activa en staging con BAA/ZDR (paso 16).
//!
//! El parser de la respuesta es puro y testeable; la llamada HTTP es una frontera
//! fina (regla 5).

use std::time::Instant;

use crate::ai::{AiError, AiResponse, AudioInput, TranscriptionProvider, TranscriptionRequest};

/// Un turno de hablante devuelto por el portal en modo diarizado. La etiqueta es
/// anonima (`speaker_0`); el rol lo confirma el medico localmente. `Serialize`
/// permite reserializar los turnos crudos al borrador local (`segments_json`).
#[derive(Debug, Clone, serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortalSegment {
    pub speaker: String,
    pub start_seconds: f64,
    pub end_seconds: f64,
    pub text: String,
}

/// Respuesta del endpoint gobernado del portal (`POST /api/sync/ai/transcriptions`).
/// El credito y la duracion son autoritativos (los fija el portal desde el WAV
/// validado). En modo estandar `segments` es `None`.
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PortalTranscriptionResult {
    pub transcript_text: String,
    #[serde(default)]
    pub segments: Option<Vec<PortalSegment>>,
    pub duration_seconds: i64,
    pub credit_cost: i64,
    pub model_version: String,
}

/// Parsea la respuesta JSON del portal. Funcion pura y testeable contra la forma
/// que produce el servicio de F2 (`transcriptText`/`segments`/`creditCost`/…).
pub fn parse_portal_response(body: &str) -> Result<PortalTranscriptionResult, String> {
    let mut result: PortalTranscriptionResult =
        serde_json::from_str(body).map_err(|e| format!("respuesta del portal ilegible: {e}"))?;
    result.transcript_text = result.transcript_text.trim().to_string();
    Ok(result)
}

/// Nombre neutro del archivo enviado al portal: nunca el nombre original ni
/// identificadores del paciente (seudonimizacion del envio).
const NEUTRAL_FILENAME: &str = "consultation.wav";

/// Proveedor de transcripcion en nube gobernado por el portal MiDoc (Ruta B, F3).
///
/// A diferencia del adaptador directo estilo Deepgram, el desktop NO conoce la
/// clave del proveedor: envia el audio al endpoint autenticado del portal
/// (`POST /api/sync/ai/transcriptions`) con el token del dispositivo vinculado.
/// El portal media con OpenAI, cobra por duracion autoritativa y devuelve el
/// texto (y segmentos en modo diarizado) sin persistir contenido clinico.
pub struct PortalTranscriptionProvider {
    server_url: String,
    device_token: String,
    run_id: String,
    mode: String,
    /// Proveedor real elegido por el medico (`openai` | `deepgram`). El desktop
    /// solo transmite la eleccion; el portal la valida y media con la clave.
    provider: String,
    name: String,
}

impl PortalTranscriptionProvider {
    /// Construye el proveedor. Exige portal y dispositivo vinculados: sin
    /// `server_url` o `device_token` la via en nube no existe.
    pub fn new(
        server_url: impl Into<String>,
        device_token: impl Into<String>,
        run_id: impl Into<String>,
        mode: impl Into<String>,
        provider: impl Into<String>,
    ) -> Result<Self, AiError> {
        let server_url = server_url.into();
        let device_token = device_token.into();
        if server_url.trim().is_empty() || device_token.trim().is_empty() {
            return Err(AiError::Invalid(
                "El respaldo en nube requiere un portal y un dispositivo vinculados.".into(),
            ));
        }
        let mode = mode.into();
        let provider = provider.into();
        Ok(Self {
            name: format!("portal-{provider}-{mode}"),
            server_url: server_url.trim_end_matches('/').to_string(),
            device_token,
            run_id: run_id.into(),
            mode,
            provider,
        })
    }

    fn endpoint(&self) -> String {
        format!("{}/api/sync/ai/transcriptions", self.server_url)
    }
}

impl TranscriptionProvider for PortalTranscriptionProvider {
    fn name(&self) -> &str {
        &self.name
    }

    fn transcribe(
        &self,
        _request: &TranscriptionRequest,
        audio: &AudioInput,
    ) -> Result<AiResponse, AiError> {
        let start = Instant::now();

        // Solo los campos aprobados: bytes del audio (nombre neutro), runId y modo.
        // Nunca el nombre original ni identificadores del paciente.
        let part = reqwest::blocking::multipart::Part::bytes(audio.bytes.clone())
            .file_name(NEUTRAL_FILENAME)
            .mime_str("audio/wav")
            .map_err(|e| AiError::Invalid(format!("audio invalido: {e}")))?;
        let form = reqwest::blocking::multipart::Form::new()
            .text("runId", self.run_id.clone())
            .text("mode", self.mode.clone())
            .text("provider", self.provider.clone())
            .part("audio", part);

        // Frontera de red sincrona (corre en un hilo de trabajo de Tauri).
        let client = reqwest::blocking::Client::new();
        let response = client
            .post(self.endpoint())
            .bearer_auth(&self.device_token)
            .multipart(form)
            .send()
            .map_err(|e| AiError::Invalid(format!("no se pudo contactar el portal: {e}")))?;

        if !response.status().is_success() {
            return Err(AiError::Invalid(format!(
                "el portal respondio {}",
                response.status()
            )));
        }
        let body = response
            .text()
            .map_err(|e| AiError::Invalid(format!("respuesta del portal ilegible: {e}")))?;
        let parsed = parse_portal_response(&body).map_err(AiError::Invalid)?;

        // Los turnos crudos (diarizado) se reserializan para el borrador local;
        // en modo estandar no hay segmentos.
        let segments_json = match &parsed.segments {
            Some(segments) => Some(
                serde_json::to_string(segments)
                    .map_err(|e| AiError::Invalid(format!("segmentos ilegibles: {e}")))?,
            ),
            None => None,
        };

        // El credito y la duracion son autoritativos del portal; el borrador local
        // los persiste (nunca vuelven a subir). El costo estimado en centavos es 0.
        Ok(AiResponse {
            output: parsed.transcript_text,
            model_version: parsed.model_version,
            estimated_cost_cents: 0,
            latency_ms: start.elapsed().as_millis() as i64,
            cloud_transcription: Some(crate::ai::CloudTranscriptionMeta {
                run_id: self.run_id.clone(),
                mode: self.mode.clone(),
                duration_seconds: parsed.duration_seconds,
                credit_cost: parsed.credit_cost,
                segments_json,
            }),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_portal_standard_response() {
        // Forma que devuelve el endpoint del portal (F2): metadata de cobro
        // autoritativa + el texto. En modo estandar `segments` es null.
        let body = r#"{
            "runId": "run-1",
            "provider": "openai",
            "modelVersion": "gpt-4o-mini-transcribe",
            "mode": "standard",
            "transcriptText": "  paciente con dolor  ",
            "segments": null,
            "durationSeconds": 900,
            "latencyMs": 1234,
            "estimatedCostCents": 0,
            "creditCost": 1
        }"#;
        let result = parse_portal_response(body).unwrap();
        assert_eq!(result.transcript_text, "paciente con dolor");
        assert_eq!(result.credit_cost, 1);
        assert_eq!(result.duration_seconds, 900);
        assert_eq!(result.model_version, "gpt-4o-mini-transcribe");
        assert!(result.segments.is_none());
    }

    #[test]
    fn parses_portal_diarized_segments() {
        let body = r#"{
            "runId": "run-2",
            "provider": "openai",
            "modelVersion": "gpt-4o-transcribe-diarize",
            "mode": "diarized",
            "transcriptText": "dialogo",
            "segments": [
                { "speaker": "speaker_0", "startSeconds": 0, "endSeconds": 1.5, "text": "hola" },
                { "speaker": "speaker_1", "startSeconds": 1.5, "endSeconds": 3, "text": "buenas" }
            ],
            "durationSeconds": 600,
            "latencyMs": 10,
            "estimatedCostCents": 0,
            "creditCost": 1
        }"#;
        let result = parse_portal_response(body).unwrap();
        let segments = result.segments.expect("hay segmentos en modo diarizado");
        assert_eq!(segments.len(), 2);
        assert_eq!(segments[0].speaker, "speaker_0");
        assert_eq!(segments[0].end_seconds, 1.5);
        assert_eq!(segments[1].text, "buenas");
    }

    #[test]
    fn rejects_malformed_portal_response() {
        assert!(parse_portal_response("no es json").is_err());
        // Faltan campos obligatorios (creditCost, durationSeconds, transcriptText).
        assert!(parse_portal_response(r#"{"runId":"x"}"#).is_err());
    }

    #[test]
    fn portal_provider_requires_linked_server_and_token() {
        // La via en nube solo existe con portal y dispositivo vinculados.
        assert!(PortalTranscriptionProvider::new("", "tok", "run-1", "standard", "openai").is_err());
        assert!(
            PortalTranscriptionProvider::new("https://midoc.test", "", "run-1", "standard", "openai")
                .is_err()
        );
        assert!(
            PortalTranscriptionProvider::new("https://midoc.test", "tok", "run-1", "standard", "openai")
                .is_ok()
        );
    }

    #[test]
    fn portal_provider_builds_endpoint_and_name() {
        let provider = PortalTranscriptionProvider::new(
            "https://midoc.test/",
            "tok",
            "run-1",
            "diarized",
            "deepgram",
        )
        .unwrap();
        // Normaliza la barra final y apunta al endpoint gobernado de F2.
        assert_eq!(
            provider.endpoint(),
            "https://midoc.test/api/sync/ai/transcriptions"
        );
        // El nombre local identifica proveedor y modo para la traza (regla 4:
        // metadata operativa, nunca contenido clinico).
        assert_eq!(provider.name(), "portal-deepgram-diarized");
    }
}
