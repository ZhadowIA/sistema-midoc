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

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Instant;

use whisper_rs::{
    FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters, WhisperVadParams,
};

use crate::ai::{AiError, AiResponse, AudioInput, TranscriptionProvider, TranscriptionRequest};
use crate::audio;
use crate::diarization::WhisperSegment;

struct ModelCache<T> {
    entries: Mutex<HashMap<PathBuf, Arc<T>>>,
}

impl<T> Default for ModelCache<T> {
    fn default() -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
        }
    }
}

impl<T> ModelCache<T> {
    fn get_or_try_insert_with<E>(
        &self,
        path: &Path,
        load: impl FnOnce() -> Result<T, E>,
    ) -> Result<Arc<T>, E> {
        let mut entries = self
            .entries
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(cached) = entries.get(path) {
            return Ok(Arc::clone(cached));
        }

        let loaded = Arc::new(load()?);
        entries.insert(path.to_path_buf(), Arc::clone(&loaded));
        Ok(loaded)
    }
}

static CONTEXT_CACHE: OnceLock<ModelCache<WhisperContext>> = OnceLock::new();

fn recommended_thread_count(physical_cores: Option<usize>, logical_cores: usize) -> i32 {
    let physical = physical_cores.filter(|cores| *cores > 0);
    physical
        .unwrap_or_else(|| (logical_cores / 2).max(1))
        .min(i32::MAX as usize) as i32
}

fn detected_thread_count() -> i32 {
    let system = sysinfo::System::new();
    let logical = std::thread::available_parallelism()
        .map(|cores| cores.get())
        .unwrap_or(1);
    recommended_thread_count(system.physical_core_count(), logical)
}

/// Parametros de VAD para consulta clinica. Parte de los valores por defecto de
/// whisper.cpp (umbral 0.5, voz minima 250 ms, padding 30 ms) y solo eleva el
/// silencio minimo a 200 ms: en una consulta hay pausas naturales al pensar o
/// escribir, y un silencio demasiado corto cortaria frases. Conservador para no
/// perder habla clinica.
fn default_vad_params() -> WhisperVadParams {
    let mut params = WhisperVadParams::new();
    params.set_min_silence_duration(200);
    params
}

fn cached_context(model_path: &Path) -> Result<Arc<WhisperContext>, AiError> {
    CONTEXT_CACHE
        .get_or_init(ModelCache::default)
        .get_or_try_insert_with(model_path, || {
            WhisperContext::new_with_params(model_path, WhisperContextParameters::default())
                .map_err(|error| AiError::Invalid(format!("no se pudo cargar el modelo: {error}")))
        })
}

/// Transcriptor local respaldado por whisper.cpp con un modelo GGML en disco.
pub struct WhisperLocalProvider {
    name: String,
    model_path: PathBuf,
    /// Ruta del modelo VAD (deteccion de voz) Silero, si esta descargado. Cuando
    /// esta presente, whisper.cpp salta los silencios antes de transcribir, lo que
    /// recorta el audio que procesa la CPU (clave en equipos sin GPU). Opcional:
    /// sin el, la transcripcion procesa todo el audio (degradacion elegante).
    vad_model_path: Option<PathBuf>,
}

impl WhisperLocalProvider {
    pub fn new(model_id: &str, model_path: PathBuf, vad_model_path: Option<PathBuf>) -> Self {
        Self {
            name: format!("whisper-local-{model_id}"),
            model_path,
            vad_model_path,
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

        // Decodifica el audio (WAV de cualquier tasa/bit depth, MP3 o M4A/AAC) a
        // muestras mono f32 a 16 kHz en memoria (sin tocar disco).
        let decoded = audio::decode_audio_to_whisper(&audio.bytes, &audio.media_type)
            .map_err(AiError::Invalid)?;

        // El contexto contiene los pesos (cientos de MB o varios GB). Se conserva
        // por ruta durante la vida del proceso para no releer el modelo ni volver
        // a subirlo a la GPU en cada consulta.
        let ctx = cached_context(&self.model_path)?;
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
        params.set_n_threads(detected_thread_count());

        // VAD opcional: si el modelo Silero esta descargado, whisper.cpp salta los
        // silencios antes de transcribir y procesa solo los tramos con voz. En una
        // consulta con pausas esto recorta una parte grande del audio y, por tanto,
        // del tiempo de CPU, sin costo de precision. Si la ruta no es UTF-8 valida,
        // se omite el VAD (degradacion elegante) en vez de fallar la transcripcion.
        if let Some(vad_path) = self.vad_model_path.as_deref().and_then(Path::to_str) {
            params.set_vad_model_path(Some(vad_path));
            params.set_vad_params(default_vad_params());
            params.enable_vad(true);
        }

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
            cloud_transcription: None,
        };
        Ok((response, segments))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[test]
    fn thread_count_prefers_physical_cores_and_has_a_safe_fallback() {
        assert_eq!(recommended_thread_count(Some(6), 12), 6);
        assert_eq!(recommended_thread_count(None, 12), 6);
        assert_eq!(recommended_thread_count(None, 1), 1);
        assert_eq!(recommended_thread_count(Some(0), 8), 4);
    }

    #[test]
    fn model_cache_loads_each_path_only_once() {
        let cache = ModelCache::<String>::default();
        let loads = AtomicUsize::new(0);
        let path = PathBuf::from("C:/models/ggml-medium.bin");

        let first = cache
            .get_or_try_insert_with(&path, || {
                loads.fetch_add(1, Ordering::SeqCst);
                Ok::<_, String>("contexto".to_string())
            })
            .unwrap();
        let second = cache
            .get_or_try_insert_with(&path, || {
                loads.fetch_add(1, Ordering::SeqCst);
                Ok::<_, String>("otro".to_string())
            })
            .unwrap();

        assert_eq!(loads.load(Ordering::SeqCst), 1);
        assert!(std::sync::Arc::ptr_eq(&first, &second));
    }

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
        // VAD opcional via MIDOC_TEST_WHISPER_VAD_MODEL (si no, transcribe sin VAD).
        let vad = std::env::var("MIDOC_TEST_WHISPER_VAD_MODEL")
            .ok()
            .map(PathBuf::from);
        let provider = WhisperLocalProvider::new("tiny", PathBuf::from(model), vad);
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
