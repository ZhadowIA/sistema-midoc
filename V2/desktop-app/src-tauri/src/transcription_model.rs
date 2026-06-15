//! Gestor de descarga del modelo Whisper local (paso 15, rebanada 1).
//!
//! La transcripcion corre EN EL DISPOSITIVO (local-first): antes de transcribir,
//! el medico debe tener descargados los pesos del modelo recomendado. Este modulo
//! resuelve de donde bajar cada modelo y como validarlo, valida el espacio en
//! disco, y calcula el estado/progreso para la UI. La descarga por red (reqwest)
//! vive en `lib.rs` como frontera fina (regla 5: el contrato real con la fuente se
//! verifica en staging); aqui solo esta la logica pura y testeable.
//!
//! Los pesos son REFERENCIA publica (no PHI) y se comparten entre perfiles de
//! medico: viven en `app_data_dir/models/`, no por perfil. Este modulo no toca la
//! base cifrada ni datos clinicos.

use std::path::{Path, PathBuf};

use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::transcription::WhisperModel;

/// Holgura de disco que se exige por encima del tamano del modelo, para no dejar
/// el disco al limite tras la descarga.
const DISK_HEADROOM_BYTES: u64 = 512 * 1024 * 1024;

/// Asset descargable de un modelo: de donde bajarlo y como validarlo.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ModelAsset {
    pub model_id: String,
    pub file_name: String,
    pub url: String,
    /// SHA-256 en hex del archivo completo. Vacio = no fijado en este build; sin
    /// el la descarga no puede verificarse criptograficamente (se fija en staging,
    /// regla 5). El modelo descargado sigue siendo usable, pero se marca como no
    /// verificado para que la UI sea honesta.
    pub sha256: String,
    pub size_bytes: u64,
}

/// Estado de un modelo para la UI: presente/verificado y progreso de descarga.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ModelStatus {
    pub model_id: String,
    pub file_name: String,
    pub expected_size_bytes: u64,
    /// Bytes en disco: del archivo final si esta presente, o del `.part` en curso.
    pub downloaded_bytes: u64,
    /// El archivo final de pesos existe (descarga completa).
    pub present: bool,
    /// El checksum del archivo final coincide con el fijado. `false` si no hay
    /// checksum fijado en este build (aunque el archivo este presente).
    pub verified: bool,
    /// Hay una descarga en curso para este modelo.
    pub downloading: bool,
    /// Ultimo error de descarga, si lo hubo.
    pub error: Option<String>,
}

/// URL de descarga del modelo. Configurable por build (`MIDOC_WHISPER_*_URL`); por
/// defecto, el repositorio publico de pesos GGML de whisper.cpp.
fn model_url(model: WhisperModel) -> String {
    let configured = match model {
        WhisperModel::Small => option_env!("MIDOC_WHISPER_SMALL_URL"),
        WhisperModel::Medium => option_env!("MIDOC_WHISPER_MEDIUM_URL"),
        WhisperModel::LargeV3 => option_env!("MIDOC_WHISPER_LARGE_URL"),
    };
    if let Some(url) = configured {
        if !url.trim().is_empty() {
            return url.trim().to_string();
        }
    }
    format!(
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/{}",
        model.file_name()
    )
}

/// SHA-256 fijado del modelo, si el build lo aporta (`MIDOC_WHISPER_*_SHA256`).
fn model_sha256(model: WhisperModel) -> String {
    let configured = match model {
        WhisperModel::Small => option_env!("MIDOC_WHISPER_SMALL_SHA256"),
        WhisperModel::Medium => option_env!("MIDOC_WHISPER_MEDIUM_SHA256"),
        WhisperModel::LargeV3 => option_env!("MIDOC_WHISPER_LARGE_SHA256"),
    };
    configured.unwrap_or("").trim().to_lowercase()
}

fn asset_of(model: WhisperModel) -> ModelAsset {
    ModelAsset {
        model_id: model.id().to_string(),
        file_name: model.file_name().to_string(),
        url: model_url(model),
        sha256: model_sha256(model),
        size_bytes: model.approx_size_bytes(),
    }
}

/// Todos los assets descargables, de menor a mayor exigencia.
pub fn all_assets() -> Vec<ModelAsset> {
    WhisperModel::all().into_iter().map(asset_of).collect()
}

/// Asset de un modelo por su identificador estable. `None` si no se reconoce.
pub fn asset_for(model_id: &str) -> Option<ModelAsset> {
    WhisperModel::from_id(model_id).map(asset_of)
}

/// Directorio compartido (entre perfiles) donde viven los pesos de los modelos.
pub fn models_dir(base_dir: &Path) -> PathBuf {
    base_dir.join("models")
}

/// Ruta del archivo final de pesos de un modelo.
pub fn model_path(base_dir: &Path, file_name: &str) -> PathBuf {
    models_dir(base_dir).join(file_name)
}

/// Ruta del archivo parcial (`.part`) durante la descarga.
pub fn part_path(final_path: &Path) -> PathBuf {
    let mut name = final_path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    name.push_str(".part");
    final_path.with_file_name(name)
}

/// Espacio en disco que conviene tener libre para descargar el modelo: su tamano
/// mas una holgura para el sistema.
pub fn required_free_bytes(size_bytes: u64) -> u64 {
    size_bytes.saturating_add(DISK_HEADROOM_BYTES)
}

/// `true` si el espacio libre alcanza para la descarga con holgura.
pub fn has_enough_disk(free_bytes: u64, required_bytes: u64) -> bool {
    free_bytes >= required_bytes
}

/// Offset desde el que reanudar una descarga parcial. Si el `.part` ya alcanza o
/// supera el total (corrupto o tamano mal estimado), se reinicia desde cero.
pub fn resume_from(part_len: u64, total_bytes: u64) -> u64 {
    if total_bytes > 0 && part_len < total_bytes {
        part_len
    } else {
        0
    }
}

fn hex_lower(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push_str(&format!("{b:02x}"));
    }
    out
}

/// Verifica un hash hex contra el esperado. `false` si el esperado esta vacio
/// (no hay checksum fijado: no se puede afirmar integridad).
pub fn matches_sha256(actual_hex: &str, expected_hex: &str) -> bool {
    !expected_hex.is_empty() && actual_hex.eq_ignore_ascii_case(expected_hex)
}

/// Calcula el SHA-256 de un archivo (streaming, sin cargarlo entero en memoria) y
/// lo compara con el esperado. `false` si el esperado esta vacio (sin checksum
/// fijado no se afirma integridad).
pub fn verify_file(path: &Path, expected_sha256: &str) -> std::io::Result<bool> {
    use std::io::Read;
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 1024 * 64];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    let actual = hex_lower(&hasher.finalize());
    Ok(matches_sha256(&actual, expected_sha256))
}

/// Construye el estado de un modelo a partir de las observaciones de disco y del
/// estado de descarga en curso. Funcion pura: la IO la hace el llamador.
#[allow(clippy::too_many_arguments)]
pub fn build_status(
    asset: &ModelAsset,
    final_present: bool,
    final_len: u64,
    part_len: u64,
    verified: bool,
    downloading: bool,
    error: Option<String>,
) -> ModelStatus {
    ModelStatus {
        model_id: asset.model_id.clone(),
        file_name: asset.file_name.clone(),
        expected_size_bytes: asset.size_bytes,
        downloaded_bytes: if final_present { final_len } else { part_len },
        present: final_present,
        verified: final_present && verified,
        downloading,
        error,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn assets_cover_supported_models_and_reject_unknown() {
        assert_eq!(all_assets().len(), 3);
        assert_eq!(asset_for("small").unwrap().file_name, "ggml-small.bin");
        assert_eq!(asset_for("medium").unwrap().file_name, "ggml-medium.bin");
        assert_eq!(asset_for("large-v3").unwrap().file_name, "ggml-large-v3.bin");
        assert!(asset_for("../etc/passwd").is_none());
        assert!(asset_for("").is_none());
    }

    #[test]
    fn default_url_points_to_whisper_cpp_weights() {
        let small = asset_for("small").unwrap();
        // Sin override de build, la URL apunta al repositorio publico de pesos.
        assert!(small.url.contains("whisper.cpp"));
        assert!(small.url.ends_with("ggml-small.bin"));
        assert!(small.size_bytes > 0);
    }

    #[test]
    fn paths_live_under_shared_models_dir() {
        let base = Path::new("C:/MiDocData");
        assert_eq!(models_dir(base), base.join("models"));
        assert_eq!(
            model_path(base, "ggml-small.bin"),
            base.join("models").join("ggml-small.bin")
        );
        let p = model_path(base, "ggml-small.bin");
        assert_eq!(part_path(&p), base.join("models").join("ggml-small.bin.part"));
    }

    #[test]
    fn disk_check_demands_headroom_over_model_size() {
        let size = 500 * 1024 * 1024;
        let required = required_free_bytes(size);
        assert!(required > size, "exige holgura sobre el tamano del modelo");
        assert!(has_enough_disk(required, required));
        assert!(!has_enough_disk(required - 1, required));
    }

    #[test]
    fn resume_continues_partial_and_restarts_when_corrupt() {
        assert_eq!(resume_from(0, 1000), 0);
        assert_eq!(resume_from(400, 1000), 400, "continua desde lo descargado");
        assert_eq!(resume_from(1000, 1000), 0, "reinicia si el .part esta completo o pasado");
        assert_eq!(resume_from(1200, 1000), 0);
        assert_eq!(resume_from(400, 0), 0, "sin total conocido, reinicia");
    }

    #[test]
    fn matches_sha256_requires_a_pinned_hash() {
        let known = "b221d9dbb083a7f33428d7c2a3c3198ae925614d70210e28716ccaa7cd4ddb79";
        assert!(matches_sha256(known, known));
        assert!(matches_sha256(&known.to_uppercase(), known), "compara sin distinguir caso");
        assert!(!matches_sha256(known, "deadbeef"));
        assert!(!matches_sha256(known, ""), "sin hash fijado no se afirma integridad");
    }

    #[test]
    fn verify_file_streams_and_checks_pinned_hash() {
        // SHA-256("hola") conocido.
        let known = "b221d9dbb083a7f33428d7c2a3c3198ae925614d70210e28716ccaa7cd4ddb79";
        let path = std::env::temp_dir().join(format!(
            "midoc-verify-{}.bin",
            std::process::id()
        ));
        std::fs::write(&path, b"hola").unwrap();

        assert!(verify_file(&path, known).unwrap(), "el archivo coincide con su hash");
        assert!(!verify_file(&path, "deadbeef").unwrap(), "hash distinto no coincide");
        assert!(
            !verify_file(&path, "").unwrap(),
            "sin checksum fijado no se afirma integridad"
        );

        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn status_reflects_present_partial_and_unverified_states() {
        let asset = asset_for("small").unwrap();

        let present = build_status(&asset, true, asset.size_bytes, 0, true, false, None);
        assert!(present.present && present.verified && !present.downloading);
        assert_eq!(present.downloaded_bytes, asset.size_bytes);

        // Presente pero sin checksum fijado -> no verificado.
        let unverified = build_status(&asset, true, asset.size_bytes, 0, false, false, None);
        assert!(unverified.present && !unverified.verified);

        // Descarga parcial en curso: usa los bytes del .part.
        let partial = build_status(&asset, false, 0, 1234, false, true, None);
        assert!(!partial.present && partial.downloading);
        assert_eq!(partial.downloaded_bytes, 1234);

        let failed = build_status(&asset, false, 0, 0, false, false, Some("sin red".into()));
        assert_eq!(failed.error.as_deref(), Some("sin red"));
    }
}
