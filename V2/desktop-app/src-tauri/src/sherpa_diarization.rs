//! Diarizacion local (separacion de hablantes) con sherpa-onnx.
//!
//! sherpa-onnx trabaja APARTE de Whisper: analiza la forma de onda del audio (no el
//! texto) y produce tramos de hablante con marcas de tiempo. El pegamento con la
//! transcripcion es la fusion por solape temporal en `diarization::merge_*`.
//!
//! El binding nativo (crate oficial `sherpa-onnx`, que enlaza sherpa-onnx + ONNX Runtime)
//! vive tras el feature `diarization-local`, igual que `whisper_provider` tras
//! `whisper-local`: el build por defecto y las pruebas NO necesitan la cadena
//! nativa. Cuando el feature esta apagado, `diarize_samples` devuelve vacio y el
//! flujo degrada a una transcripcion sin separacion (el medico divide los turnos a
//! mano). El binding real se compila y verifica en staging (regla 5), como el de
//! Whisper en el paso 15.
//!
//! Aislamiento: un fallo nativo de sherpa-onnx (se vio `STATUS_ACCESS_VIOLATION`
//! con audio real, 2026-10-27) tumbaria el proceso entero de la app. Por eso la app
//! no llama al motor en su propio proceso: `diarize_isolated` relanza el mismo
//! ejecutable en modo trabajador (`WORKER_ARG`), le pasa las muestras por stdin y
//! lee los tramos por stdout. Si el trabajador truena, se cuelga o sale con error,
//! la consulta degrada a transcripcion sin separacion en lugar de cerrar la app.
//!
//! Residencia: corre 100% en el equipo sobre muestras en memoria; el audio viaja al
//! trabajador por una tuberia, nunca por disco ni por red.

use std::io::{Read, Write};
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use crate::ai::AiError;
use crate::diarization::SpeakerSegment;

/// Primer argumento con el que la app se relanza como trabajador de diarizacion.
pub const WORKER_ARG: &str = "--midoc-diarize-worker";

/// Codigo de salida del trabajador cuando el motor devuelve error (no truena).
const WORKER_ENGINE_ERROR: i32 = 2;

/// Umbral de clustering para el modo Auto. Afinable con audio real en staging via
/// `MIDOC_DIARIZE_THRESHOLD`; si no esta o es invalido, usa el default de sherpa.
#[cfg(feature = "diarization-local")]
fn resolve_threshold() -> f32 {
    std::env::var("MIDOC_DIARIZE_THRESHOLD")
        .ok()
        .and_then(|v| v.parse::<f32>().ok())
        .filter(|t| *t > 0.0)
        .unwrap_or(crate::diarization::DEFAULT_DIARIZE_THRESHOLD)
}

/// Separa hablantes en las muestras dadas (f32 mono al `sample_rate` indicado, por
/// convencion 16 kHz). `num_speakers` fija el numero esperado de hablantes; `0`
/// (Auto) deja que sherpa lo ESTIME con el umbral. Devuelve tramos de hablante con
/// marcas de tiempo en centisegundos.
///
/// Corre el motor en ESTE proceso: la app no la llama directo, sino via
/// `diarize_isolated`; aqui solo entra el trabajador (y las pruebas nativas).
///
/// Variante REAL (feature `diarization-local`): corre la diarizacion offline de
/// sherpa-onnx con el modelo de segmentacion y el de embedding descargados.
#[cfg(feature = "diarization-local")]
pub fn diarize_samples(
    samples: &[f32],
    sample_rate: u32,
    segmentation_model: &Path,
    embedding_model: &Path,
    num_speakers: u8,
) -> Result<Vec<SpeakerSegment>, AiError> {
    use sherpa_onnx::{
        FastClusteringConfig, OfflineSpeakerDiarization, OfflineSpeakerDiarizationConfig,
        OfflineSpeakerSegmentationModelConfig, OfflineSpeakerSegmentationPyannoteModelConfig,
        SpeakerEmbeddingExtractorConfig,
    };

    let seg = segmentation_model
        .to_str()
        .ok_or_else(|| AiError::Invalid("ruta del modelo de segmentacion invalida".into()))?;
    let emb = embedding_model
        .to_str()
        .ok_or_else(|| AiError::Invalid("ruta del modelo de embedding invalida".into()))?;

    // Auto (num_speakers == 0): num_clusters <= 0 hace que sherpa estime el numero
    // con el umbral. Fijo (> 0): lo pina y maximiza precision (consulta tipica = 2).
    let (num_clusters, threshold) =
        crate::diarization::clustering_params(num_speakers, resolve_threshold());
    let config = OfflineSpeakerDiarizationConfig {
        segmentation: OfflineSpeakerSegmentationModelConfig {
            pyannote: OfflineSpeakerSegmentationPyannoteModelConfig {
                model: Some(seg.to_string()),
                ..Default::default()
            },
            ..Default::default()
        },
        embedding: SpeakerEmbeddingExtractorConfig {
            model: Some(emb.to_string()),
            ..Default::default()
        },
        clustering: FastClusteringConfig {
            num_clusters,
            threshold,
            ..Default::default()
        },
        ..Default::default()
    };

    let diarizer = OfflineSpeakerDiarization::create(&config)
        .ok_or_else(|| AiError::Invalid("no se pudo iniciar la diarizacion".into()))?;

    // sherpa-onnx asume 16 kHz mono; si la captura cambia, hay que remuestrear antes.
    if diarizer.sample_rate() != sample_rate as i32 {
        return Err(AiError::Invalid(format!(
            "la diarizacion espera {} Hz y el audio viene a {sample_rate} Hz",
            diarizer.sample_rate()
        )));
    }

    let result = diarizer
        .process(samples)
        .ok_or_else(|| AiError::Invalid("fallo la diarizacion".into()))?;

    // sherpa-onnx entrega `start`/`end` en segundos (f32) y `speaker` como indice.
    Ok(result
        .sort_by_start_time()
        .into_iter()
        .map(|s| SpeakerSegment {
            start_cs: (s.start * 100.0) as i64,
            end_cs: (s.end * 100.0) as i64,
            speaker_idx: s.speaker.max(0) as u8,
        })
        .collect())
}

/// Variante STUB (sin el feature `diarization-local`): no hay motor nativo, asi que
/// no separa hablantes y el flujo degrada a transcripcion sin diarizacion. Mantiene
/// la misma firma para que el comando compile en el build por defecto.
#[cfg(not(feature = "diarization-local"))]
pub fn diarize_samples(
    _samples: &[f32],
    _sample_rate: u32,
    _segmentation_model: &Path,
    _embedding_model: &Path,
    _num_speakers: u8,
) -> Result<Vec<SpeakerSegment>, AiError> {
    Ok(Vec::new())
}

/* ---------- Trabajador aislado ---------- */

/// Lo que se le da al trabajador antes de matarlo: un minuto de arranque (cargar
/// ONNX Runtime y los modelos) mas el doble de lo que dura el audio. Con audio
/// real tardo 0.14 veces la duracion (2026-10-27), asi que sobra margen.
// Sin el feature, esta y las siguientes del lado de la app solo las usan las
// pruebas: el stub no lanza trabajador.
#[cfg_attr(not(feature = "diarization-local"), allow(dead_code))]
pub fn worker_timeout(sample_count: usize, sample_rate: u32) -> Duration {
    let audio_seconds = sample_count as u64 / u64::from(sample_rate.max(1));
    Duration::from_secs(60 + 2 * audio_seconds)
}

/// Muestras f32 a bytes little-endian, el formato de la tuberia.
#[cfg_attr(not(feature = "diarization-local"), allow(dead_code))]
pub fn encode_samples(samples: &[f32]) -> Vec<u8> {
    samples.iter().flat_map(|s| s.to_le_bytes()).collect()
}

pub fn decode_samples(bytes: &[u8]) -> Result<Vec<f32>, AiError> {
    if !bytes.len().is_multiple_of(4) {
        return Err(AiError::Invalid("muestras de audio incompletas".into()));
    }
    Ok(bytes
        .chunks_exact(4)
        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
        .collect())
}

/// Un tramo por linea: `inicio fin hablante` (centisegundos e indice).
pub fn encode_segments(segments: &[SpeakerSegment]) -> String {
    segments
        .iter()
        .map(|s| format!("{} {} {}\n", s.start_cs, s.end_cs, s.speaker_idx))
        .collect()
}

#[cfg_attr(not(feature = "diarization-local"), allow(dead_code))]
pub fn parse_segments(output: &str) -> Result<Vec<SpeakerSegment>, AiError> {
    let invalid = || AiError::Invalid("el motor de diarizacion devolvio tramos invalidos".into());
    output
        .lines()
        .filter(|line| !line.trim().is_empty())
        .map(|line| {
            let mut fields = line.split_whitespace();
            let mut next = || fields.next().ok_or_else(invalid);
            let segment = SpeakerSegment {
                start_cs: next()?.parse().map_err(|_| invalid())?,
                end_cs: next()?.parse().map_err(|_| invalid())?,
                speaker_idx: next()?.parse().map_err(|_| invalid())?,
            };
            if segment.end_cs < segment.start_cs {
                return Err(invalid());
            }
            Ok(segment)
        })
        .collect()
}

/// Corre `command` como trabajador: le escribe `input` por stdin, espera su salida
/// hasta `timeout` y devuelve los tramos. Cualquier falla del hijo (truena, sale
/// con error, se pasa del tiempo o responde basura) es un `Err`, nunca un panico ni
/// la caida de este proceso. Lo que el trabajador escriba en stderr se descarta:
/// los mensajes de un motor nativo no se registran.
#[cfg_attr(not(feature = "diarization-local"), allow(dead_code))]
pub fn run_worker(
    mut command: Command,
    input: Vec<u8>,
    timeout: Duration,
) -> Result<Vec<SpeakerSegment>, AiError> {
    let unavailable =
        |detail: String| AiError::Invalid(format!("la diarizacion no se completo: {detail}"));
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = command
        .spawn()
        .map_err(|e| unavailable(format!("no se pudo iniciar el motor ({e})")))?;

    // Escribir y leer en hilos aparte: con decenas de MB de audio, hacerlo en
    // secuencia puede trabar las dos tuberias.
    let mut stdin = child.stdin.take().expect("stdin con tuberia");
    let writer = std::thread::spawn(move || {
        // Si el hijo muere antes de leer todo, la escritura falla: lo decide su
        // codigo de salida, no este error.
        let _ = stdin.write_all(&input);
    });
    let mut stdout = child.stdout.take().expect("stdout con tuberia");
    let reader = std::thread::spawn(move || {
        let mut output = String::new();
        stdout.read_to_string(&mut output).map(|_| output)
    });

    let started = Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if started.elapsed() >= timeout => {
                let _ = child.kill();
                let _ = child.wait();
                // Sin esperar a los hilos: un nieto del hijo podria tener la
                // tuberia abierta todavia. Terminan solos al cerrarse.
                return Err(unavailable("el motor tardo demasiado".into()));
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(e) => return Err(unavailable(format!("se perdio el motor ({e})"))),
        }
    };
    let _ = writer.join();
    let output = reader
        .join()
        .map_err(|_| unavailable("no se pudo leer el resultado".into()))?
        .map_err(|e| unavailable(format!("no se pudo leer el resultado ({e})")))?;

    if !status.success() {
        let detail = match status.code() {
            Some(WORKER_ENGINE_ERROR) => "el motor devolvio un error".to_string(),
            Some(code) => format!("el motor termino de forma inesperada (codigo {code:#x})"),
            None => "el motor termino de forma inesperada".to_string(),
        };
        return Err(unavailable(detail));
    }
    parse_segments(&output)
}

/// El ejecutable de la app en modo trabajador, con los modelos y los hablantes.
#[cfg(feature = "diarization-local")]
pub fn worker_command(
    exe: &Path,
    segmentation_model: &Path,
    embedding_model: &Path,
    num_speakers: u8,
) -> Command {
    let mut command = Command::new(exe);
    command
        .arg(WORKER_ARG)
        .arg(segmentation_model)
        .arg(embedding_model)
        .arg(num_speakers.to_string());
    command
}

/// Lo que usa la app: la diarizacion en un proceso aparte (ver el encabezado). Sin
/// el feature no hay motor y devuelve vacio, igual que `diarize_samples`.
#[cfg(feature = "diarization-local")]
pub fn diarize_isolated(
    samples: &[f32],
    sample_rate: u32,
    segmentation_model: &Path,
    embedding_model: &Path,
    num_speakers: u8,
) -> Result<Vec<SpeakerSegment>, AiError> {
    if sample_rate != 16_000 {
        return Err(AiError::Invalid("la diarizacion espera 16 kHz mono".into()));
    }
    let exe = std::env::current_exe()
        .map_err(|e| AiError::Invalid(format!("no se encontro el ejecutable de la app: {e}")))?;
    run_worker(
        worker_command(&exe, segmentation_model, embedding_model, num_speakers),
        encode_samples(samples),
        worker_timeout(samples.len(), sample_rate),
    )
}

#[cfg(not(feature = "diarization-local"))]
pub fn diarize_isolated(
    _samples: &[f32],
    _sample_rate: u32,
    _segmentation_model: &Path,
    _embedding_model: &Path,
    _num_speakers: u8,
) -> Result<Vec<SpeakerSegment>, AiError> {
    Ok(Vec::new())
}

/// Si la app se lanzo como trabajador (`WORKER_ARG` como primer argumento), corre
/// la diarizacion y devuelve el codigo de salida; si no, `None` y la app arranca
/// normal. Lee las muestras de stdin y escribe los tramos en stdout.
pub fn worker_exit_code(args: &[String]) -> Option<i32> {
    if args.get(1).map(String::as_str) != Some(WORKER_ARG) {
        return None;
    }
    let (Some(segmentation), Some(embedding), Some(speakers)) =
        (args.get(2), args.get(3), args.get(4))
    else {
        return Some(WORKER_ENGINE_ERROR);
    };
    let Ok(speakers) = speakers.parse::<u8>() else {
        return Some(WORKER_ENGINE_ERROR);
    };
    let mut input = Vec::new();
    if std::io::stdin().read_to_end(&mut input).is_err() {
        return Some(WORKER_ENGINE_ERROR);
    }
    let result = decode_samples(&input).and_then(|samples| {
        diarize_samples(
            &samples,
            16_000,
            Path::new(segmentation),
            Path::new(embedding),
            speakers,
        )
    });
    match result {
        Ok(segments) => {
            let mut stdout = std::io::stdout();
            if stdout
                .write_all(encode_segments(&segments).as_bytes())
                .and_then(|_| stdout.flush())
                .is_err()
            {
                return Some(WORKER_ENGINE_ERROR);
            }
            Some(0)
        }
        Err(_) => Some(WORKER_ENGINE_ERROR),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Un comando de shell que hace de trabajador falso (Linux en CI, Windows aqui).
    fn shell(unix: &str, windows: &str) -> Command {
        if cfg!(windows) {
            let mut command = Command::new("cmd");
            command.args(["/C", windows]);
            command
        } else {
            let mut command = Command::new("sh");
            command.args(["-c", unix]);
            command
        }
    }

    fn segment(start_cs: i64, end_cs: i64, speaker_idx: u8) -> SpeakerSegment {
        SpeakerSegment {
            start_cs,
            end_cs,
            speaker_idx,
        }
    }

    #[test]
    fn samples_and_segments_round_trip_through_the_pipe_format() {
        let samples = vec![0.0, -1.0, 0.25, f32::MIN_POSITIVE];
        assert_eq!(decode_samples(&encode_samples(&samples)).unwrap(), samples);
        assert!(decode_samples(&[0, 0, 0]).is_err());

        let segments = vec![segment(31, 1074, 0), segment(1145, 1363, 1)];
        assert_eq!(
            parse_segments(&encode_segments(&segments)).unwrap(),
            segments
        );
        assert_eq!(parse_segments("").unwrap(), Vec::new());
        assert!(parse_segments("10 20").is_err());
        assert!(parse_segments("10 veinte 1").is_err());
        assert!(parse_segments("30 20 1").is_err());
        assert!(parse_segments("10 20 300").is_err());
    }

    #[test]
    fn only_the_worker_argument_turns_the_app_into_a_worker() {
        let args = |list: &[&str]| list.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        assert_eq!(worker_exit_code(&args(&["midoc"])), None);
        assert_eq!(worker_exit_code(&args(&["midoc", "--otra"])), None);
        // Faltan argumentos: error del trabajador, no arranque de la app.
        assert_eq!(
            worker_exit_code(&args(&["midoc", WORKER_ARG, "seg.onnx"])),
            Some(WORKER_ENGINE_ERROR)
        );
        assert_eq!(
            worker_exit_code(&args(&["midoc", WORKER_ARG, "a", "b", "dos"])),
            Some(WORKER_ENGINE_ERROR)
        );
    }

    #[test]
    fn reads_the_segments_a_worker_prints() {
        let command = shell(
            "cat > /dev/null; printf '31 1074 0\\n1145 1363 1\\n'",
            "echo 31 1074 0& echo 1145 1363 1",
        );
        let segments = run_worker(
            command,
            encode_samples(&[0.1; 1000]),
            Duration::from_secs(20),
        )
        .unwrap();
        assert_eq!(segments, vec![segment(31, 1074, 0), segment(1145, 1363, 1)]);
    }

    #[test]
    fn a_worker_that_dies_is_an_error_not_a_crash() {
        // 0xC0000005 es lo que dejo el fallo real de sherpa-onnx en Windows.
        let crashed = shell("exit 139", "exit -1073741819");
        let error = run_worker(
            crashed,
            encode_samples(&[0.1; 1000]),
            Duration::from_secs(20),
        )
        .unwrap_err();
        assert!(
            error.to_string().contains("termino de forma inesperada"),
            "{error}"
        );

        let engine_error = shell("exit 2", "exit 2");
        let error = run_worker(engine_error, Vec::new(), Duration::from_secs(20)).unwrap_err();
        assert!(error.to_string().contains("devolvio un error"), "{error}");

        let garbage = shell("echo hola", "echo hola");
        assert!(run_worker(garbage, Vec::new(), Duration::from_secs(20)).is_err());

        let missing = Command::new("midoc-no-existe-este-ejecutable");
        assert!(run_worker(missing, Vec::new(), Duration::from_secs(20)).is_err());
    }

    #[test]
    fn a_worker_that_hangs_is_killed_after_the_timeout() {
        let hung = shell("sleep 30", "ping -n 30 127.0.0.1 > NUL");
        let started = Instant::now();
        let error = run_worker(hung, Vec::new(), Duration::from_millis(500)).unwrap_err();
        assert!(error.to_string().contains("tardo demasiado"), "{error}");
        assert!(started.elapsed() < Duration::from_secs(10));
    }

    #[test]
    fn the_timeout_grows_with_the_audio() {
        assert_eq!(worker_timeout(0, 16_000), Duration::from_secs(60));
        // 13 min de audio: 60 s + 2 x 780 s.
        assert_eq!(
            worker_timeout(780 * 16_000, 16_000),
            Duration::from_secs(1620)
        );
    }
}
