//! Recomendacion de modelo de transcripcion local (Whisper) segun el hardware
//! del equipo del medico (paso 11, decision 2026-06-13).
//!
//! La transcripcion de consulta corre primero EN EL DISPOSITIVO con Whisper
//! local, cumpliendo la residencia local-first (sin enviar audio a la nube).
//! Los distintos tamanos de modelo Whisper exigen distinta RAM y rinden distinto
//! en español clinico; este modulo detecta las caracteristicas del equipo y
//! sugiere el tamano adecuado para que el medico no tenga que entenderlo.
//!
//! Este modulo NO procesa datos clinicos: solo lee caracteristicas de hardware
//! (RAM total, nucleos de CPU). No toca la base cifrada ni la red.

use serde::Serialize;

const MB_PER_GB: u64 = 1024;

/// Tamano de modelo Whisper local soportado. El orden refleja capacidad y
/// exigencia crecientes (mas precision en terminos clinicos a cambio de mas RAM
/// y mas tiempo de proceso en CPU).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WhisperModel {
    Small,
    Medium,
    LargeV3,
}

impl WhisperModel {
    /// Identificador estable para el frontend y para nombrar el archivo de pesos.
    pub fn id(self) -> &'static str {
        match self {
            WhisperModel::Small => "small",
            WhisperModel::Medium => "medium",
            WhisperModel::LargeV3 => "large-v3",
        }
    }

    /// Etiqueta legible para el medico (UI en español).
    pub fn label(self) -> &'static str {
        match self {
            WhisperModel::Small => "Whisper small (equilibrio en equipos modestos)",
            WhisperModel::Medium => "Whisper medium (recomendado para terminos clinicos)",
            WhisperModel::LargeV3 => "Whisper large-v3 (maxima precision, requiere GPU)",
        }
    }

    /// RAM aproximada que ocupa el modelo en ejecucion (MB). Referencia para el
    /// medico; no es un limite duro.
    pub fn model_ram_mb(self) -> u64 {
        match self {
            WhisperModel::Small => 2 * MB_PER_GB,
            WhisperModel::Medium => 5 * MB_PER_GB,
            WhisperModel::LargeV3 => 10 * MB_PER_GB,
        }
    }

    /// Espacio en disco aproximado de los pesos (MB).
    pub fn disk_mb(self) -> u64 {
        match self {
            WhisperModel::Small => 500,
            WhisperModel::Medium => 1500,
            WhisperModel::LargeV3 => 3000,
        }
    }
}

/// Caracteristicas del equipo relevantes para elegir el modelo. Es la frontera
/// pura de este modulo: la deteccion las llena y la recomendacion las consume,
/// de modo que la logica de decision se prueba sin tocar hardware.
#[derive(Debug, Clone, Copy)]
pub struct HardwareSpecs {
    pub total_ram_mb: u64,
    pub cpu_cores: u32,
    /// GPU dedicada utilizable para acelerar la transcripcion. La deteccion real
    /// se difiere (ver `detect_specs`); por defecto es conservadora (`false`).
    pub has_gpu: bool,
}

/// Recomendacion que viaja al frontend. No contiene datos clinicos.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptionRecommendation {
    pub total_ram_mb: u64,
    pub cpu_cores: u32,
    pub has_gpu: bool,
    /// Modelo local sugerido: "small" | "medium" | "large-v3".
    pub model_id: String,
    pub model_label: String,
    /// RAM aproximada que ocupa el modelo sugerido (MB).
    pub model_ram_mb: u64,
    /// Espacio en disco aproximado de los pesos (MB).
    pub disk_mb: u64,
    /// `true` si el equipo puede transcribir casi en vivo; `false` si conviene
    /// el modo por lotes (grabar y obtener el texto al terminar).
    pub realtime_capable: bool,
    /// `true` cuando el equipo queda por debajo del minimo comodo para Whisper
    /// local: se sugiere ofrecer la transcripcion en nube (con consentimiento y
    /// seudonimizada) como alternativa, sin dejar de permitir el modo offline.
    pub recommend_cloud_fallback: bool,
    /// Explicacion breve para mostrar al medico.
    pub reason: String,
}

/// Umbrales (en MB) de RAM total del sistema para escalar el modelo. Pensados
/// para dejar holgura al sistema operativo, a la app y a SQLCipher ademas del
/// modelo. Coinciden con la guia documentada en `11_recomendaciones_ia_medica.md`.
const MIN_LOCAL_RAM_MB: u64 = 8 * MB_PER_GB;
const MEDIUM_TIER_RAM_MB: u64 = 16 * MB_PER_GB;

/// Decide el modelo a partir de las specs. Funcion pura y determinista: toda la
/// politica de seleccion vive aqui para poder probarla sin hardware real.
pub fn recommend(specs: HardwareSpecs) -> TranscriptionRecommendation {
    let (model, realtime_capable, recommend_cloud_fallback, reason) =
        if specs.total_ram_mb < MIN_LOCAL_RAM_MB {
            // Por debajo del minimo comodo: el modelo pequeno funciona offline,
            // pero sera lento; se sugiere ademas la nube con consentimiento.
            (
                WhisperModel::Small,
                false,
                true,
                "El equipo tiene menos de 8 GB de RAM: el modelo pequeno funciona sin conexion, pero sera lento. Si quieres mayor velocidad o precision, ofrece la transcripcion en nube con consentimiento del paciente.".to_string(),
            )
        } else if specs.total_ram_mb < MEDIUM_TIER_RAM_MB {
            if specs.has_gpu {
                // La GPU compensa la velocidad: el modelo mediano es viable.
                (
                    WhisperModel::Medium,
                    true,
                    false,
                    "Equipo con 8-16 GB de RAM y GPU: el modelo mediano corre con buena precision clinica y casi en vivo gracias a la GPU.".to_string(),
                )
            } else {
                (
                    WhisperModel::Small,
                    false,
                    false,
                    "Equipo con 8-16 GB de RAM sin GPU: el modelo pequeno transcribe por lotes (grabas y obtienes el texto al terminar) con buen equilibrio entre velocidad y precision.".to_string(),
                )
            }
        } else if specs.has_gpu {
            // 16 GB o mas con GPU: maxima precision viable.
            (
                WhisperModel::LargeV3,
                true,
                false,
                "Equipo con 16 GB o mas y GPU: puede correr el modelo de maxima precision casi en vivo.".to_string(),
            )
        } else {
            // 16 GB o mas sin GPU: el modelo mediano es el recomendado; sera
            // casi en vivo solo si la CPU tiene suficientes nucleos.
            let realtime = specs.cpu_cores >= 8;
            let reason = if realtime {
                "Equipo con 16 GB o mas y CPU de 8+ nucleos: el modelo mediano ofrece buena precision clinica con transcripcion agil.".to_string()
            } else {
                "Equipo con 16 GB o mas: el modelo mediano ofrece buena precision clinica; transcribe por lotes (grabas y obtienes el texto al terminar).".to_string()
            };
            (WhisperModel::Medium, realtime, false, reason)
        };

    TranscriptionRecommendation {
        total_ram_mb: specs.total_ram_mb,
        cpu_cores: specs.cpu_cores,
        has_gpu: specs.has_gpu,
        model_id: model.id().to_string(),
        model_label: model.label().to_string(),
        model_ram_mb: model.model_ram_mb(),
        disk_mb: model.disk_mb(),
        realtime_capable,
        recommend_cloud_fallback,
        reason,
    }
}

/// Lee las caracteristicas del equipo. La deteccion de GPU se difiere (requiere
/// codigo por plataforma); se reporta `false` de forma conservadora, lo que solo
/// hace la recomendacion mas prudente. La transcripcion en nube cubre el caso
/// "lo quiero mas rapido" cuando hay GPU pero aun no se detecta.
pub fn detect_specs() -> HardwareSpecs {
    let mut system = sysinfo::System::new();
    system.refresh_memory();
    // `total_memory()` reporta bytes; lo pasamos a MB.
    let total_ram_mb = system.total_memory() / (1024 * 1024);

    let cpu_cores = std::thread::available_parallelism()
        .map(|n| n.get() as u32)
        .unwrap_or(1);

    HardwareSpecs {
        total_ram_mb,
        cpu_cores,
        has_gpu: false,
    }
}

/// Recomendacion lista para el frontend: detecta el equipo y aplica la politica.
pub fn recommendation() -> TranscriptionRecommendation {
    recommend(detect_specs())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn specs(ram_gb: u64, cpu_cores: u32, has_gpu: bool) -> HardwareSpecs {
        HardwareSpecs {
            total_ram_mb: ram_gb * MB_PER_GB,
            cpu_cores,
            has_gpu,
        }
    }

    #[test]
    fn weak_machine_gets_small_and_cloud_fallback() {
        let rec = recommend(specs(4, 2, false));
        assert_eq!(rec.model_id, "small");
        assert!(rec.recommend_cloud_fallback);
        assert!(!rec.realtime_capable);
    }

    #[test]
    fn mid_machine_without_gpu_gets_small_no_cloud() {
        let rec = recommend(specs(8, 4, false));
        assert_eq!(rec.model_id, "small");
        assert!(!rec.recommend_cloud_fallback);
        assert!(!rec.realtime_capable);
    }

    #[test]
    fn mid_machine_with_gpu_gets_medium_realtime() {
        let rec = recommend(specs(12, 4, true));
        assert_eq!(rec.model_id, "medium");
        assert!(rec.realtime_capable);
        assert!(!rec.recommend_cloud_fallback);
    }

    #[test]
    fn strong_machine_without_gpu_gets_medium() {
        let rec = recommend(specs(16, 8, false));
        assert_eq!(rec.model_id, "medium");
        assert!(!rec.recommend_cloud_fallback);
        // CPU de 8 nucleos: transcripcion agil.
        assert!(rec.realtime_capable);
    }

    #[test]
    fn strong_machine_few_cores_is_batch_only() {
        let rec = recommend(specs(32, 4, false));
        assert_eq!(rec.model_id, "medium");
        assert!(!rec.realtime_capable);
    }

    #[test]
    fn strong_machine_with_gpu_gets_large() {
        let rec = recommend(specs(32, 16, true));
        assert_eq!(rec.model_id, "large-v3");
        assert!(rec.realtime_capable);
        assert!(!rec.recommend_cloud_fallback);
    }

    #[test]
    fn recommendation_echoes_detected_specs() {
        let rec = recommend(specs(16, 8, false));
        assert_eq!(rec.total_ram_mb, 16 * MB_PER_GB);
        assert_eq!(rec.cpu_cores, 8);
        assert!(!rec.has_gpu);
        assert!(rec.model_ram_mb > 0);
        assert!(rec.disk_mb > 0);
        assert!(!rec.reason.is_empty());
    }

    #[test]
    fn boundary_at_eight_gb_is_local() {
        // Exactamente 8 GB ya no se considera "debil".
        let rec = recommend(specs(8, 8, false));
        assert!(!rec.recommend_cloud_fallback);
    }

    #[test]
    fn detect_specs_returns_plausible_values() {
        // La deteccion real corre en el equipo de pruebas: solo verificamos que
        // devuelve valores plausibles (no procesa datos clinicos).
        let specs = detect_specs();
        assert!(specs.cpu_cores >= 1);
        assert!(specs.total_ram_mb >= 1);
    }
}
