//! Actualizaciones de la app (paso 9) acotadas por la licencia (paso 29, rebanada 5).
//!
//! Clase de residencia: OPERATIVO. El canal firmado del paso 9 (tauri-plugin-
//! updater, minisign) se usa solo desde Rust. Antes de instalar se decide aqui,
//! sin red, si la version corresponde: la compra incluye las versiones
//! publicadas hasta `updates_until` de la licencia; despues, la ultima version
//! recibida se queda y la app sigue funcionando. Los parches criticos
//! (`"critical": true` en el manifiesto) se entregan aunque las actualizaciones
//! incluidas hayan terminado (15_modelo_de_negocio.md); su periodo de soporte
//! esta por definir.
//!
//! Configuracion por compilacion: `MIDOC_UPDATER_PUBKEY` (llave publica minisign
//! del canal) y `MIDOC_UPDATE_ENDPOINT` (URL del manifiesto, admite
//! `{{target}}`, `{{arch}}` y `{{current_version}}`). En depuracion tambien se
//! leen del entorno. Sin ellas la compilacion no ofrece actualizaciones.

use chrono::NaiveDate;
use serde::Serialize;

#[derive(Debug, Clone, PartialEq)]
pub struct UpdateSettings {
    pub pubkey: String,
    pub endpoint: String,
}

fn setting(name: &str, compiled: Option<&'static str>) -> Option<String> {
    let runtime = if cfg!(debug_assertions) { std::env::var(name).ok() } else { None };
    compiled
        .map(str::to_string)
        .or(runtime)
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

/// Canal configurado en esta compilacion, o `None`.
pub fn settings() -> Option<UpdateSettings> {
    Some(UpdateSettings {
        pubkey: setting("MIDOC_UPDATER_PUBKEY", option_env!("MIDOC_UPDATER_PUBKEY"))?,
        endpoint: setting("MIDOC_UPDATE_ENDPOINT", option_env!("MIDOC_UPDATE_ENDPOINT"))?,
    })
}

/// Resultado de buscar actualizaciones, para la interfaz.
#[derive(Debug, Serialize, PartialEq, Default)]
pub struct UpdateCheck {
    /// La compilacion tiene canal de actualizaciones.
    pub configured: bool,
    pub current_version: String,
    /// Hay una version mas nueva publicada.
    pub available: bool,
    pub version: Option<String>,
    pub published_at: Option<String>,
    pub notes: Option<String>,
    pub critical: bool,
    /// La licencia la incluye y se puede instalar.
    pub allowed: bool,
    /// Por que si o por que no, en palabras para el medico.
    pub reason: Option<String>,
}

fn spanish_date(date: NaiveDate) -> String {
    const MONTHS: [&str; 12] = [
        "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre",
        "noviembre", "diciembre",
    ];
    use chrono::Datelike as _;
    format!("{} de {} de {}", date.day(), MONTHS[date.month0() as usize], date.year())
}

/// Decide si una version corresponde a la licencia. `updates_until` es `None`
/// si no hay licencia valida en el equipo.
pub fn decide(
    version: &str,
    published: Option<NaiveDate>,
    critical: bool,
    updates_until: Option<NaiveDate>,
) -> (bool, String) {
    let Some(until) = updates_until else {
        return (false, "Activa tu licencia de MiDoc para recibir actualizaciones.".into());
    };
    if critical {
        return (
            true,
            "Parche crítico de seguridad o norma: se entrega aunque tus actualizaciones incluidas hayan terminado."
                .into(),
        );
    }
    let Some(published) = published else {
        return (false, format!("La versión {version} no indica su fecha de publicación; no se instala."));
    };
    if published <= until {
        (true, format!("Incluida en tu licencia (actualizaciones hasta el {}).", spanish_date(until)))
    } else {
        (
            false,
            format!(
                "La versión {version} se publicó el {} y tus actualizaciones incluidas terminaron el {}. \
                 Tu versión actual sigue funcionando sin cambios; puedes renovar las actualizaciones desde tu cuenta MiDoc.",
                spanish_date(published),
                spanish_date(until)
            ),
        )
    }
}

/// Arma el resultado a partir de lo que trae el manifiesto.
pub fn evaluate(
    current_version: &str,
    version: &str,
    published: Option<NaiveDate>,
    notes: Option<String>,
    raw_manifest: &serde_json::Value,
    updates_until: Option<NaiveDate>,
) -> UpdateCheck {
    let critical = raw_manifest.get("critical").and_then(|v| v.as_bool()).unwrap_or(false);
    let (allowed, reason) = decide(version, published, critical, updates_until);
    UpdateCheck {
        configured: true,
        current_version: current_version.to_string(),
        available: true,
        version: Some(version.to_string()),
        published_at: published.map(|d| d.format("%Y-%m-%d").to_string()),
        notes: notes.filter(|n| !n.trim().is_empty()),
        critical,
        allowed,
        reason: Some(reason),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn date(y: i32, m: u32, d: u32) -> Option<NaiveDate> {
        NaiveDate::from_ymd_opt(y, m, d)
    }

    #[test]
    fn versions_published_within_the_included_year_are_allowed() {
        let (allowed, reason) = decide("0.2.0", date(2027, 10, 7), false, date(2027, 10, 7));
        assert!(allowed, "el ultimo dia incluido cuenta");
        assert!(reason.contains("7 de octubre de 2027"), "{reason}");
        assert!(decide("0.2.0", date(2026, 12, 1), false, date(2027, 10, 7)).0);
    }

    #[test]
    fn later_versions_are_not_installed_but_the_app_keeps_working() {
        let (allowed, reason) = decide("0.9.0", date(2027, 10, 8), false, date(2027, 10, 7));
        assert!(!allowed);
        assert!(reason.contains("0.9.0") && reason.contains("8 de octubre de 2027"), "{reason}");
        assert!(reason.contains("sigue funcionando"), "{reason}");
    }

    #[test]
    fn critical_patches_are_delivered_even_after_updates_end() {
        let (allowed, reason) = decide("0.9.1", date(2030, 1, 1), true, date(2027, 10, 7));
        assert!(allowed);
        assert!(reason.contains("Parche crítico"), "{reason}");
    }

    #[test]
    fn without_license_or_date_nothing_is_installed() {
        assert!(!decide("0.2.0", date(2026, 12, 1), false, None).0);
        assert!(!decide("0.2.0", date(2026, 12, 1), true, None).0, "sin licencia ni el critico");
        let (allowed, reason) = decide("0.2.0", None, false, date(2027, 10, 7));
        assert!(!allowed && reason.contains("fecha"), "{reason}");
    }

    #[test]
    fn evaluate_reads_the_critical_flag_from_the_manifest() {
        let manifest = serde_json::json!({ "version": "0.3.0", "critical": true });
        let check = evaluate("0.1.0", "0.3.0", date(2031, 1, 1), Some("  ".into()), &manifest, date(2027, 10, 7));
        assert!(check.configured && check.available && check.critical && check.allowed);
        assert_eq!(check.published_at.as_deref(), Some("2031-01-01"));
        assert_eq!(check.notes, None);

        let plain = evaluate("0.1.0", "0.3.0", date(2031, 1, 1), None, &serde_json::json!({}), date(2027, 10, 7));
        assert!(!plain.critical && !plain.allowed);
    }
}
