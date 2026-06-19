//! Diarizacion local (separacion de hablantes) con sherpa-onnx.
//!
//! sherpa-onnx trabaja APARTE de Whisper: analiza la forma de onda del audio (no el
//! texto) y produce tramos de hablante con marcas de tiempo. El pegamento con la
//! transcripcion es la fusion por solape temporal en `diarization::merge_*`.
//!
//! El binding nativo (crate `sherpa-rs`, que bundlea sherpa-onnx + ONNX Runtime)
//! vive tras el feature `diarization-local`, igual que `whisper_provider` tras
//! `whisper-local`: el build por defecto y las pruebas NO necesitan la cadena
//! nativa. Cuando el feature esta apagado, `diarize_samples` devuelve vacio y el
//! flujo degrada a una transcripcion sin separacion (el medico divide los turnos a
//! mano). El binding real se compila y verifica en staging (regla 5), como el de
//! Whisper en el paso 15.
//!
//! Residencia: corre 100% en el equipo sobre muestras en memoria; no usa la red ni
//! persiste el audio.

use std::path::Path;

use crate::ai::AiError;
use crate::diarization::SpeakerSegment;

/// Separa hablantes en las muestras dadas (f32 mono al `sample_rate` indicado, por
/// convencion 16 kHz). `num_speakers` fija el numero esperado de hablantes (2 en la
/// consulta). Devuelve tramos de hablante con marcas de tiempo en centisegundos.
///
/// Variante REAL (feature `diarization-local`): corre la diarizacion offline de
/// sherpa-onnx con el modelo de segmentacion y el de embedding descargados.
#[cfg(feature = "diarization-local")]
pub fn diarize_samples(
    samples: &[f32],
    sample_rate: u32,
    segmentation_model: &Path,
    embedding_model: &Path,
    num_speakers: u8,
) -> Result<Vec<SpeakerSegment>, AiError> {
    use sherpa_rs::diarize::{Diarize, DiarizeConfig};

    let seg = segmentation_model
        .to_str()
        .ok_or_else(|| AiError::Invalid("ruta del modelo de segmentacion invalida".into()))?;
    let emb = embedding_model
        .to_str()
        .ok_or_else(|| AiError::Invalid("ruta del modelo de embedding invalida".into()))?;

    // Numero de hablantes conocido (2): fija el clustering y maximiza precision.
    let config = DiarizeConfig {
        num_clusters: Some(num_speakers as i32),
        ..Default::default()
    };

    let mut diarizer = Diarize::new(seg, emb, config)
        .map_err(|e| AiError::Invalid(format!("no se pudo iniciar la diarizacion: {e}")))?;

    // sherpa-onnx asume 16 kHz mono; si la captura cambia, hay que remuestrear antes.
    debug_assert_eq!(sample_rate, 16_000, "sherpa-onnx espera 16 kHz mono");
    let _ = sample_rate;

    let segments = diarizer
        .compute(samples.to_vec(), None)
        .map_err(|e| AiError::Invalid(format!("fallo la diarizacion: {e}")))?;

    // sherpa-rs entrega `start`/`end` en segundos (f32) y `speaker` como indice.
    Ok(segments
        .into_iter()
        .map(|s| SpeakerSegment {
            start_cs: (s.start * 100.0) as i64,
            end_cs: (s.end * 100.0) as i64,
            speaker_idx: s.speaker.max(0) as u8,
        })
        .collect())
}

/// Variante STUB (sin el feature `diarization-local`): no hay motor nativo, asi que
/// no separa hablantes y el flujo degrada a transcripcion sin diarizacion. Mantiene
/// la misma firma para que el comando compile en el build por defecto.
#[cfg(not(feature = "diarization-local"))]
pub fn diarize_samples(
    _samples: &[f32],
    _sample_rate: u32,
    _segmentation_model: &Path,
    _embedding_model: &Path,
    _num_speakers: u8,
) -> Result<Vec<SpeakerSegment>, AiError> {
    Ok(Vec::new())
}
