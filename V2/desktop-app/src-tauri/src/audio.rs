//! Decodificacion de audio para transcripcion local (paso 15, rebanada 2).
//!
//! La grabacion de consulta se captura en la app de escritorio como WAV PCM de 16
//! bits. Whisper necesita muestras f32 mono a 16 kHz; este modulo convierte el WAV
//! a ese formato en memoria, SIN escribir el audio a disco (el audio es
//! transitorio, regla de residencia). Es logica pura y testeable: no toca la red,
//! la base cifrada ni el modelo.
//!
//! El decodificador solo se consume desde el proveedor Whisper (feature
//! `whisper-local`) y desde las pruebas; en el build por defecto sin ese feature
//! queda inerte, de ahi el `allow(dead_code)` acotado.
#![cfg_attr(not(any(test, feature = "whisper-local")), allow(dead_code))]

/// Frecuencia de muestreo que exige Whisper.
pub const WHISPER_SAMPLE_RATE: u32 = 16_000;

/// Audio decodificado y normalizado a lo que consume Whisper.
#[derive(Debug, Clone, PartialEq)]
pub struct DecodedAudio {
    /// Muestras mono en f32 (rango [-1.0, 1.0]).
    pub samples: Vec<f32>,
    pub sample_rate: u32,
}

fn read_u16_le(bytes: &[u8], at: usize) -> Option<u16> {
    bytes.get(at..at + 2).map(|b| u16::from_le_bytes([b[0], b[1]]))
}

fn read_u32_le(bytes: &[u8], at: usize) -> Option<u32> {
    bytes
        .get(at..at + 4)
        .map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]))
}

/// Decodifica un WAV PCM de 16 bits a muestras f32 mono a 16 kHz, listo para
/// Whisper. Hace mezcla a mono promediando canales; exige 16 kHz (el resampleo
/// queda fuera de alcance: la app captura ya a 16 kHz). Devuelve un error legible
/// si el formato no es el esperado.
pub fn decode_wav_pcm16_to_whisper(bytes: &[u8]) -> Result<DecodedAudio, String> {
    if bytes.len() < 44 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return Err("el audio no es un WAV valido".into());
    }

    // Recorre los chunks buscando `fmt ` y `data`.
    let mut channels: u16 = 0;
    let mut sample_rate: u32 = 0;
    let mut bits_per_sample: u16 = 0;
    let mut format_tag: u16 = 0;
    let mut data: Option<&[u8]> = None;

    let mut offset = 12;
    while offset + 8 <= bytes.len() {
        let chunk_id = &bytes[offset..offset + 4];
        let chunk_size = read_u32_le(bytes, offset + 4).ok_or("WAV truncado")? as usize;
        let body_start = offset + 8;
        let body_end = body_start
            .checked_add(chunk_size)
            .filter(|end| *end <= bytes.len())
            .ok_or("chunk WAV fuera de rango")?;
        let body = &bytes[body_start..body_end];

        if chunk_id == b"fmt " {
            format_tag = read_u16_le(body, 0).ok_or("fmt WAV invalido")?;
            channels = read_u16_le(body, 2).ok_or("fmt WAV invalido")?;
            sample_rate = read_u32_le(body, 4).ok_or("fmt WAV invalido")?;
            bits_per_sample = read_u16_le(body, 14).ok_or("fmt WAV invalido")?;
        } else if chunk_id == b"data" {
            data = Some(body);
        }

        // Los chunks se alinean a tamano par.
        offset = body_end + (chunk_size & 1);
    }

    // 1 = PCM entero; 0xFFFE = WAVE_FORMAT_EXTENSIBLE (lo aceptamos si es PCM16).
    if format_tag != 1 && format_tag != 0xFFFE {
        return Err("el WAV no es PCM de 16 bits".into());
    }
    if bits_per_sample != 16 {
        return Err("el WAV debe ser PCM de 16 bits".into());
    }
    if channels == 0 {
        return Err("el WAV no declara canales".into());
    }
    if sample_rate != WHISPER_SAMPLE_RATE {
        return Err(format!(
            "el audio debe estar a {} Hz (se recibio {} Hz)",
            WHISPER_SAMPLE_RATE, sample_rate
        ));
    }
    let data = data.ok_or("el WAV no tiene datos de audio")?;

    let frame_values = channels as usize;
    let mut samples = Vec::with_capacity(data.len() / 2 / frame_values.max(1));
    // Mezcla a mono: promedia las muestras de los canales de cada frame.
    for frame in data.chunks_exact(2 * frame_values) {
        let mut acc = 0.0f32;
        for ch in frame.chunks_exact(2) {
            let raw = i16::from_le_bytes([ch[0], ch[1]]);
            acc += raw as f32 / 32_768.0;
        }
        samples.push(acc / frame_values as f32);
    }

    Ok(DecodedAudio {
        samples,
        sample_rate: WHISPER_SAMPLE_RATE,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Construye un WAV PCM16 minimo para pruebas.
    fn wav(channels: u16, sample_rate: u32, bits: u16, samples_le: &[u8]) -> Vec<u8> {
        let mut out = Vec::new();
        let data_len = samples_le.len() as u32;
        let byte_rate = sample_rate * channels as u32 * (bits as u32 / 8);
        let block_align = channels * (bits / 8);
        out.extend_from_slice(b"RIFF");
        out.extend_from_slice(&(36 + data_len).to_le_bytes());
        out.extend_from_slice(b"WAVE");
        out.extend_from_slice(b"fmt ");
        out.extend_from_slice(&16u32.to_le_bytes());
        out.extend_from_slice(&1u16.to_le_bytes()); // PCM
        out.extend_from_slice(&channels.to_le_bytes());
        out.extend_from_slice(&sample_rate.to_le_bytes());
        out.extend_from_slice(&byte_rate.to_le_bytes());
        out.extend_from_slice(&block_align.to_le_bytes());
        out.extend_from_slice(&bits.to_le_bytes());
        out.extend_from_slice(b"data");
        out.extend_from_slice(&data_len.to_le_bytes());
        out.extend_from_slice(samples_le);
        out
    }

    #[test]
    fn decodes_mono_16k_pcm16() {
        // Dos muestras: max negativo y ~mitad positiva.
        let pcm = [0x00, 0x80, 0x00, 0x40];
        let wav = wav(1, 16_000, 16, &pcm);
        let decoded = decode_wav_pcm16_to_whisper(&wav).unwrap();
        assert_eq!(decoded.sample_rate, 16_000);
        assert_eq!(decoded.samples.len(), 2);
        assert!((decoded.samples[0] - (-1.0)).abs() < 1e-6);
        assert!((decoded.samples[1] - 0.5).abs() < 1e-3);
    }

    #[test]
    fn downmixes_stereo_to_mono() {
        // Un frame estereo: canal L = +1/2, canal R = -1/2 -> promedio 0.
        let pcm = [0x00, 0x40, 0x00, 0xC0];
        let wav = wav(2, 16_000, 16, &pcm);
        let decoded = decode_wav_pcm16_to_whisper(&wav).unwrap();
        assert_eq!(decoded.samples.len(), 1, "un frame estereo -> una muestra mono");
        assert!(decoded.samples[0].abs() < 1e-3, "L y R opuestos promedian ~0");
    }

    #[test]
    fn rejects_non_wav_and_wrong_format() {
        assert!(decode_wav_pcm16_to_whisper(b"no soy un wav en absoluto---------------").is_err());
        // 44.1 kHz: fuera de lo que Whisper espera (sin resampleo).
        let wrong_rate = wav(1, 44_100, 16, &[0x00, 0x00]);
        assert!(decode_wav_pcm16_to_whisper(&wrong_rate).is_err());
        // 8 bits: no soportado.
        let wrong_bits = wav(1, 16_000, 8, &[0x00]);
        assert!(decode_wav_pcm16_to_whisper(&wrong_bits).is_err());
    }
}
