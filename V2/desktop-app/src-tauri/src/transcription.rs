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
    LargeV3Turbo,
    LargeV3,
}

impl WhisperModel {
    /// Identificador estable para el frontend y para nombrar el archivo de pesos.
    pub fn id(self) -> &'static str {
        match self {
            WhisperModel::Small => "small",
            WhisperModel::Medium => "medium",
            WhisperModel::LargeV3Turbo => "large-v3-turbo",
            WhisperModel::LargeV3 => "large-v3",
        }
    }

    /// Modelo a partir del identificador estable (`id`). `None` si no se reconoce.
    pub fn from_id(id: &str) -> Option<Self> {
        match id {
            "small" => Some(WhisperModel::Small),
            "medium" => Some(WhisperModel::Medium),
            "large-v3-turbo" => Some(WhisperModel::LargeV3Turbo),
            "large-v3" => Some(WhisperModel::LargeV3),
            _ => None,
        }
    }

    /// Nombre del archivo de pesos GGML de whisper.cpp para este modelo.
    ///
    /// Se usan pesos **cuantizados Q5** (no fp16): en CPU rinden mas rapido y
    /// ocupan ~1/3 de la RAM y el disco con una perdida de precision minima
    /// (~1% WER). Es la base para equipos de medico sin GPU dedicada. La GPU
    /// (Vulkan/CUDA/Metal) tambien se beneficia (menos VRAM).
    pub fn file_name(self) -> &'static str {
        match self {
            WhisperModel::Small => "ggml-small-q5_1.bin",
            WhisperModel::Medium => "ggml-medium-q5_0.bin",
            WhisperModel::LargeV3Turbo => "ggml-large-v3-turbo-q5_0.bin",
            WhisperModel::LargeV3 => "ggml-large-v3-q5_0.bin",
        }
    }

    /// Todos los modelos soportados, de menor a mayor exigencia.
    pub fn all() -> [WhisperModel; 4] {
        [
            WhisperModel::Small,
            WhisperModel::Medium,
            WhisperModel::LargeV3Turbo,
            WhisperModel::LargeV3,
        ]
    }

    /// Etiqueta legible para el medico (UI en español).
    pub fn label(self) -> &'static str {
        match self {
            WhisperModel::Small => "Whisper small cuantizado (equipos muy modestos)",
            WhisperModel::Medium => "Whisper medium cuantizado (terminos clinicos)",
            WhisperModel::LargeV3Turbo => {
                "Whisper large-v3-turbo cuantizado (alta precision y rapido en CPU)"
            }
            WhisperModel::LargeV3 => "Whisper large-v3 cuantizado (maxima precision)",
        }
    }

    /// RAM aproximada que ocupa el modelo en ejecucion (MB). Referencia para el
    /// medico; no es un limite duro. Valores para los pesos **cuantizados Q5**,
    /// sensiblemente menores que los fp16.
    pub fn model_ram_mb(self) -> u64 {
        match self {
            WhisperModel::Small => MB_PER_GB,
            WhisperModel::Medium => 2 * MB_PER_GB,
            WhisperModel::LargeV3Turbo => 2 * MB_PER_GB,
            WhisperModel::LargeV3 => 3 * MB_PER_GB,
        }
    }

    /// Espacio en disco aproximado de los pesos (MB). Pesos cuantizados Q5.
    pub fn disk_mb(self) -> u64 {
        match self {
            WhisperModel::Small => 190,
            WhisperModel::Medium => 540,
            WhisperModel::LargeV3Turbo => 575,
            WhisperModel::LargeV3 => 1085,
        }
    }
}

/// Backend de aceleracion que el equipo puede aprovechar, segun los adaptadores
/// de video detectados y suponiendo el build de distribucion (Vulkan universal +
/// Metal en macOS + CPU/OpenBLAS de respaldo). whisper.cpp usa en runtime el
/// backend compilado disponible; este enum guia la eleccion de modelo, no el
/// build. Se distingue GPU integrada de dedicada porque ambas usan Vulkan pero
/// rinden distinto (la dedicada admite un modelo mayor).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AccelBackend {
    /// Sin GPU util: corre en CPU (con OpenBLAS/AVX2 en el build de distribucion).
    Cpu,
    /// GPU integrada (Intel UHD/Iris, APU Radeon) via Vulkan: acelera, pero menos
    /// que una dedicada.
    VulkanIntegrated,
    /// GPU dedicada (NVIDIA/AMD/Intel Arc) via Vulkan/CUDA: maxima aceleracion.
    VulkanDedicated,
    /// Apple Silicon (chip M) via Metal, con memoria unificada.
    Metal,
}

impl AccelBackend {
    /// Identificador estable para el frontend.
    pub fn id(self) -> &'static str {
        match self {
            AccelBackend::Cpu => "cpu",
            AccelBackend::VulkanIntegrated => "vulkan-integrated",
            AccelBackend::VulkanDedicated => "vulkan-dedicated",
            AccelBackend::Metal => "metal",
        }
    }

    /// Etiqueta legible para el medico (UI en español).
    pub fn label(self) -> &'static str {
        match self {
            AccelBackend::Cpu => "CPU optimizada (OpenBLAS)",
            AccelBackend::VulkanIntegrated => "GPU integrada (Vulkan)",
            AccelBackend::VulkanDedicated => "GPU dedicada (Vulkan/CUDA)",
            AccelBackend::Metal => "Apple Metal",
        }
    }

    /// `true` si hay alguna aceleracion por GPU (cualquier backend distinto de CPU).
    pub fn is_accelerated(self) -> bool {
        !matches!(self, AccelBackend::Cpu)
    }
}

/// Backends de aceleracion **realmente compilados** en este binario (features de
/// Cargo). whisper.cpp solo puede usar lo que se compilo; por eso el backend que
/// detecta el hardware debe reducirse a estas capacidades (ver `effective_backend`).
/// Asi un instalador CPU-only no recomienda un modelo pesado en una maquina con
/// GPU que el binario no sabe acelerar.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct BackendCaps {
    pub vulkan: bool,
    pub cuda: bool,
    pub metal: bool,
}

impl BackendCaps {
    /// Capacidades del binario actual, leidas de los features de compilacion.
    pub fn compiled() -> Self {
        Self {
            vulkan: cfg!(feature = "whisper-vulkan"),
            cuda: cfg!(feature = "whisper-cuda"),
            metal: cfg!(feature = "whisper-metal"),
        }
    }
}

/// Reduce el backend detectado por hardware al que el binario **puede** usar de
/// verdad. Si la aceleracion correspondiente no se compilo, cae a CPU (whisper.cpp
/// correria en CPU de todas formas, y asi la recomendacion de modelo no asume una
/// aceleracion inexistente). Pura: la reconciliacion se prueba con capacidades
/// explicitas, sin depender de los features del build de prueba.
///
/// Vulkan acelera GPU integrada y dedicada; CUDA solo cubre la dedicada (NVIDIA);
/// Metal solo Apple. Por eso una integrada sin Vulkan compilado cae a CPU aunque
/// haya CUDA.
pub fn effective_backend(detected: AccelBackend, caps: BackendCaps) -> AccelBackend {
    match detected {
        AccelBackend::Metal => {
            if caps.metal {
                detected
            } else {
                AccelBackend::Cpu
            }
        }
        AccelBackend::VulkanDedicated => {
            if caps.vulkan || caps.cuda {
                detected
            } else {
                AccelBackend::Cpu
            }
        }
        AccelBackend::VulkanIntegrated => {
            if caps.vulkan {
                detected
            } else {
                AccelBackend::Cpu
            }
        }
        AccelBackend::Cpu => AccelBackend::Cpu,
    }
}

/// Clase de adaptador de video detectado, para decidir el backend de aceleracion.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AdapterClass {
    /// GPU dedicada (NVIDIA/AMD/Intel Arc).
    Dedicated,
    /// GPU integrada (Intel UHD/Iris, APU Radeon Graphics).
    Integrated,
    /// GPU de Apple Silicon (chip M).
    Apple,
    /// Adaptador no util para acelerar (virtual/basico) o desconocido.
    None,
}

/// Caracteristicas del equipo relevantes para elegir el modelo. Es la frontera
/// pura de este modulo: la deteccion las llena y la recomendacion las consume,
/// de modo que la logica de decision se prueba sin tocar hardware.
#[derive(Debug, Clone, Copy)]
pub struct HardwareSpecs {
    pub total_ram_mb: u64,
    pub cpu_cores: u32,
    /// Backend de aceleracion utilizable (CPU/Vulkan integrada o dedicada/Metal).
    /// La deteccion (`detect_backend`) es conservadora: ante duda o fallo, `Cpu`.
    pub accel: AccelBackend,
}

/// Recomendacion que viaja al frontend. No contiene datos clinicos.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptionRecommendation {
    pub total_ram_mb: u64,
    pub cpu_cores: u32,
    /// `true` si hay aceleracion por GPU de cualquier tipo. Derivado de `accel`;
    /// se conserva por compatibilidad con el frontend.
    pub has_gpu: bool,
    /// Backend de aceleracion: "cpu" | "vulkan-integrated" | "vulkan-dedicated" | "metal".
    pub accel: String,
    /// Etiqueta legible del backend para mostrar al medico.
    pub accel_label: String,
    /// Modelo local sugerido: "small" | "medium" | "large-v3-turbo" | "large-v3".
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
///
/// Con pesos **cuantizados Q5** los modelos ocupan ~1/3 de la RAM que en fp16,
/// por eso el minimo comodo baja a 6 GB (antes 8) y el caballo de batalla en CPU
/// pasa a ser `large-v3-turbo` cuantizado (decoder de 4 capas, rapido en CPU).
const MIN_LOCAL_RAM_MB: u64 = 6 * MB_PER_GB;
const HIGH_TIER_RAM_MB: u64 = 16 * MB_PER_GB;

/// Decide el modelo a partir de las specs. Funcion pura y determinista: toda la
/// politica de seleccion vive aqui para poder probarla sin hardware real.
///
/// Filosofia: el equipo del medico tipico es **CPU-only** o, a lo sumo, con GPU
/// integrada. Por eso la base es `turbo-q5` en CPU; la GPU dedicada y Apple Metal
/// suben a `large-v3-q5`, y solo los equipos muy modestos (CPU + <6 GB) caen a
/// `small-q5` con sugerencia de nube.
pub fn recommend(specs: HardwareSpecs) -> TranscriptionRecommendation {
    let (model, realtime_capable, recommend_cloud_fallback, reason) = match specs.accel {
        AccelBackend::Metal => {
            // Apple Silicon: Metal + memoria unificada. Con 16 GB o mas conviene
            // large-v3-q5 (maxima precision); por debajo, turbo-q5 casi en vivo.
            if specs.total_ram_mb >= HIGH_TIER_RAM_MB {
                (
                    WhisperModel::LargeV3,
                    true,
                    false,
                    "Equipo Apple con chip M (16 GB o mas): large-v3 cuantizado corre acelerado por Metal con maxima precision y casi en vivo.".to_string(),
                )
            } else {
                (
                    WhisperModel::LargeV3Turbo,
                    true,
                    false,
                    "Equipo Apple con chip M: large-v3-turbo cuantizado corre acelerado por Metal, con alta precision y casi en vivo.".to_string(),
                )
            }
        }
        AccelBackend::VulkanDedicated => {
            // GPU dedicada: large-v3-q5 da maxima precision casi en vivo.
            (
                WhisperModel::LargeV3,
                true,
                false,
                "Equipo con GPU dedicada (Vulkan/CUDA): large-v3 cuantizado ofrece la maxima precision clinica con transcripcion casi en vivo.".to_string(),
            )
        }
        AccelBackend::VulkanIntegrated => {
            // GPU integrada: turbo-q5 es liviano y la Vulkan lo lleva casi en vivo.
            (
                WhisperModel::LargeV3Turbo,
                true,
                false,
                "Equipo con GPU integrada (Vulkan): large-v3-turbo cuantizado ofrece alta precision y transcripcion casi en vivo.".to_string(),
            )
        }
        AccelBackend::Cpu => {
            if specs.total_ram_mb < MIN_LOCAL_RAM_MB {
                // Equipo muy modesto: small-q5 corre offline pero lento; se sugiere
                // ademas la nube con consentimiento.
                (
                    WhisperModel::Small,
                    false,
                    true,
                    "El equipo tiene menos de 6 GB de RAM y sin GPU: el modelo pequeno cuantizado funciona sin conexion, pero sera lento. Si quieres mayor velocidad o precision, ofrece la transcripcion en nube con consentimiento del paciente.".to_string(),
                )
            } else {
                // CPU con 6 GB o mas: turbo-q5 es el mejor punto (precision ~large
                // y rapido en CPU). Casi en vivo si la CPU tiene suficientes nucleos.
                let realtime = specs.cpu_cores >= 8;
                let reason = if realtime {
                    "Equipo sin GPU con 6 GB o mas y CPU de 8+ nucleos: large-v3-turbo cuantizado ofrece alta precision clinica con transcripcion agil.".to_string()
                } else {
                    "Equipo sin GPU con 6 GB o mas: large-v3-turbo cuantizado ofrece alta precision clinica; transcribe por lotes (grabas y obtienes el texto al terminar).".to_string()
                };
                (WhisperModel::LargeV3Turbo, realtime, false, reason)
            }
        }
    };

    TranscriptionRecommendation {
        total_ram_mb: specs.total_ram_mb,
        cpu_cores: specs.cpu_cores,
        has_gpu: specs.accel.is_accelerated(),
        accel: specs.accel.id().to_string(),
        accel_label: specs.accel.label().to_string(),
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

    // El backend detectado por hardware se reduce al que el binario realmente
    // trae compilado: un instalador sin Vulkan/Metal/CUDA reporta CPU aunque haya
    // GPU, para no recomendar un modelo que no podria acelerar.
    let accel = effective_backend(detect_backend(), BackendCaps::compiled());
    HardwareSpecs {
        total_ram_mb,
        cpu_cores,
        accel,
    }
}

/* ---------- Deteccion de aceleracion ---------- */

/// Clasifica un nombre de adaptador de video en dedicada / integrada / Apple /
/// ninguna. Funcion pura: la clasificacion se prueba sin hardware. A diferencia
/// de la version anterior (binaria "dedicada o nada"), las GPU integradas ya NO
/// se descartan: aceleran via Vulkan, aunque menos que una dedicada. Los
/// adaptadores virtuales/basicos siguen siendo `None` (conservador).
pub fn classify_adapter(name: &str) -> AdapterClass {
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
        return AdapterClass::None;
    }

    // GPU de Apple Silicon (Metal).
    if n.contains("apple m") {
        return AdapterClass::Apple;
    }

    // Marcadores de GPU dedicada. Deliberadamente especificos para no confundir
    // integradas (p. ej. "radeon graphics" de una APU) con dedicadas.
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
    ];
    if DEDICATED.iter().any(|m| n.contains(m)) {
        return AdapterClass::Dedicated;
    }

    // Marcadores de GPU integrada acelerable via Vulkan.
    const INTEGRATED: &[&str] = &[
        "intel",  // UHD / Iris / HD Graphics
        "uhd",    //
        "iris",   //
        "radeon", // APU "Radeon Graphics" / "Vega" (ya descartadas las dedicadas arriba)
        "vega",   //
        "amd",    //
    ];
    if INTEGRATED.iter().any(|m| n.contains(m)) {
        return AdapterClass::Integrated;
    }

    AdapterClass::None
}

/// Agrega la clasificacion de los adaptadores en un backend de aceleracion.
/// Pura. Prioridad: Apple (Metal) > dedicada > integrada > CPU. En un equipo con
/// integrada + dedicada (laptop tipica) gana la dedicada.
pub fn detect_backend_from_names<I>(names: I) -> AccelBackend
where
    I: IntoIterator<Item = String>,
{
    let mut best = AdapterClass::None;
    for name in names {
        let class = classify_adapter(&name);
        best = match (best, class) {
            (_, AdapterClass::Apple) => return AccelBackend::Metal,
            (AdapterClass::Dedicated, _) => AdapterClass::Dedicated,
            (_, AdapterClass::Dedicated) => AdapterClass::Dedicated,
            (AdapterClass::Integrated, _) => AdapterClass::Integrated,
            (_, AdapterClass::Integrated) => AdapterClass::Integrated,
            (current, AdapterClass::None) => current,
        };
    }
    match best {
        AdapterClass::Dedicated => AccelBackend::VulkanDedicated,
        AdapterClass::Integrated => AccelBackend::VulkanIntegrated,
        // `Apple` ya retorno antes; `None` cae a CPU.
        AdapterClass::Apple | AdapterClass::None => AccelBackend::Cpu,
    }
}

/// Consulta al sistema operativo y devuelve el backend de aceleracion utilizable.
/// Best-effort: si la consulta falla o no hay datos, devuelve `Cpu`.
fn detect_backend() -> AccelBackend {
    detect_backend_from_names(detect_gpu_names())
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
    capture_stdout(
        "sh",
        &["-c", "lspci -mm 2>/dev/null | grep -iE 'vga|3d|display'"],
    )
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

    fn specs(ram_gb: u64, cpu_cores: u32, accel: AccelBackend) -> HardwareSpecs {
        HardwareSpecs {
            total_ram_mb: ram_gb * MB_PER_GB,
            cpu_cores,
            accel,
        }
    }

    #[test]
    fn weak_cpu_machine_gets_small_and_cloud_fallback() {
        let rec = recommend(specs(4, 2, AccelBackend::Cpu));
        assert_eq!(rec.model_id, "small");
        assert!(rec.recommend_cloud_fallback);
        assert!(!rec.realtime_capable);
    }

    #[test]
    fn mid_cpu_machine_gets_turbo_no_cloud() {
        // Con Q5, una CPU de 8 GB ya corre turbo-q5 (antes caia a small).
        let rec = recommend(specs(8, 4, AccelBackend::Cpu));
        assert_eq!(rec.model_id, "large-v3-turbo");
        assert!(!rec.recommend_cloud_fallback);
        // 4 nucleos: por lotes.
        assert!(!rec.realtime_capable);
    }

    #[test]
    fn strong_cpu_machine_with_enough_cores_is_realtime() {
        let rec = recommend(specs(16, 8, AccelBackend::Cpu));
        assert_eq!(rec.model_id, "large-v3-turbo");
        assert!(!rec.recommend_cloud_fallback);
        assert!(rec.realtime_capable);
    }

    #[test]
    fn strong_cpu_machine_few_cores_is_batch_only() {
        let rec = recommend(specs(32, 4, AccelBackend::Cpu));
        assert_eq!(rec.model_id, "large-v3-turbo");
        assert!(!rec.realtime_capable);
    }

    #[test]
    fn integrated_gpu_gets_turbo_realtime() {
        let rec = recommend(specs(8, 4, AccelBackend::VulkanIntegrated));
        assert_eq!(rec.model_id, "large-v3-turbo");
        assert!(rec.realtime_capable);
        assert!(rec.has_gpu);
        assert!(!rec.recommend_cloud_fallback);
    }

    #[test]
    fn dedicated_gpu_gets_large_v3() {
        let rec = recommend(specs(16, 8, AccelBackend::VulkanDedicated));
        assert_eq!(rec.model_id, "large-v3");
        assert!(rec.realtime_capable);
        assert!(rec.has_gpu);
    }

    #[test]
    fn apple_metal_gets_turbo_under_16gb_and_large_at_or_above() {
        // Chip M con poca RAM: turbo-q5 casi en vivo por Metal.
        let small = recommend(specs(8, 8, AccelBackend::Metal));
        assert_eq!(small.model_id, "large-v3-turbo");
        assert!(small.realtime_capable);
        assert!(small.has_gpu);

        // Chip M con 16 GB o mas: large-v3-q5 para maxima precision.
        let big = recommend(specs(16, 8, AccelBackend::Metal));
        assert_eq!(big.model_id, "large-v3");
        assert!(big.realtime_capable);
    }

    #[test]
    fn turbo_q5_is_the_cpu_workhorse() {
        let model = WhisperModel::from_id("large-v3-turbo").expect("turbo debe estar soportado");
        assert_eq!(model.id(), "large-v3-turbo");
        assert_eq!(model.file_name(), "ggml-large-v3-turbo-q5_0.bin");
        assert!(model.label().contains("turbo"));
        assert!(model.disk_mb() < WhisperModel::LargeV3.disk_mb());
    }

    #[test]
    fn all_models_use_quantized_weights() {
        for model in WhisperModel::all() {
            let file = model.file_name();
            assert!(file.contains("q5"), "deberia ser cuantizado Q5: {file}");
        }
    }

    #[test]
    fn recommendation_echoes_detected_specs_and_backend() {
        let rec = recommend(specs(16, 8, AccelBackend::Cpu));
        assert_eq!(rec.total_ram_mb, 16 * MB_PER_GB);
        assert_eq!(rec.cpu_cores, 8);
        assert!(!rec.has_gpu);
        assert_eq!(rec.accel, "cpu");
        assert!(!rec.accel_label.is_empty());
        assert!(rec.model_ram_mb > 0);
        assert!(rec.disk_mb > 0);
        assert!(!rec.reason.is_empty());
    }

    #[test]
    fn backend_id_and_label_are_exposed() {
        let rec = recommend(specs(16, 8, AccelBackend::VulkanIntegrated));
        assert_eq!(rec.accel, "vulkan-integrated");
        assert!(rec.accel_label.contains("integrada"));
    }

    #[test]
    fn boundary_at_six_gb_cpu_is_local() {
        // Exactamente 6 GB ya no se considera "muy modesto": no sugiere nube.
        let rec = recommend(specs(6, 8, AccelBackend::Cpu));
        assert!(!rec.recommend_cloud_fallback);
        assert_eq!(rec.model_id, "large-v3-turbo");
    }

    #[test]
    fn effective_backend_downgrades_to_cpu_when_not_compiled() {
        let none = BackendCaps {
            vulkan: false,
            cuda: false,
            metal: false,
        };
        // Sin features compilados, cualquier GPU detectada cae a CPU.
        for detected in [
            AccelBackend::VulkanIntegrated,
            AccelBackend::VulkanDedicated,
            AccelBackend::Metal,
        ] {
            assert_eq!(effective_backend(detected, none), AccelBackend::Cpu);
        }
    }

    #[test]
    fn effective_backend_keeps_backend_when_compiled() {
        let vulkan = BackendCaps {
            vulkan: true,
            cuda: false,
            metal: false,
        };
        assert_eq!(
            effective_backend(AccelBackend::VulkanIntegrated, vulkan),
            AccelBackend::VulkanIntegrated
        );
        assert_eq!(
            effective_backend(AccelBackend::VulkanDedicated, vulkan),
            AccelBackend::VulkanDedicated
        );

        let metal = BackendCaps {
            vulkan: false,
            cuda: false,
            metal: true,
        };
        assert_eq!(
            effective_backend(AccelBackend::Metal, metal),
            AccelBackend::Metal
        );
    }

    #[test]
    fn cuda_accelerates_dedicated_but_not_integrated() {
        let cuda = BackendCaps {
            vulkan: false,
            cuda: true,
            metal: false,
        };
        // CUDA cubre la GPU dedicada (NVIDIA)...
        assert_eq!(
            effective_backend(AccelBackend::VulkanDedicated, cuda),
            AccelBackend::VulkanDedicated
        );
        // ...pero no la integrada (sin Vulkan, cae a CPU).
        assert_eq!(
            effective_backend(AccelBackend::VulkanIntegrated, cuda),
            AccelBackend::Cpu
        );
        // Metal tampoco sin su feature.
        assert_eq!(
            effective_backend(AccelBackend::Metal, cuda),
            AccelBackend::Cpu
        );
    }

    #[test]
    fn cpu_only_build_with_gpu_recommends_cpu_model() {
        // Regresion del acoplamiento: maquina con GPU dedicada pero binario sin
        // backend de GPU -> efectivo CPU -> turbo-q5 (no large-v3 que correria lento).
        let none = BackendCaps {
            vulkan: false,
            cuda: false,
            metal: false,
        };
        let accel = effective_backend(AccelBackend::VulkanDedicated, none);
        let rec = recommend(specs(32, 8, accel));
        assert_eq!(rec.model_id, "large-v3-turbo");
        assert!(!rec.has_gpu);
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
    fn dedicated_gpus_are_classified_as_dedicated() {
        for name in [
            "NVIDIA GeForce RTX 4060 Laptop GPU",
            "NVIDIA Corporation GA106 [GeForce RTX 3060]",
            "AMD Radeon RX 6700 XT",
            "AMD Radeon Pro 5500M",
            "Intel(R) Arc(TM) A770 Graphics",
        ] {
            assert_eq!(
                classify_adapter(name),
                AdapterClass::Dedicated,
                "deberia ser dedicada: {name}"
            );
        }
    }

    #[test]
    fn apple_silicon_is_classified_as_apple() {
        assert_eq!(classify_adapter("Apple M2 Pro"), AdapterClass::Apple);
        assert_eq!(classify_adapter("Apple M1"), AdapterClass::Apple);
    }

    #[test]
    fn integrated_gpus_are_now_accelerable() {
        // A diferencia de antes, las integradas ya NO se descartan: aceleran via Vulkan.
        for name in [
            "Intel(R) UHD Graphics 630",
            "Intel(R) Iris(R) Xe Graphics",
            "AMD Radeon(TM) Graphics", // APU integrada
            "AMD Radeon(TM) Vega 8 Graphics",
        ] {
            assert_eq!(
                classify_adapter(name),
                AdapterClass::Integrated,
                "deberia ser integrada: {name}"
            );
        }
    }

    #[test]
    fn virtual_and_unknown_adapters_are_none() {
        for name in ["Microsoft Basic Display Adapter", "VMware SVGA 3D", ""] {
            assert_eq!(
                classify_adapter(name),
                AdapterClass::None,
                "deberia ser ninguna: {name}"
            );
        }
    }

    #[test]
    fn backend_aggregator_prefers_strongest_adapter() {
        // Laptop tipica: integrada + dedicada -> gana la dedicada.
        let mixed = vec![
            "Intel(R) UHD Graphics 630".to_string(),
            "NVIDIA GeForce RTX 3070".to_string(),
        ];
        assert_eq!(detect_backend_from_names(mixed), AccelBackend::VulkanDedicated);

        // Solo integrada -> Vulkan integrada (ahora si acelera).
        let integrated = vec!["Intel(R) Iris(R) Xe Graphics".to_string()];
        assert_eq!(
            detect_backend_from_names(integrated),
            AccelBackend::VulkanIntegrated
        );

        // Apple Silicon -> Metal, aunque haya otros adaptadores.
        let apple = vec!["Apple M3 Max".to_string()];
        assert_eq!(detect_backend_from_names(apple), AccelBackend::Metal);

        // Solo virtual o sin adaptadores -> conservador: CPU.
        assert_eq!(
            detect_backend_from_names(vec!["VMware SVGA 3D".to_string()]),
            AccelBackend::Cpu
        );
        assert_eq!(
            detect_backend_from_names(Vec::<String>::new()),
            AccelBackend::Cpu
        );
    }
}
