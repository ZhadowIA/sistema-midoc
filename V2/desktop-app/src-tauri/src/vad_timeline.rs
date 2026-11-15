//! Recorte del audio a los tramos de voz que detecta el VAD y regreso de las
//! marcas de tiempo al audio original.
//!
//! whisper-rs transcribe con `whisper_full_with_state`, y en whisper.cpp solo
//! `whisper_full` aplica el VAD: activarlo en `FullParams` no tiene efecto. Por
//! eso el proveedor corre el VAD por su cuenta, transcribe solo la voz y usa
//! esta linea de tiempo para devolver cada segmento a su lugar en la grabacion
//! (la diarizacion empata segmentos y hablantes por tiempo).
//!
//! Es logica pura, sin whisper.cpp, para que se pruebe en el build por defecto.

// Solo lo usa el proveedor Whisper, que vive tras el feature `whisper-local`.
#![cfg_attr(not(feature = "whisper-local"), allow(dead_code))]

/// Muestras por centisegundo a 16 kHz (la tasa que consume Whisper).
const SAMPLES_PER_CS: i64 = 160;

/// Un tramo de voz copiado al audio recortado.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Piece {
    /// Inicio en el audio recortado, en muestras.
    trimmed_start: usize,
    /// Inicio en el audio original, en muestras.
    original_start: usize,
    /// Largo en muestras.
    len: usize,
}

/// Correspondencia entre el audio recortado y el original.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Timeline {
    pieces: Vec<Piece>,
}

/// Convierte tramos del VAD (centisegundos) a rangos de muestras dentro del
/// audio: los recorta al largo real, los ordena, une los que se enciman (el
/// margen de cada tramo puede alcanzar al siguiente) y descarta los vacios.
pub fn speech_ranges(segments_cs: &[(f32, f32)], total_samples: usize) -> Vec<(usize, usize)> {
    let to_sample = |cs: f32| -> usize {
        if !cs.is_finite() || cs <= 0.0 {
            0
        } else {
            ((cs as f64 * SAMPLES_PER_CS as f64) as usize).min(total_samples)
        }
    };
    let mut ranges: Vec<(usize, usize)> = segments_cs
        .iter()
        .map(|&(start, end)| (to_sample(start), to_sample(end)))
        .filter(|(start, end)| end > start)
        .collect();
    ranges.sort_unstable();

    let mut merged: Vec<(usize, usize)> = Vec::with_capacity(ranges.len());
    for (start, end) in ranges {
        match merged.last_mut() {
            Some(last) if start <= last.1 => last.1 = last.1.max(end),
            _ => merged.push((start, end)),
        }
    }
    merged
}

/// Copia los rangos de voz uno tras otro, con `gap` muestras de silencio entre
/// ellos para que Whisper no pegue el final de una frase con la siguiente.
pub fn concat_speech(
    samples: &[f32],
    ranges: &[(usize, usize)],
    gap: usize,
) -> (Vec<f32>, Timeline) {
    let mut trimmed = Vec::new();
    let mut pieces = Vec::with_capacity(ranges.len());
    for (index, &(start, end)) in ranges.iter().enumerate() {
        let end = end.min(samples.len());
        if end <= start {
            continue;
        }
        if index > 0 {
            trimmed.extend(std::iter::repeat_n(0.0, gap));
        }
        pieces.push(Piece {
            trimmed_start: trimmed.len(),
            original_start: start,
            len: end - start,
        });
        trimmed.extend_from_slice(&samples[start..end]);
    }
    (trimmed, Timeline { pieces })
}

impl Timeline {
    /// Lleva una marca de tiempo del audio recortado (centisegundos) a la
    /// grabacion original. Una marca dentro del silencio agregado entre tramos
    /// cae al final del tramo anterior.
    pub fn to_original_cs(&self, trimmed_cs: i64) -> i64 {
        let Some(first) = self.pieces.first() else {
            return trimmed_cs;
        };
        let sample = trimmed_cs.max(0).saturating_mul(SAMPLES_PER_CS) as usize;
        let piece = self
            .pieces
            .iter()
            .rev()
            .find(|piece| piece.trimmed_start <= sample)
            .unwrap_or(first);
        let offset = sample.saturating_sub(piece.trimmed_start).min(piece.len);
        ((piece.original_start + offset) as i64) / SAMPLES_PER_CS
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const CS: usize = SAMPLES_PER_CS as usize;

    #[test]
    fn converts_centiseconds_to_samples_and_clamps_to_the_audio() {
        // 100 cs = 1 s = 16 000 muestras; el segundo tramo pasa del final.
        let ranges = speech_ranges(&[(100.0, 200.0), (250.0, 900.0)], 400 * CS);
        assert_eq!(ranges, vec![(100 * CS, 200 * CS), (250 * CS, 400 * CS)]);
    }

    #[test]
    fn merges_overlapping_spans_and_drops_empty_or_invalid_ones() {
        let ranges = speech_ranges(
            &[
                (300.0, 400.0),
                (100.0, 220.0),
                (200.0, 260.0),
                (500.0, 500.0),
                (f32::NAN, 10.0),
            ],
            1000 * CS,
        );
        assert_eq!(
            ranges,
            vec![(0, 10 * CS), (100 * CS, 260 * CS), (300 * CS, 400 * CS)]
        );
    }

    #[test]
    fn keeps_only_speech_with_a_silence_gap_between_spans() {
        let samples: Vec<f32> = (0..10).map(|i| i as f32).collect();
        let (trimmed, _) = concat_speech(&samples, &[(1, 3), (6, 8)], 2);
        assert_eq!(trimmed, vec![1.0, 2.0, 0.0, 0.0, 6.0, 7.0]);
    }

    #[test]
    fn maps_trimmed_timestamps_back_to_the_original_recording() {
        // Voz de 10 a 12 s y de 30 a 35 s; 1 s de silencio entre tramos.
        let samples = vec![0.5; 40 * 100 * CS];
        let ranges = speech_ranges(&[(1000.0, 1200.0), (3000.0, 3500.0)], samples.len());
        let (trimmed, timeline) = concat_speech(&samples, &ranges, 100 * CS);
        assert_eq!(trimmed.len(), (200 + 100 + 500) * CS);

        assert_eq!(timeline.to_original_cs(0), 1000);
        assert_eq!(timeline.to_original_cs(150), 1150);
        // Dentro del silencio agregado: cae al final del primer tramo.
        assert_eq!(timeline.to_original_cs(250), 1200);
        // Inicio del segundo tramo (200 cs de voz + 100 cs de silencio).
        assert_eq!(timeline.to_original_cs(300), 3000);
        assert_eq!(timeline.to_original_cs(700), 3400);
        // Mas alla del final: se queda en el final del ultimo tramo.
        assert_eq!(timeline.to_original_cs(5000), 3500);
    }

    #[test]
    fn without_speech_spans_timestamps_are_unchanged() {
        let timeline = Timeline::default();
        assert_eq!(timeline.to_original_cs(1234), 1234);
        let (trimmed, timeline) = concat_speech(&[1.0, 2.0], &[], 5);
        assert!(trimmed.is_empty());
        assert_eq!(timeline, Timeline::default());
    }
}
