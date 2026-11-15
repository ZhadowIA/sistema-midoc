//! Deteccion de bucles en la transcripcion local.
//!
//! Con ruido que no es habla, large-v3-turbo puede quedarse atorado y repetir la
//! misma frase en cada ventana de 30 s (medido el 2026-11-15: "Rosa Elena
//! Quintana" once veces y nada mas). Entregar eso como transcripcion dejaria al
//! medico con una nota vacia sin aviso, asi que se detecta y se reporta como
//! error.
//!
//! No se usa `initial_prompt` con vocabulario clinico: medido el 2026-11-15, no
//! corrigio "los hartan" (losartan), "la proxena" (naproxeno) ni "hormigon"
//! (hormigueo), y sin VAD el prompt se colo al texto ("Terminos:", "Paciente:")
//! y provoco un bucle de 54 segmentos ("¿Presion?").
//!
//! Es logica pura, sin whisper.cpp, para que se pruebe en el build por defecto.

// Solo lo usa el proveedor Whisper, que vive tras el feature `whisper-local`.
#![cfg_attr(not(feature = "whisper-local"), allow(dead_code))]

/// Repeticiones seguidas de un mismo segmento a partir de las cuales se
/// considera bucle. Una persona puede repetir una frase dos o tres veces ("No,
/// doctor."), pero no cuatro segmentos seguidos identicos.
const LOOP_MIN_RUN: usize = 4;

/// Normaliza un segmento para compararlo: minusculas, solo letras y digitos, y
/// espacios simples.
fn normalize(text: &str) -> String {
    text.chars()
        .flat_map(char::to_lowercase)
        .map(|c| if c.is_alphanumeric() { c } else { ' ' })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Indica si la transcripcion se atoro: el mismo texto en `LOOP_MIN_RUN` o mas
/// segmentos seguidos. Los segmentos vacios no rompen ni cuentan en la racha.
pub fn has_repetition_loop<'a>(segments: impl IntoIterator<Item = &'a str>) -> bool {
    let mut previous = String::new();
    let mut run = 0;
    for segment in segments {
        let current = normalize(segment);
        if current.is_empty() {
            continue;
        }
        if current == previous {
            run += 1;
        } else {
            previous = current;
            run = 1;
        }
        if run >= LOOP_MIN_RUN {
            return true;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_the_turbo_loop_seen_with_noise_at_the_start() {
        let stuck = vec!["Rosa Elena Quintana"; 11];
        assert!(has_repetition_loop(stuck));
    }

    #[test]
    fn ignores_case_punctuation_and_blank_segments_inside_the_run() {
        let segments = ["Gracias.", "gracias", "", "¡Gracias!", "  GRACIAS  "];
        assert!(has_repetition_loop(segments));
    }

    #[test]
    fn a_normal_consultation_with_short_repeats_is_not_a_loop() {
        let segments = [
            "¿Losartán de cincuenta, en la mañana?",
            "Exacto.",
            "No, doctor.",
            "No, doctor.",
            "No, doctor.",
            "Cuídese.",
            "No, doctor.",
        ];
        assert!(!has_repetition_loop(segments));
    }

    #[test]
    fn empty_transcript_is_not_a_loop() {
        assert!(!has_repetition_loop(Vec::<&str>::new()));
        assert!(!has_repetition_loop(["", "  ", "..."]));
    }
}
