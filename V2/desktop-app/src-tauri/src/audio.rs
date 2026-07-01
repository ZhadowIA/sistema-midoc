//! Decodificacion de audio para transcripcion local (paso 15, rebanada 2;
//! ampliado para admitir mas formatos de importacion).
//!
//! La grabacion de consulta se captura en la app de escritorio como WAV PCM de 16
//! bits a 16 kHz, y ese camino sigue intacto. Este modulo ademas admite archivos
//! importados por el medico en otros formatos comunes de grabadora/celular (WAV a
//! cualquier tasa/bit depth, MP3, M4A/AAC), usando Symphonia (decodificacion, puro
//! Rust, sin cadena nativa) y Rubato (resampleo sinc) para entregar siempre
//! muestras f32 mono a 16 kHz, que es lo que exige Whisper. Todo ocurre en
//! memoria, SIN escribir el audio a disco (el audio es transitorio, regla de
//! residencia). No admite Opus/OGG ni FLAC (fuera de alcance).
//!
//! El decodificador solo se consume desde el proveedor Whisper (feature
//! `whisper-local`), desde la diarizacion y desde las pruebas; en el build por
//! defecto sin esos features queda inerte, de ahi el `allow(dead_code)` acotado.
#![cfg_attr(
    not(any(test, feature = "whisper-local", feature = "diarization-local")),
    allow(dead_code)
)]

use rubato::{
    Resampler, SincFixedIn, SincInterpolationParameters, SincInterpolationType, WindowFunction,
};
use symphonia::core::audio::GenericAudioBufferRef;
use symphonia::core::codecs::audio::AudioDecoderOptions;
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::probe::Hint;
use symphonia::core::formats::{FormatOptions, TrackType};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;

/// Frecuencia de muestreo que exige Whisper.
pub const WHISPER_SAMPLE_RATE: u32 = 16_000;

/// Audio decodificado y normalizado a lo que consume Whisper.
#[derive(Debug, Clone, PartialEq)]
pub struct DecodedAudio {
    /// Muestras mono en f32 (rango [-1.0, 1.0]).
    pub samples: Vec<f32>,
    pub sample_rate: u32,
}

/// Decodifica audio (WAV de cualquier tasa/bit depth, MP3 o M4A/AAC) a muestras
/// f32 mono a 16 kHz, listo para Whisper. Mezcla a mono promediando canales y
/// resamplea si el archivo no viene ya a 16 kHz. `media_type` es solo una pista
/// para el detector de formato (Symphonia tambien reconoce el contenido por sus
/// cabeceras); si no coincide con ninguno conocido, igual intenta detectar por
/// contenido.
pub fn decode_audio_to_whisper(bytes: &[u8], media_type: &str) -> Result<DecodedAudio, String> {
    let mono = decode_to_mono_f32(bytes, media_type)?;
    if mono.sample_rate == WHISPER_SAMPLE_RATE {
        return Ok(DecodedAudio {
            samples: mono.samples,
            sample_rate: WHISPER_SAMPLE_RATE,
        });
    }
    let samples = resample_mono(&mono.samples, mono.sample_rate, WHISPER_SAMPLE_RATE)?;
    Ok(DecodedAudio {
        samples,
        sample_rate: WHISPER_SAMPLE_RATE,
    })
}

struct MonoAudio {
    samples: Vec<f32>,
    sample_rate: u32,
}

/// Traduce el tipo de medio a una extension, para ayudar al detector de
/// Symphonia. No es estricto: si no reconoce el tipo, Symphonia igual intenta
/// detectar el contenedor por las cabeceras del archivo.
fn extension_hint(media_type: &str) -> Option<&'static str> {
    match media_type {
        "audio/wav" | "audio/x-wav" | "audio/wave" => Some("wav"),
        "audio/mpeg" | "audio/mp3" => Some("mp3"),
        "audio/mp4" | "audio/m4a" | "audio/x-m4a" | "audio/aac" => Some("m4a"),
        _ => None,
    }
}

fn decode_to_mono_f32(bytes: &[u8], media_type: &str) -> Result<MonoAudio, String> {
    let mut hint = Hint::new();
    if let Some(ext) = extension_hint(media_type) {
        hint.with_extension(ext);
    }

    let cursor = std::io::Cursor::new(bytes.to_vec());
    let mss = MediaSourceStream::new(Box::new(cursor), Default::default());

    let mut format = symphonia::default::get_probe()
        .probe(
            &hint,
            mss,
            FormatOptions::default(),
            MetadataOptions::default(),
        )
        .map_err(|e| format!("no se pudo reconocer el formato de audio: {e}"))?;

    let track = format
        .default_track(TrackType::Audio)
        .ok_or("el audio no tiene una pista decodificable")?;
    let track_id = track.id;
    let codec_params = track
        .codec_params
        .as_ref()
        .and_then(|params| params.audio())
        .ok_or("el audio no declara parametros de codec")?
        .clone();
    let mut decoder = symphonia::default::get_codecs()
        .make_audio_decoder(&codec_params, &AudioDecoderOptions::default())
        .map_err(|e| format!("no se pudo iniciar el decodificador de audio: {e}"))?;

    let mut samples: Vec<f32> = Vec::new();
    let mut sample_rate: Option<u32> = None;
    let mut scratch: Vec<f32> = Vec::new();

    loop {
        let packet = match format.next_packet() {
            Ok(Some(packet)) => packet,
            Ok(None) => break,
            Err(SymphoniaError::ResetRequired) => break,
            Err(e) => return Err(format!("error leyendo el audio: {e}")),
        };
        if packet.track_id != track_id {
            continue;
        }
        let decoded = match decoder.decode(&packet) {
            Ok(decoded) => decoded,
            // Paquetes corruptos o invalidos: se saltan en vez de abortar todo el
            // archivo (degradacion elegante, mismo criterio que el resto del audio
            // transitorio).
            Err(SymphoniaError::DecodeError(_)) => continue,
            Err(e) => return Err(format!("error decodificando el audio: {e}")),
        };
        sample_rate.get_or_insert(decoded.spec().rate());
        append_downmixed(&decoded, &mut scratch, &mut samples);
    }

    let sample_rate = sample_rate.ok_or("el audio no contiene muestras")?;
    if samples.is_empty() {
        return Err("el audio no contiene muestras".into());
    }
    Ok(MonoAudio {
        samples,
        sample_rate,
    })
}

/// Convierte un buffer decodificado a f32 entrelazado (via el scratch buffer) y
/// mezcla a mono promediando canales (mismo criterio que el WAV PCM16 original).
fn append_downmixed(
    decoded: &GenericAudioBufferRef<'_>,
    scratch: &mut Vec<f32>,
    out: &mut Vec<f32>,
) {
    let channels = decoded.spec().channels().count().max(1);
    decoded.copy_to_vec_interleaved(scratch);
    for frame in scratch.chunks_exact(channels) {
        out.push(frame.iter().sum::<f32>() / channels as f32);
    }
}

/// Resamplea muestras mono con un filtro sinc (Rubato). Todo el audio ya esta en
/// memoria de antemano (no es un pipeline en vivo), asi que se procesa en una
/// sola pasada con `chunk_size` igual al largo del audio.
fn resample_mono(input: &[f32], from_rate: u32, to_rate: u32) -> Result<Vec<f32>, String> {
    if input.is_empty() || from_rate == to_rate {
        return Ok(input.to_vec());
    }

    let params = SincInterpolationParameters {
        sinc_len: 256,
        f_cutoff: 0.95,
        interpolation: SincInterpolationType::Linear,
        oversampling_factor: 256,
        window: WindowFunction::BlackmanHarris2,
    };
    let ratio = to_rate as f64 / from_rate as f64;
    let mut resampler = SincFixedIn::<f32>::new(ratio, 1.0, params, input.len(), 1)
        .map_err(|e| format!("no se pudo inicializar el resampleo: {e}"))?;

    let waves_in = [input.to_vec()];
    let waves_out = resampler
        .process(&waves_in, None)
        .map_err(|e| format!("fallo el resampleo de audio: {e}"))?;
    Ok(waves_out.into_iter().next().unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Construye un WAV PCM de prueba. `bits` admite 16/24/32 (entero,
    /// `format_tag = 1`) o 32 con `float = true` (IEEE float, `format_tag = 3`).
    fn wav(channels: u16, sample_rate: u32, bits: u16, float: bool, samples: &[u8]) -> Vec<u8> {
        let format_tag: u16 = if float { 3 } else { 1 };
        let mut out = Vec::new();
        let data_len = samples.len() as u32;
        let byte_rate = sample_rate * channels as u32 * (bits as u32 / 8);
        let block_align = channels * (bits / 8);
        out.extend_from_slice(b"RIFF");
        out.extend_from_slice(&(36 + data_len).to_le_bytes());
        out.extend_from_slice(b"WAVE");
        out.extend_from_slice(b"fmt ");
        out.extend_from_slice(&16u32.to_le_bytes());
        out.extend_from_slice(&format_tag.to_le_bytes());
        out.extend_from_slice(&channels.to_le_bytes());
        out.extend_from_slice(&sample_rate.to_le_bytes());
        out.extend_from_slice(&byte_rate.to_le_bytes());
        out.extend_from_slice(&block_align.to_le_bytes());
        out.extend_from_slice(&bits.to_le_bytes());
        out.extend_from_slice(b"data");
        out.extend_from_slice(&data_len.to_le_bytes());
        out.extend_from_slice(samples);
        out
    }

    fn pcm16_samples(values: &[i16]) -> Vec<u8> {
        values.iter().flat_map(|v| v.to_le_bytes()).collect()
    }

    #[test]
    fn decodes_mono_16k_pcm16_wav_without_resampling() {
        let pcm = pcm16_samples(&[-32_768, 16_384, 0, -16_384]);
        let bytes = wav(1, 16_000, 16, false, &pcm);
        let decoded = decode_audio_to_whisper(&bytes, "audio/wav").unwrap();
        assert_eq!(decoded.sample_rate, 16_000);
        assert_eq!(decoded.samples.len(), 4);
        assert!((decoded.samples[0] - (-1.0)).abs() < 1e-3);
        assert!((decoded.samples[1] - 0.5).abs() < 1e-3);
    }

    #[test]
    fn downmixes_stereo_to_mono() {
        // Un frame estereo: canal L = +1/2, canal R = -1/2 -> promedio ~0.
        let pcm = pcm16_samples(&[16_384, -16_384]);
        let bytes = wav(2, 16_000, 16, false, &pcm);
        let decoded = decode_audio_to_whisper(&bytes, "audio/wav").unwrap();
        assert_eq!(
            decoded.samples.len(),
            1,
            "un frame estereo -> una muestra mono"
        );
        assert!(
            decoded.samples[0].abs() < 1e-2,
            "L y R opuestos promedian ~0"
        );
    }

    #[test]
    fn resamples_44100_hz_wav_to_16k() {
        // Medio segundo de silencio a 44.1 kHz: debe quedar en ~16k muestras
        // (medio segundo a 16 kHz), dentro de un margen razonable del filtro sinc.
        let sample_count = 22_050usize;
        let pcm = pcm16_samples(&vec![0i16; sample_count]);
        let bytes = wav(1, 44_100, 16, false, &pcm);
        let decoded = decode_audio_to_whisper(&bytes, "audio/wav").unwrap();
        assert_eq!(decoded.sample_rate, 16_000);
        let expected = 8_000usize;
        let diff = decoded.samples.len().abs_diff(expected);
        assert!(
            diff < 200,
            "largo reasampleado fuera de rango: {}",
            decoded.samples.len()
        );
    }

    #[test]
    fn decodes_24_bit_and_float_wav() {
        // 24-bit PCM: una muestra a maximo positivo (0x7FFFFF).
        let pcm24 = vec![0xFF, 0xFF, 0x7F];
        let bytes24 = wav(1, 16_000, 24, false, &pcm24);
        let decoded24 = decode_audio_to_whisper(&bytes24, "audio/wav").unwrap();
        assert_eq!(decoded24.samples.len(), 1);
        assert!((decoded24.samples[0] - 1.0).abs() < 1e-3);

        // 32-bit IEEE float: una muestra a 0.5.
        let pcm_float = 0.5f32.to_le_bytes().to_vec();
        let bytes_float = wav(1, 16_000, 32, true, &pcm_float);
        let decoded_float = decode_audio_to_whisper(&bytes_float, "audio/wav").unwrap();
        assert_eq!(decoded_float.samples.len(), 1);
        assert!((decoded_float.samples[0] - 0.5).abs() < 1e-3);
    }

    #[test]
    fn rejects_audio_that_cannot_be_recognized() {
        let err = decode_audio_to_whisper(b"no soy un audio en absoluto-----------", "audio/wav");
        assert!(err.is_err());
    }

    #[test]
    fn rejects_empty_audio() {
        assert!(decode_audio_to_whisper(&[], "audio/wav").is_err());
    }

    /// Ejercita el camino real de MP3/M4A contra un archivo provisto por el
    /// medico/desarrollador. Ignorado por defecto: Symphonia ya tiene su propia
    /// suite de pruebas para el bitstream; aqui solo verificamos el cableado
    /// completo (deteccion + decode + downmix + resampleo) con un archivo real.
    /// Se corre con `MIDOC_TEST_AUDIO_FILE=<ruta>` y
    /// `MIDOC_TEST_AUDIO_MEDIA_TYPE=audio/mpeg` (o `audio/mp4`).
    #[test]
    #[ignore = "requiere un archivo de audio real via MIDOC_TEST_AUDIO_FILE"]
    fn decodes_real_compressed_audio_file() {
        let Ok(path) = std::env::var("MIDOC_TEST_AUDIO_FILE") else {
            return;
        };
        let media_type =
            std::env::var("MIDOC_TEST_AUDIO_MEDIA_TYPE").unwrap_or_else(|_| "audio/mpeg".into());
        let bytes = std::fs::read(path).expect("no se pudo leer el archivo de prueba");
        let decoded = decode_audio_to_whisper(&bytes, &media_type)
            .expect("el archivo de audio real debe decodificar sin error");
        assert_eq!(decoded.sample_rate, 16_000);
        assert!(!decoded.samples.is_empty());
    }
}
