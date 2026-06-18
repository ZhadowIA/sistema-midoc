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
//! (RAM total, nucleos de CPU y adaptadores de video). No toca la base cifrada
//! ni la red; la deteccion de GPU consulta al sistema operativo por sus
//! adaptadores de video (sin entrada del usuario, sin superficie de inyeccion).

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

    /// Modelo a partir del identificador estable (`id`). `None` si no se reconoce.
    pub fn from_id(id: &str) -> Option<Self> {
        match id {
            "small" => Some(WhisperModel::Small),
            "medium" => Some(WhisperModel::Medium),
            "large-v3" => Some(WhisperModel::LargeV3),
            _ => None,
        }
    }

    /// Nombre del archivo de pesos GGML de whisper.cpp para este modelo.
    pub fn file_name(self) -> &'static str {
        match self {
            WhisperModel::Small => "ggml-small.bin",
            WhisperModel::Medium => "ggml-medium.bin",
            WhisperModel::LargeV3 => "ggml-large-v3.bin",
        }
    }

    /// Todos los modelos soportados, de menor a mayor exigencia.
    pub fn all() -> [WhisperModel; 3] {
        [
            WhisperModel::Small,
            WhisperModel::Medium,
            WhisperModel::LargeV3,
        ]
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
    /// GPU dedicada utilizable para acelerar la transcripcion (CUDA/Metal/Vulkan
    /// en whisper.cpp). Las GPU integradas no aceleran Whisper de forma util y se
    /// reportan como `false`. La deteccion (`detect_has_gpu`) es conservadora:
    /// ante cualquier duda o fallo, `false`.
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

/// Lee las caracteristicas del equipo: RAM, nucleos de CPU y si hay una GPU
/// dedicada utilizable. No procesa datos clinicos ni usa la red; la deteccion de
/// GPU consulta al sistema operativo por los adaptadores de video.
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
        has_gpu: detect_has_gpu(),
    }
}

/* ---------- Deteccion de GPU ---------- */

/// Decide si un nombre de adaptador de video corresponde a una GPU dedicada que
/// whisper.cpp pueda aprovechar (NVIDIA via CUDA, AMD dedicada via Vulkan, o GPU
/// de Apple Silicon via Metal). Funcion pura: la clasificacion se prueba sin
/// hardware. Las GPU integradas (Intel UHD/Iris, APU Radeon Graphics) y los
/// adaptadores virtuales/basicos se consideran NO acelerables (conservador).
pub fn looks_like_accelerable_gpu(name: &str) -> bool {
    let n = name.to_lowercase();

    // Adaptadores que nunca aceleran Whisper de forma util.
    const EXCLUDED: &[&str] = &[
        "microsoft basic",
        "remote display",
        "vmware",
        "virtualbox",
        "qxl",
        "parsec",
        "meta virtual",
    ];
    if EXCLUDED.iter().any(|m| n.contains(m)) {
        return false;
    }

    // Marcadores de GPU dedicada / acelerable. Deliberadamente especificos para
    // no confundir integradas (p. ej. "radeon graphics" de una APU) con dedicadas.
    const DEDICATED: &[&str] = &[
        "nvidia",
        "geforce",
        "rtx",
        "gtx",
        "quadro",
        "tesla",
        "titan",
        "radeon rx",
        "radeon pro",
        "radeon vii",
        "firepro",
        "instinct",
        "arc", // Intel Arc dedicada (las integradas son "uhd"/"iris", no "arc")
        "apple m", // GPU de Apple Silicon (Metal)
    ];
    DEDICATED.iter().any(|m| n.contains(m))
}

/// Agrega la clasificacion sobre la lista de adaptadores detectados. Pura.
fn detect_has_gpu_from_names<I>(names: I) -> bool
where
    I: IntoIterator<Item = String>,
{
    names.into_iter().any(|n| looks_like_accelerable_gpu(&n))
}

/// Consulta al sistema operativo y devuelve `true` si hay una GPU acelerable.
/// Best-effort: si la consulta falla o no hay datos, devuelve `false`.
fn detect_has_gpu() -> bool {
    detect_has_gpu_from_names(detect_gpu_names())
}

/// Ejecuta un comando del sistema y captura su salida estandar. En Windows evita
/// abrir una ventana de consola. Devuelve `None` si el comando falla.
fn capture_stdout(program: &str, args: &[&str]) -> Option<String> {
    let mut command = std::process::Command::new(program);
    command.args(args);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let output = command.output().ok()?;
    if !output.status.success() {
        return None;
    }
    Some(String::from_utf8_lossy(&output.stdout).into_owned())
}

/// Separa la salida del comando en lineas no vacias.
fn nonempty_lines(raw: &str) -> Vec<String> {
    raw.lines()
        .map(|line| line.trim().to_string())
        .filter(|line| !line.is_empty())
        .collect()
}

/// Lista los nombres de adaptadores de video del equipo, por plataforma.
#[cfg(target_os = "windows")]
fn detect_gpu_names() -> Vec<String> {
    // CIM es la via soportada en Windows moderno; sin ventana de consola.
    capture_stdout(
        "powershell",
        &[
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name",
        ],
    )
    .map(|raw| nonempty_lines(&raw))
    .unwrap_or_default()
}

#[cfg(target_os = "linux")]
fn detect_gpu_names() -> Vec<String> {
    // lspci lista controladores VGA/3D/Display; tolerante a su ausencia.
    capture_stdout("sh", &["-c", "lspci -mm 2>/dev/null | grep -iE 'vga|3d|display'"])
        .map(|raw| nonempty_lines(&raw))
        .unwrap_or_default()
}

#[cfg(target_os = "macos")]
fn detect_gpu_names() -> Vec<String> {
    capture_stdout("system_profiler", &["SPDisplaysDataType"])
        .map(|raw| nonempty_lines(&raw))
        .unwrap_or_default()
}

#[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
fn detect_gpu_names() -> Vec<String> {
    Vec::new()
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

    #[test]
    fn dedicated_gpus_are_recognized() {
        for name in [
            "NVIDIA GeForce RTX 4060 Laptop GPU",
            "NVIDIA Corporation GA106 [GeForce RTX 3060]",
            "AMD Radeon RX 6700 XT",
            "AMD Radeon Pro 5500M",
            "Intel(R) Arc(TM) A770 Graphics",
            "Apple M2 Pro",
        ] {
            assert!(looks_like_accelerable_gpu(name), "deberia aceptar: {name}");
        }
    }

    #[test]
    fn integrated_and_virtual_adapters_are_rejected() {
        for name in [
            "Intel(R) UHD Graphics 630",
            "Intel(R) Iris(R) Xe Graphics",
            "AMD Radeon(TM) Graphics", // APU integrada
            "AMD Radeon(TM) Vega 8 Graphics",
            "Microsoft Basic Display Adapter",
            "VMware SVGA 3D",
            "",
        ] {
            assert!(!looks_like_accelerable_gpu(name), "deberia rechazar: {name}");
        }
    }

    #[test]
    fn aggregator_is_true_if_any_adapter_is_dedicated() {
        // Laptop tipica: integrada + dedicada -> hay aceleracion.
        let mixed = vec![
            "Intel(R) UHD Graphics 630".to_string(),
            "NVIDIA GeForce RTX 3070".to_string(),
        ];
        assert!(detect_has_gpu_from_names(mixed));

        // Solo integrada -> sin aceleracion util.
        let integrated = vec!["Intel(R) Iris(R) Xe Graphics".to_string()];
        assert!(!detect_has_gpu_from_names(integrated));

        // Sin adaptadores detectados -> conservador: false.
        assert!(!detect_has_gpu_from_names(Vec::<String>::new()));
    }
}
