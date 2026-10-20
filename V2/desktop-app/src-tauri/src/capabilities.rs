//! Interruptores de capacidad que se fijan al compilar (paso 33, decision del
//! 2026-10-20).
//!
//! La revision de seguridad de medicamentos (interacciones, alergias cruzadas y
//! duplicidad, y despues medicamento contra padecimiento) avisa al medico sobre
//! conductas clinicas y podria considerarse software como dispositivo medico.
//! Mientras COFEPRIS no responda, va apagada en el instalador que se vende:
//! apagada, nunca borrada. Se enciende compilando con
//! `MIDOC_MEDICATION_SAFETY=on`, y llega a los equipos como una actualizacion.
//!
//! El candado vive aqui, en Rust, y no solo en la interfaz: con el interruptor
//! apagado los comandos de seguridad se niegan a correr aunque alguien los llame.
//! Lo que solo registra o describe (CNIS, receta, FHIR) no depende de esto.

use serde::Serialize;

const MEDICATION_SAFETY: Option<&str> = option_env!("MIDOC_MEDICATION_SAFETY");

pub const MEDICATION_SAFETY_OFF: &str =
    "La revisión de seguridad de medicamentos no está disponible en esta versión.";

/// Lo que la interfaz necesita saber para mostrar u ocultar cada capacidad.
#[derive(Debug, Serialize, PartialEq)]
pub struct Capabilities {
    pub medication_safety: bool,
}

/// Encendido solo con un "on" explicito; cualquier otra cosa es apagado.
fn parse_flag(raw: Option<&str>) -> bool {
    raw.is_some_and(|value| value.trim().eq_ignore_ascii_case("on"))
}

pub fn current() -> Capabilities {
    Capabilities {
        medication_safety: parse_flag(MEDICATION_SAFETY),
    }
}

fn require(enabled: bool, message: &str) -> Result<(), String> {
    if enabled {
        Ok(())
    } else {
        Err(message.to_string())
    }
}

/// Candado de los comandos de la revision de seguridad de medicamentos.
pub fn require_medication_safety() -> Result<(), String> {
    require(current().medication_safety, MEDICATION_SAFETY_OFF)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_flag_is_off_unless_explicitly_on() {
        assert!(!parse_flag(None));
        assert!(!parse_flag(Some("")));
        assert!(!parse_flag(Some("true")));
        assert!(!parse_flag(Some("1")));
        assert!(!parse_flag(Some("off")));
        assert!(parse_flag(Some("on")));
        assert!(parse_flag(Some(" ON ")));
    }

    #[test]
    fn the_lock_refuses_when_off() {
        assert_eq!(
            require(false, MEDICATION_SAFETY_OFF),
            Err(MEDICATION_SAFETY_OFF.to_string())
        );
        assert_eq!(require(true, MEDICATION_SAFETY_OFF), Ok(()));
    }

    #[test]
    fn the_lock_follows_the_build_flag() {
        assert_eq!(
            require_medication_safety().is_ok(),
            parse_flag(MEDICATION_SAFETY)
        );
    }
}
