//! Gestor de descarga de los modelos ONNX de diarizacion local (sherpa-onnx).
//!
//! La diarizacion offline de sherpa-onnx usa DOS modelos que corren EN EL
//! DISPOSITIVO (local-first): uno de **segmentacion** (cuando hay voz, derivado de
//! `pyannote/segmentation-3.0`) y uno de **embedding de hablante** (quien habla,
//! estilo WeSpeaker/3D-Speaker). Igual que los pesos de Whisper (paso 15), son
//! REFERENCIA publica (no PHI) y se comparten entre perfiles: viven en
//! `app_data_dir/models/`.
//!
//! Este modulo solo define el catalogo descargable (de donde bajar cada `.onnx` y
//! como validarlo). Reutiliza las primitivas puras y testeadas de
//! `transcription_model` (rutas, holgura de disco, reanudacion, checksum, estado),
//! para no duplicar logica. La descarga por red vive en `lib.rs` (frontera fina).
//!
//! Los `.onnx` se rehospedan sin cambios en el release `modelos-diarizacion-v1`
//! del repositorio (2026-10-18), con sus licencias: segmentacion MIT (pyannote) y
//! embedding CC BY 4.0 (WeSpeaker/VoxCeleb). URL, SHA-256 y tamano quedan fijados
//! aqui y siguen siendo configurables por build (`MIDOC_DIARIZE_*`). Un archivo
//! que no coincide con su SHA-256 no se acepta.

use crate::transcription_model::ModelAsset;

/// Modelo ONNX que necesita la diarizacion. Los dos son obligatorios: sin ambos no
/// se puede separar hablantes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiarizationModel {
    /// Segmentacion de voz (cuando hay habla): pyannote-segmentation-3.0 en ONNX.
    Segmentation,
    /// Embedding de hablante (quien habla): WeSpeaker CAM++ (voxceleb) en ONNX.
    Embedding,
}

impl DiarizationModel {
    /// Identificador estable para el frontend y para los comandos.
    pub fn id(self) -> &'static str {
        match self {
            DiarizationModel::Segmentation => "diarization-segmentation",
            DiarizationModel::Embedding => "diarization-embedding",
        }
    }

    pub fn from_id(id: &str) -> Option<Self> {
        match id {
            "diarization-segmentation" => Some(DiarizationModel::Segmentation),
            "diarization-embedding" => Some(DiarizationModel::Embedding),
            _ => None,
        }
    }

    /// Nombre del archivo `.onnx` en disco (estable y seguro para el sistema de
    /// archivos; independiente de la URL de origen).
    pub fn file_name(self) -> &'static str {
        match self {
            DiarizationModel::Segmentation => "sherpa-segmentation-3.0.onnx",
            DiarizationModel::Embedding => "sherpa-embedding-campplus.onnx",
        }
    }

    pub fn all() -> [DiarizationModel; 2] {
        [DiarizationModel::Segmentation, DiarizationModel::Embedding]
    }
}

/// URL de descarga del modelo. Configurable por build (`MIDOC_DIARIZE_*_URL`); por
/// defecto, el release del repositorio que los rehospeda.
fn model_url(model: DiarizationModel) -> String {
    let configured = match model {
        DiarizationModel::Segmentation => option_env!("MIDOC_DIARIZE_SEGMENTATION_URL"),
        DiarizationModel::Embedding => option_env!("MIDOC_DIARIZE_EMBEDDING_URL"),
    };
    if let Some(url) = configured {
        if !url.trim().is_empty() {
            return url.trim().to_string();
        }
    }
    match model {
        DiarizationModel::Segmentation => {
            format!("{MODELS_RELEASE}/pyannote-segmentation-3.0.onnx")
        }
        // `++` codificado en la URL del archivo `wespeaker_en_voxceleb_CAM++.onnx`.
        DiarizationModel::Embedding => {
            format!("{MODELS_RELEASE}/wespeaker_en_voxceleb_CAM%2B%2B.onnx")
        }
    }
}

/// Release del repositorio que rehospeda los modelos (ver su `LICENCIAS.md`).
const MODELS_RELEASE: &str =
    "https://github.com/ZhadowIA/sistema-midoc/releases/download/modelos-diarizacion-v1";

/// SHA-256 del modelo: el del archivo rehospedado, o el que fije el build
/// (`MIDOC_DIARIZE_*_SHA256`) si apunta a otra copia.
fn model_sha256(model: DiarizationModel) -> String {
    let configured = match model {
        DiarizationModel::Segmentation => option_env!("MIDOC_DIARIZE_SEGMENTATION_SHA256"),
        DiarizationModel::Embedding => option_env!("MIDOC_DIARIZE_EMBEDDING_SHA256"),
    };
    let pinned = match model {
        DiarizationModel::Segmentation => {
            "220ad67ca923bef2fa91f2390c786097bf305bceb5e261d4af67b38e938e1079"
        }
        DiarizationModel::Embedding => {
            "c46fad10b5f81e1aa4a60c162714208577093655076c5450f8c469e522ec54ef"
        }
    };
    configured
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(pinned)
        .to_lowercase()
}

/// Tamano exacto del `.onnx` (bytes), para detectar descargas corruptas. Fijable
/// por build (`MIDOC_DIARIZE_*_SIZE_BYTES`); por defecto, el del archivo rehospedado.
fn model_download_size(model: DiarizationModel) -> u64 {
    let configured = match model {
        DiarizationModel::Segmentation => option_env!("MIDOC_DIARIZE_SEGMENTATION_SIZE_BYTES"),
        DiarizationModel::Embedding => option_env!("MIDOC_DIARIZE_EMBEDDING_SIZE_BYTES"),
    };
    if let Some(raw) = configured {
        if let Ok(size) = raw.trim().parse::<u64>() {
            if size > 0 {
                return size;
            }
        }
    }
    match model {
        DiarizationModel::Segmentation => 5_992_913,
        DiarizationModel::Embedding => 29_292_684,
    }
}

fn asset_of(model: DiarizationModel) -> ModelAsset {
    ModelAsset {
        model_id: model.id().to_string(),
        file_name: model.file_name().to_string(),
        url: model_url(model),
        sha256: model_sha256(model),
        size_bytes: model_download_size(model),
    }
}

/// Todos los assets de diarizacion (segmentacion + embedding).
pub fn all_assets() -> Vec<ModelAsset> {
    DiarizationModel::all().into_iter().map(asset_of).collect()
}

/// Asset por su identificador estable. `None` si no se reconoce.
pub fn asset_for(model_id: &str) -> Option<ModelAsset> {
    DiarizationModel::from_id(model_id).map(asset_of)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn assets_cover_both_models_and_reject_unknown() {
        assert_eq!(all_assets().len(), 2);
        assert_eq!(
            asset_for("diarization-segmentation").unwrap().file_name,
            "sherpa-segmentation-3.0.onnx"
        );
        assert_eq!(
            asset_for("diarization-embedding").unwrap().file_name,
            "sherpa-embedding-campplus.onnx"
        );
        assert!(asset_for("../etc/passwd").is_none());
        assert!(
            asset_for("small").is_none(),
            "no se mezcla con modelos de Whisper"
        );
        assert!(asset_for("").is_none());
    }

    #[test]
    fn default_urls_point_to_the_rehosted_files() {
        let seg = asset_for("diarization-segmentation").unwrap();
        assert!(seg.url.ends_with("/pyannote-segmentation-3.0.onnx"));

        let emb = asset_for("diarization-embedding").unwrap();
        // `++` codificado en la URL.
        assert!(emb.url.ends_with("/wespeaker_en_voxceleb_CAM%2B%2B.onnx"));
    }

    #[test]
    fn assets_use_exact_download_sizes_for_corruption_checks() {
        assert_eq!(
            asset_for("diarization-segmentation").unwrap().size_bytes,
            5_992_913
        );
        assert_eq!(
            asset_for("diarization-embedding").unwrap().size_bytes,
            29_292_684
        );
    }

    #[test]
    fn models_come_from_the_rehosted_release_with_pinned_checksums() {
        // Sin override de build: el release del repositorio, con SHA-256 fijado
        // para que una descarga alterada o corrupta no se acepte.
        for asset in all_assets() {
            assert!(
                asset.url.starts_with(MODELS_RELEASE),
                "{} desde el release rehospedado",
                asset.model_id
            );
            assert_eq!(asset.sha256.len(), 64, "{} con SHA-256", asset.model_id);
            assert!(asset.sha256.chars().all(|c| c.is_ascii_hexdigit()));
        }
    }

    #[test]
    fn model_id_round_trips() {
        for model in DiarizationModel::all() {
            assert_eq!(DiarizationModel::from_id(model.id()), Some(model));
        }
    }
}
