//! Punta a punta de la diarizacion local (paso 22) con audio real: Whisper local
//! y sherpa-onnx nativos, por el mismo camino gobernado que el comando
//! `ai_diarize_consultation` (consentimiento de voz, presupuesto, traza DRAFT y
//! audio transitorio). Solo existe con los dos features nativos.
//!
//! Variables:
//!   MIDOC_E2E_AUDIO          archivo de audio con dos voces (WAV, MP3 o M4A)
//!   MIDOC_E2E_MEDIA_TYPE     tipo del archivo (por omision audio/wav)
//!   MIDOC_TEST_WHISPER_MODEL modelo GGML de Whisper
//!   MIDOC_E2E_APP_DIR        carpeta de datos de la app (con `models/` y los dos `.onnx`)
//!   MIDOC_E2E_SPEAKERS       hablantes esperados (por omision 2; 0 = Auto)
//!
//! Imprime tiempos, hablantes y turnos (inicio, fin, rol y numero de palabras),
//! nunca el texto: el audio de prueba puede ser de personas reales.
//!   cargo test --release --lib --features "whisper-local diarization-local" \
//!     diarization_e2e -- --ignored --nocapture

use std::path::PathBuf;
use std::time::Instant;

use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};

use crate::ai::{self, AudioInput};
use crate::db::open_encrypted;
use crate::diarization::ScribeRole;
use crate::whisper_provider::WhisperLocalProvider;
use crate::{diarization_model, sherpa_diarization, transcription_model};

fn env(key: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| panic!("falta {key}"))
}

fn test_conn() -> Connection {
    let dir = std::env::temp_dir().join(format!("midoc-diarization-e2e-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    open_encrypted(&dir.join("test.db"), "clave-de-prueba").unwrap()
}

fn seed_encounter(conn: &Connection) -> (String, String) {
    conn.execute(
        "INSERT INTO patients (id, first_name, last_name, created_at, updated_at)
         VALUES ('pat-e2e', 'Paciente', 'De Prueba', '2026-10-27', '2026-10-27')",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO encounters (id, patient_id, status, opened_at)
         VALUES ('enc-e2e', 'pat-e2e', 'OPEN', '2026-10-27')",
        params![],
    )
    .unwrap();
    ("enc-e2e".into(), "pat-e2e".into())
}

fn clock(cs: i64) -> String {
    format!("{:02}:{:05.2}", cs / 6000, (cs % 6000) as f64 / 100.0)
}

/// Solo sherpa-onnx, sin Whisper (minutos en lugar de horas): imprime los tramos
/// de hablante tal cual salen del motor, para afinar el umbral o distinguir un
/// problema del motor de uno de la fusion con el texto.
#[test]
#[ignore = "necesita audio real y los modelos de diarizacion"]
fn speaker_segments_of_a_real_recording() {
    let media_type = std::env::var("MIDOC_E2E_MEDIA_TYPE").unwrap_or_else(|_| "audio/wav".into());
    let speakers: u8 = std::env::var("MIDOC_E2E_SPEAKERS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(crate::diarization::DEFAULT_NUM_SPEAKERS);
    let app_dir = PathBuf::from(env("MIDOC_E2E_APP_DIR"));
    let path_of = |id: &str| {
        let asset = diarization_model::asset_for(id).unwrap();
        transcription_model::model_path(&app_dir, &asset.file_name)
    };
    let bytes = std::fs::read(env("MIDOC_E2E_AUDIO")).unwrap();
    let decoded = crate::audio::decode_audio_to_whisper(&bytes, &media_type).unwrap();
    let started = Instant::now();
    let segments = sherpa_diarization::diarize_samples(
        &decoded.samples,
        16_000,
        &path_of("diarization-segmentation"),
        &path_of("diarization-embedding"),
        speakers,
    )
    .unwrap();
    println!(
        "{} tramos en {:.1} s",
        segments.len(),
        started.elapsed().as_secs_f64()
    );
    for segment in &segments {
        println!(
            "  {} - {}  hablante {}",
            clock(segment.start_cs),
            clock(segment.end_cs),
            segment.speaker_idx
        );
    }
    assert!(!segments.is_empty());
}

#[test]
#[ignore = "necesita audio real, el modelo de Whisper y los modelos de diarizacion"]
fn diarizes_a_real_two_voice_recording() {
    let audio_path = PathBuf::from(env("MIDOC_E2E_AUDIO"));
    let media_type = std::env::var("MIDOC_E2E_MEDIA_TYPE").unwrap_or_else(|_| "audio/wav".into());
    let speakers: u8 = std::env::var("MIDOC_E2E_SPEAKERS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(crate::diarization::DEFAULT_NUM_SPEAKERS);
    let app_dir = PathBuf::from(env("MIDOC_E2E_APP_DIR"));

    // Las mismas rutas que arma la app (`diarization_model_paths`), y las huellas
    // fijadas: el modelo que se prueba es el que la app descarga.
    let path_of = |id: &str| {
        let asset = diarization_model::asset_for(id).unwrap();
        let path = transcription_model::model_path(&app_dir, &asset.file_name);
        let bytes = std::fs::read(&path).unwrap_or_else(|_| panic!("falta {}", path.display()));
        let digest: String = Sha256::digest(&bytes)
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect();
        assert_eq!(
            digest, asset.sha256,
            "{} no coincide con su SHA-256",
            asset.file_name
        );
        path
    };
    let segmentation = path_of("diarization-segmentation");
    let embedding = path_of("diarization-embedding");

    let conn = test_conn();
    let (encounter_id, patient_id) = seed_encounter(&conn);
    ai::grant_consent(&conn, &patient_id, ai::SCOPE_VOICE_TRANSCRIPTION).unwrap();

    let bytes = std::fs::read(&audio_path).unwrap();
    let decoded = crate::audio::decode_audio_to_whisper(&bytes, &media_type)
        .expect("el audio debe decodificarse");
    let duration_s = decoded.samples.len() as f64 / 16_000.0;
    println!(
        "audio: {:.1} min, {:.1} MB, {media_type}",
        duration_s / 60.0,
        bytes.len() as f64 / 1_048_576.0
    );

    let provider =
        WhisperLocalProvider::new("e2e", PathBuf::from(env("MIDOC_TEST_WHISPER_MODEL")), None);
    let diarize_time = std::cell::Cell::new(0.0f64);
    let diarizer = |samples: &[f32], rate: u32| {
        let started = Instant::now();
        let result =
            sherpa_diarization::diarize_samples(samples, rate, &segmentation, &embedding, speakers);
        diarize_time.set(started.elapsed().as_secs_f64());
        result
    };

    let started = Instant::now();
    let draft = ai::diarize_consultation(
        &conn,
        &encounter_id,
        AudioInput {
            file_name: audio_path
                .file_name()
                .map(|n| n.to_string_lossy().into_owned()),
            media_type: media_type.clone(),
            bytes,
            duration_seconds: Some(duration_s.ceil() as i64),
        },
        &provider,
        &diarizer,
    )
    .expect("la diarizacion gobernada debe completar");
    let total = started.elapsed().as_secs_f64();

    let mut speaker_ids: Vec<&str> = draft.turns.iter().map(|t| t.speaker_id.as_str()).collect();
    speaker_ids.sort_unstable();
    speaker_ids.dedup();
    println!(
        "tiempo: total {total:.1} s, diarizacion {:.1} s ({:.2}x tiempo real en total)",
        diarize_time.get(),
        total / duration_s
    );
    println!(
        "diarizado: {} | hablantes: {} | turnos: {}",
        draft.diarized,
        speaker_ids.len(),
        draft.turns.len()
    );
    for role in [ScribeRole::Medico, ScribeRole::Paciente] {
        let turns: Vec<_> = draft.turns.iter().filter(|t| t.role == role).collect();
        let seconds: i64 = turns.iter().map(|t| t.end_cs - t.start_cs).sum::<i64>() / 100;
        let words: usize = turns
            .iter()
            .map(|t| t.text.split_whitespace().count())
            .sum();
        println!(
            "  {role:?}: {} turnos, {seconds} s, {words} palabras",
            turns.len()
        );
    }
    for turn in &draft.turns {
        println!(
            "  {} - {}  {:<8} {:>4} palabras",
            clock(turn.start_cs),
            clock(turn.end_cs),
            format!("{:?}", turn.role),
            turn.text.split_whitespace().count()
        );
    }
    if let Ok(path) = std::env::var("MIDOC_E2E_DUMP") {
        // Para revisar a mano los turnos con su texto; queda fuera del repo.
        std::fs::write(path, serde_json::to_string_pretty(&draft.turns).unwrap()).unwrap();
    }

    assert!(draft.diarized, "debe separar hablantes con el motor nativo");
    assert_eq!(draft.audio_retention_policy, ai::AUDIO_RETENTION_DISCARD);
    assert!(draft.turns.len() >= 2);
    if speakers == 2 {
        assert_eq!(speaker_ids.len(), 2, "consulta tipica: dos hablantes");
    }
    // Los turnos van en orden y no se enciman.
    for pair in draft.turns.windows(2) {
        assert!(pair[0].start_cs <= pair[1].start_cs);
    }
    // La traza queda como borrador, sin audio.
    let status: String = conn
        .query_row(
            "SELECT status FROM ai_runs WHERE id = ?1",
            params![draft.run_id],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(status, "DRAFT");
}
