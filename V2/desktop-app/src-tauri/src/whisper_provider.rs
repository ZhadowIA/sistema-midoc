//! Proveedor de transcripcion Whisper local real (paso 15, rebanada 2).
//!
//! Implementa el trait `TranscriptionProvider` corriendo whisper.cpp EN EL
//! DISPOSITIVO con los pesos descargados (rebanada 1). El audio se decodifica a
//! muestras en memoria y se transcribe sin red ni persistencia (residencia
//! local-first; el audio es transitorio).
//!
//! whisper.cpp se compila via `whisper-rs`, que requiere una cadena de
//! construccion nativa (CMake + LLVM/libclang). Por eso el binding vive tras el
//! feature `whisper-local`: el build por defecto y las pruebas no necesitan esa
//! cadena, y el provider real se compila y valida en staging con la cadena
//! instalada (mismo patron que el paso 16 para proveedores reales).

#![cfg(feature = "whisper-local")]

use std::path::PathBuf;
use std::time::Instant;

use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

use crate::ai::{AiError, AiResponse, AudioInput, TranscriptionProvider, TranscriptionRequest};
use crate::audio;

/// Transcriptor local respaldado por whisper.cpp con un modelo GGML en disco.
pub struct WhisperLocalProvider {
    name: String,
    model_path: PathBuf,
}

impl WhisperLocalProvider {
    pub fn new(model_id: &str, model_path: PathBuf) -> Self {
        Self {
            name: format!("whisper-local-{model_id}"),
            model_path,
        }
    }
}

impl TranscriptionProvider for WhisperLocalProvider {
    fn name(&self) -> &str {
        &self.name
    }

    fn transcribe(
        &self,
        _request: &TranscriptionRequest,
        audio: &AudioInput,
    ) -> Result<AiResponse, AiError> {
        let start = Instant::now();

        // Decodifica el WAV a muestras mono f32 a 16 kHz en memoria (sin tocar disco).
        let decoded =
            audio::decode_wav_pcm16_to_whisper(&audio.bytes).map_err(AiError::Invalid)?;

        let model_path = self
            .model_path
            .to_str()
            .ok_or_else(|| AiError::Invalid("ruta del modelo invalida".into()))?;
        let ctx = WhisperContext::new_with_params(model_path, WhisperContextParameters::default())
            .map_err(|e| AiError::Invalid(format!("no se pudo cargar el modelo: {e}")))?;
        let mut state = ctx
            .create_state()
            .map_err(|e| AiError::Invalid(format!("no se pudo iniciar la transcripcion: {e}")))?;

        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_language(Some("es"));
        params.set_translate(false);
        params.set_print_progress(false);
        params.set_print_special(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);

        state
            .full(params, &decoded.samples)
            .map_err(|e| AiError::Invalid(format!("fallo la transcripcion: {e}")))?;

        let segments = state
            .full_n_segments()
            .map_err(|e| AiError::Invalid(format!("no se pudo leer el resultado: {e}")))?;
        let mut text = String::new();
        for i in 0..segments {
            let segment = state
                .full_get_segment_text(i)
                .map_err(|e| AiError::Invalid(format!("no se pudo leer un segmento: {e}")))?;
            text.push_str(&segment);
        }

        Ok(AiResponse {
            output: text.trim().to_string(),
            model_version: self.name.clone(),
            // La transcripcion local no tiene costo por uso (corre en el equipo).
            estimated_cost_cents: 0,
            latency_ms: start.elapsed().as_millis() as i64,
        })
    }
}
