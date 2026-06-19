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
use crate::diarization::WhisperSegment;

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
        request: &TranscriptionRequest,
        audio: &AudioInput,
    ) -> Result<AiResponse, AiError> {
        // Reutiliza la version detallada y descarta los segmentos: el texto unido
        // es lo unico que necesita la transcripcion simple.
        Ok(self.transcribe_detailed(request, audio)?.0)
    }

    fn transcribe_detailed(
        &self,
        _request: &TranscriptionRequest,
        audio: &AudioInput,
    ) -> Result<(AiResponse, Vec<WhisperSegment>), AiError> {
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

        let n = state.full_n_segments();
        let mut text = String::new();
        let mut segments: Vec<WhisperSegment> = Vec::new();
        for i in 0..n {
            if let Some(segment) = state.get_segment(i) {
                let piece = segment
                    .to_str()
                    .map_err(|e| AiError::Invalid(format!("no se pudo leer un segmento: {e}")))?;
                text.push_str(piece);
                // whisper.cpp entrega las marcas de tiempo en centisegundos, la
                // misma unidad que consume la fusion con la diarizacion.
                segments.push(WhisperSegment {
                    start_cs: segment.start_timestamp(),
                    end_cs: segment.end_timestamp(),
                    text: piece.trim().to_string(),
                });
            }
        }

        let response = AiResponse {
            output: text.trim().to_string(),
            model_version: self.name.clone(),
            // La transcripcion local no tiene costo por uso (corre en el equipo).
            estimated_cost_cents: 0,
            latency_ms: start.elapsed().as_millis() as i64,
        };
        Ok((response, segments))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// WAV PCM16 mono 16 kHz de silencio, para ejercitar el pipeline real sin
    /// depender de un audio con voz.
    fn silent_wav_16k(seconds: usize) -> Vec<u8> {
        let sample_count = 16_000 * seconds;
        let data_len = (sample_count * 2) as u32;
        let mut out = Vec::new();
        out.extend_from_slice(b"RIFF");
        out.extend_from_slice(&(36 + data_len).to_le_bytes());
        out.extend_from_slice(b"WAVE");
        out.extend_from_slice(b"fmt ");
        out.extend_from_slice(&16u32.to_le_bytes());
        out.extend_from_slice(&1u16.to_le_bytes());
        out.extend_from_slice(&1u16.to_le_bytes());
        out.extend_from_slice(&16_000u32.to_le_bytes());
        out.extend_from_slice(&32_000u32.to_le_bytes());
        out.extend_from_slice(&2u16.to_le_bytes());
        out.extend_from_slice(&16u16.to_le_bytes());
        out.extend_from_slice(b"data");
        out.extend_from_slice(&data_len.to_le_bytes());
        out.extend(std::iter::repeat(0u8).take((sample_count * 2) as usize));
        out
    }

    /// Ejercita el pipeline real (cargar modelo + decodificar + transcribir) con
    /// un modelo GGML local. Ignorado por defecto: requiere descargar el modelo y
    /// la cadena nativa; se corre con `MIDOC_TEST_WHISPER_MODEL=<ruta>` y
    /// `cargo test --features whisper-local -- --ignored`.
    #[test]
    #[ignore = "requiere un modelo GGML local en MIDOC_TEST_WHISPER_MODEL"]
    fn transcribes_real_audio_without_error() {
        let Ok(model) = std::env::var("MIDOC_TEST_WHISPER_MODEL") else {
            return;
        };
        let provider = WhisperLocalProvider::new("tiny", PathBuf::from(model));
        let bytes = silent_wav_16k(1);
        let audio = AudioInput {
            file_name: Some("silencio.wav".into()),
            media_type: "audio/wav".into(),
            bytes,
            duration_seconds: Some(1),
        };
        let request = TranscriptionRequest {
            media_type: "audio/wav".into(),
            byte_len: audio.bytes.len(),
            duration_seconds: Some(1),
        };
        let response = provider
            .transcribe(&request, &audio)
            .expect("la transcripcion local debe completar sin error");
        // El silencio puede dar texto vacio o un marcador; basta con que el
        // pipeline corra y devuelva una respuesta bien formada.
        assert_eq!(response.estimated_cost_cents, 0);
        assert!(response.model_version.starts_with("whisper-local-"));
    }
}
