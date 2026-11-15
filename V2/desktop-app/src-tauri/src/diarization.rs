//! Nucleo puro de diarizacion local: fusion de la transcripcion de Whisper con
//! los tramos de hablante de sherpa-onnx (paso de diarizacion local).
//!
//! La diarizacion responde "quien hablo cuando": corre EN EL DISPOSITIVO sobre la
//! forma de onda del audio (sherpa-onnx, modulo `sherpa_diarization` tras el
//! feature `diarization-local`) y produce tramos de hablante con marcas de tiempo.
//! Whisper responde "que se dijo": entrega segmentos de texto con marcas de
//! tiempo. Este modulo es el PEGAMENTO entre ambos motores: asigna a cada segmento
//! de texto el hablante cuyo tramo solapa mas en el tiempo, fusiona segmentos
//! contiguos del mismo hablante, conserva el speaker tecnico (`speaker-0`,
//! `speaker-1`, ...) y sugiere un rol clinico revisable por separado.
//!
//! Todo aqui es logica PURA y determinista (sin audio, sin red, sin la base
//! cifrada): la fusion y la inferencia inicial de roles se prueban sin hardware.
//! El escriba ya permite corregir hablante/texto a mano, asi que esta separacion
//! automatica es una ayuda revisable, no una fuente de verdad.

use serde::Serialize;

/// Numero de hablantes a separar por defecto. La consulta tipica es Medico +
/// Paciente; fijar 2 maximiza la precision en ese caso. El medico puede cambiarlo
/// en la UI (Auto/1/2/3) cuando dicta solo o hay acompanante.
pub const DEFAULT_NUM_SPEAKERS: u8 = 2;

/// Seleccion "Auto": el medico no fija el numero y sherpa-onnx lo estima.
/// (Solo lo consume el motor real tras `diarization-local` y las pruebas.)
#[cfg_attr(not(feature = "diarization-local"), allow(dead_code))]
pub const AUTO_NUM_SPEAKERS: u8 = 0;

/// Tope razonable de hablantes en consulta: Medico + Paciente + acompanante.
pub const MAX_NUM_SPEAKERS: u8 = 3;

/// Umbral de clustering por defecto (el mismo que sherpa-onnx). Solo se usa en modo
/// Auto: menor umbral separa mas voces; mayor, menos. Afinable en staging con audio
/// real via `MIDOC_DIARIZE_THRESHOLD`.
#[cfg_attr(not(feature = "diarization-local"), allow(dead_code))]
pub const DEFAULT_DIARIZE_THRESHOLD: f32 = 0.5;

/// Grupos de mas que se le piden a sherpa-onnx cuando el numero de hablantes esta
/// fijo. Con exactamente N, el clustering (enlace completo) es fragil: un tramo
/// raro (musica, ruido, una tos) se queda con un grupo entero y las dos voces caen
/// juntas en el otro. Medido el 2026-10-31: el mismo audio en WAV daba 1062 s / 160 s
/// con 2 grupos y, pidiendo 4, las voces quedaban separadas. Se piden N + 2 y
/// `collapse_speakers` se queda con los N mas grandes.
pub const EXTRA_CLUSTERS: u8 = 2;

/// Traduce la seleccion del medico a los parametros de clustering de sherpa-onnx:
/// `(num_clusters, threshold)`. Con `num_speakers == 0` (Auto) devuelve
/// `num_clusters <= 0`, lo que hace que sherpa ESTIME el numero de hablantes con el
/// umbral; con `num_speakers > 0` pide `EXTRA_CLUSTERS` grupos de mas (el umbral
/// lo ignora el motor) y el resultado se junta despues con `collapse_speakers`.
/// Con 1 hablante no hay nada que separar y se pide 1. Funcion pura: el mapeo se
/// prueba sin la cadena nativa; el motor real lo usa tras el feature
/// `diarization-local`.
#[cfg_attr(not(feature = "diarization-local"), allow(dead_code))]
pub fn clustering_params(num_speakers: u8, threshold: f32) -> (i32, f32) {
    match num_speakers {
        AUTO_NUM_SPEAKERS => (0, threshold),
        1 => (1, threshold),
        n => (i32::from(n) + i32::from(EXTRA_CLUSTERS), threshold),
    }
}

/// Junta el resultado de un clustering con grupos de mas en `target` hablantes.
/// Se quedan los `target` grupos con mas tiempo de habla; cada tramo de un grupo
/// chico pasa al hablante del tramo conservado mas cercano en el tiempo (ante
/// empate, el anterior). Los indices se renumeran por orden de aparicion (0, 1,
/// ...), asi que el primero en hablar sigue siendo el 0. Si ya hay `target` grupos
/// o menos, solo renumera. Espera los tramos ordenados por inicio, como los
/// entrega sherpa-onnx. Funcion pura.
#[cfg_attr(not(feature = "diarization-local"), allow(dead_code))]
pub fn collapse_speakers(segments: &[SpeakerSegment], target: u8) -> Vec<SpeakerSegment> {
    let mut talk: Vec<(u8, i64)> = Vec::new();
    for s in segments {
        let length = (s.end_cs - s.start_cs).max(0);
        match talk.iter_mut().find(|(idx, _)| *idx == s.speaker_idx) {
            Some((_, total)) => *total += length,
            None => talk.push((s.speaker_idx, length)),
        }
    }
    // Mas tiempo primero; ante empate, el indice menor (determinista).
    talk.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
    let kept: Vec<u8> = talk
        .iter()
        .take(usize::from(target.max(1)))
        .map(|(idx, _)| *idx)
        .collect();

    let is_kept = |idx: u8| kept.contains(&idx);
    let nearest_kept = |position: usize| -> Option<u8> {
        let segment = &segments[position];
        let before = segments[..position]
            .iter()
            .rev()
            .find(|s| is_kept(s.speaker_idx))
            .map(|s| ((segment.start_cs - s.end_cs).max(0), s.speaker_idx));
        let after = segments[position + 1..]
            .iter()
            .find(|s| is_kept(s.speaker_idx))
            .map(|s| ((s.start_cs - segment.end_cs).max(0), s.speaker_idx));
        match (before, after) {
            (Some((gap_before, b)), Some((gap_after, a))) => {
                Some(if gap_after < gap_before { a } else { b })
            }
            (Some((_, b)), None) => Some(b),
            (None, Some((_, a))) => Some(a),
            (None, None) => None,
        }
    };

    let mut order: Vec<u8> = Vec::new();
    segments
        .iter()
        .enumerate()
        .map(|(position, s)| {
            let speaker = if is_kept(s.speaker_idx) {
                s.speaker_idx
            } else {
                nearest_kept(position).unwrap_or(s.speaker_idx)
            };
            let renumbered = match order.iter().position(|idx| *idx == speaker) {
                Some(i) => i,
                None => {
                    order.push(speaker);
                    order.len() - 1
                }
            };
            SpeakerSegment {
                start_cs: s.start_cs,
                end_cs: s.end_cs,
                speaker_idx: renumbered as u8,
            }
        })
        .collect()
}

/// Segmento de texto de Whisper con sus marcas de tiempo (en centisegundos, la
/// unidad nativa de los timestamps de whisper.cpp). Frontera de entrada: la
/// produce el proveedor de transcripcion.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WhisperSegment {
    pub start_cs: i64,
    pub end_cs: i64,
    pub text: String,
}

/// Tramo de hablante producido por la diarizacion (sherpa-onnx). `speaker_idx` es
/// un indice opaco (0, 1, ...) sin rol asignado todavia.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SpeakerSegment {
    pub start_cs: i64,
    pub end_cs: i64,
    pub speaker_idx: u8,
}

/// Rol clinico asignado a un turno. Se serializa con las mismas etiquetas que el
/// contrato de turnos del frontend (`ScribeSpeaker` en `consultationScribe.ts`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum ScribeRole {
    #[serde(rename = "MEDICO")]
    Medico,
    #[serde(rename = "PACIENTE")]
    Paciente,
}

fn speaker_id(idx: u8) -> String {
    format!("speaker-{idx}")
}

/// Turno de dialogo listo para el frontend: speaker tecnico, rol clinico sugerido,
/// texto y marcas de tiempo. `speaker_id` conserva la identidad acustica; `role`
/// es solo una sugerencia editable para compatibilidad con el escriba clinico.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiarizedTurn {
    pub id: String,
    pub speaker_id: String,
    pub role: ScribeRole,
    pub text: String,
    pub start_cs: i64,
    pub end_cs: i64,
}

/// Solape temporal (en centisegundos) entre dos intervalos `[a_start, a_end)` y
/// `[b_start, b_end)`. Cero si no se tocan. Funcion pura.
pub fn overlap_cs(a_start: i64, a_end: i64, b_start: i64, b_end: i64) -> i64 {
    let start = a_start.max(b_start);
    let end = a_end.min(b_end);
    (end - start).max(0)
}

/// Elige el indice de hablante cuyo tramo solapa mas con el segmento de texto.
/// `None` si ningun tramo solapa (la diarizacion no cubrio ese intervalo). Ante un
/// empate de solape, gana el hablante con menor indice (estable y determinista).
pub fn dominant_speaker(segment: &WhisperSegment, speakers: &[SpeakerSegment]) -> Option<u8> {
    let mut best: Option<(u8, i64)> = None;
    for sp in speakers {
        let ov = overlap_cs(segment.start_cs, segment.end_cs, sp.start_cs, sp.end_cs);
        if ov <= 0 {
            continue;
        }
        let better = match best {
            None => true,
            // Mayor solape gana; ante empate, el indice menor (estable).
            Some((best_idx, best_ov)) => {
                ov > best_ov || (ov == best_ov && sp.speaker_idx < best_idx)
            }
        };
        if better {
            best = Some((sp.speaker_idx, ov));
        }
    }
    best.map(|(idx, _)| idx)
}

/// Asigna a cada segmento de Whisper su hablante dominante y fusiona segmentos
/// contiguos del mismo hablante en un solo turno. Si un segmento no solapa con
/// ningun tramo, hereda el hablante del turno previo (continuidad razonable); si
/// es el primero, se asigna al indice 0. Devuelve turnos con indices de hablante,
/// aun sin rol clinico (eso lo hace `assign_roles`).
fn segments_to_indexed_turns(
    whisper: &[WhisperSegment],
    speakers: &[SpeakerSegment],
) -> Vec<(u8, WhisperSegment)> {
    let mut turns: Vec<(u8, WhisperSegment)> = Vec::new();
    let mut last_idx: u8 = 0;

    for seg in whisper {
        let text = seg.text.trim();
        if text.is_empty() {
            continue;
        }
        let idx = dominant_speaker(seg, speakers).unwrap_or(last_idx);
        last_idx = idx;

        match turns.last_mut() {
            // Fusiona con el turno previo si es el mismo hablante.
            Some((prev_idx, prev_seg)) if *prev_idx == idx => {
                prev_seg.text.push(' ');
                prev_seg.text.push_str(text);
                prev_seg.end_cs = seg.end_cs;
            }
            _ => turns.push((
                idx,
                WhisperSegment {
                    start_cs: seg.start_cs,
                    end_cs: seg.end_cs,
                    text: text.to_string(),
                },
            )),
        }
    }

    turns
}

/// Sugiere roles clinicos por orden de aparicion: el primer speaker tecnico se
/// propone como Medico y los demas como Paciente. IMPORTANTE: esto no borra la
/// identidad tecnica; la UI puede reasignar todos los turnos de un `speaker_id`.
fn role_for(idx: u8, medico_idx: u8) -> ScribeRole {
    if idx == medico_idx {
        ScribeRole::Medico
    } else {
        ScribeRole::Paciente
    }
}

/// Fusiona la transcripcion con los tramos de hablante y produce el dialogo
/// revisable conservando speaker tecnico + rol clinico sugerido. Punto de entrada
/// del modulo.
pub fn merge_segments_with_speakers(
    whisper: &[WhisperSegment],
    speakers: &[SpeakerSegment],
) -> Vec<DiarizedTurn> {
    let indexed = segments_to_indexed_turns(whisper, speakers);

    // El Medico es el primer hablante que aparece en el dialogo.
    let medico_idx = indexed.first().map(|(idx, _)| *idx).unwrap_or(0);

    indexed
        .into_iter()
        .enumerate()
        .map(|(i, (idx, seg))| DiarizedTurn {
            id: format!("turn-{}", i + 1),
            speaker_id: speaker_id(idx),
            role: role_for(idx, medico_idx),
            text: seg.text,
            start_cs: seg.start_cs,
            end_cs: seg.end_cs,
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ws(start_cs: i64, end_cs: i64, text: &str) -> WhisperSegment {
        WhisperSegment {
            start_cs,
            end_cs,
            text: text.to_string(),
        }
    }

    fn sp(start_cs: i64, end_cs: i64, speaker_idx: u8) -> SpeakerSegment {
        SpeakerSegment {
            start_cs,
            end_cs,
            speaker_idx,
        }
    }

    #[test]
    fn default_num_speakers_is_two() {
        assert_eq!(DEFAULT_NUM_SPEAKERS, 2);
    }

    #[test]
    fn clustering_params_auto_lets_sherpa_estimate() {
        // Auto (0): num_clusters <= 0 activa la estimacion por umbral.
        assert_eq!(clustering_params(AUTO_NUM_SPEAKERS, 0.5), (0, 0.5));
    }

    #[test]
    fn clustering_params_fixed_asks_for_extra_clusters() {
        // Un hablante no se separa; con 2 o 3 se piden grupos de mas para juntar.
        assert_eq!(clustering_params(1, 0.5), (1, 0.5));
        assert_eq!(clustering_params(2, 0.5), (4, 0.5));
        assert_eq!(clustering_params(3, 0.7), (5, 0.7));
    }

    #[test]
    fn collapse_keeps_the_largest_clusters_and_absorbs_small_ones() {
        // Cuatro grupos: 1 y 3 hablan mucho; 0 (musica al inicio) y 2 (una tos)
        // son chicos y pasan al hablante conservado mas cercano.
        let speakers = [
            sp(0, 300, 0),
            sp(300, 1300, 1),
            sp(1300, 2300, 3),
            sp(2310, 2330, 2),
            sp(2400, 3400, 1),
            sp(3400, 4200, 3),
        ];
        let collapsed = collapse_speakers(&speakers, 2);
        let idx: Vec<u8> = collapsed.iter().map(|s| s.speaker_idx).collect();
        // La musica inicial se va con el siguiente (1, renumerado 0); la tos queda
        // mas cerca del tramo anterior (3, renumerado 1).
        assert_eq!(idx, vec![0, 0, 1, 1, 0, 1]);
        // Los tiempos no cambian.
        assert_eq!(collapsed[3].start_cs, 2310);
        assert_eq!(collapsed[3].end_cs, 2330);
    }

    #[test]
    fn collapse_renumbers_by_first_appearance_without_dropping() {
        let speakers = [sp(0, 100, 3), sp(100, 200, 1), sp(200, 300, 3)];
        let collapsed = collapse_speakers(&speakers, 2);
        let idx: Vec<u8> = collapsed.iter().map(|s| s.speaker_idx).collect();
        assert_eq!(idx, vec![0, 1, 0]);
    }

    #[test]
    fn collapse_handles_empty_and_single_speaker() {
        assert!(collapse_speakers(&[], 2).is_empty());
        let one = collapse_speakers(&[sp(0, 100, 2), sp(150, 200, 5)], 1);
        assert!(one.iter().all(|s| s.speaker_idx == 0));
    }

    #[test]
    fn three_speakers_preserve_technical_identity_before_clinical_role() {
        // La diarizacion tecnica NO debe colapsar identidades: speaker-1 y
        // speaker-2 pueden mapearse despues a roles clinicos, pero primero deben
        // llegar separados a la UI.
        let whisper = [
            ws(0, 100, "Buenos dias."),
            ws(100, 200, "Me duele la cabeza."),
            ws(200, 300, "Mi hijo tambien tose."),
        ];
        let speakers = [sp(0, 100, 0), sp(100, 200, 1), sp(200, 300, 2)];
        let turns = merge_segments_with_speakers(&whisper, &speakers);
        assert_eq!(turns.len(), 3);
        assert_eq!(turns[0].speaker_id, "speaker-0");
        assert_eq!(turns[1].speaker_id, "speaker-1");
        assert_eq!(turns[2].speaker_id, "speaker-2");
        assert_eq!(turns[0].role, ScribeRole::Medico);
        assert_eq!(turns[1].role, ScribeRole::Paciente);
        assert_eq!(turns[2].role, ScribeRole::Paciente);
    }

    #[test]
    fn overlap_is_intersection_or_zero() {
        assert_eq!(overlap_cs(0, 100, 50, 150), 50);
        assert_eq!(
            overlap_cs(0, 100, 100, 200),
            0,
            "se tocan en el borde, no solapan"
        );
        assert_eq!(overlap_cs(0, 100, 200, 300), 0, "disjuntos");
        assert_eq!(overlap_cs(0, 100, 10, 40), 30, "uno contiene al otro");
    }

    #[test]
    fn dominant_speaker_picks_max_overlap() {
        let seg = ws(0, 100, "hola");
        let speakers = [sp(0, 30, 0), sp(30, 100, 1)];
        assert_eq!(dominant_speaker(&seg, &speakers), Some(1));
    }

    #[test]
    fn dominant_speaker_breaks_ties_by_lowest_index() {
        let seg = ws(0, 100, "hola");
        // Solape identico (50 cs cada uno): gana el indice menor.
        let speakers = [sp(0, 50, 1), sp(50, 100, 0)];
        assert_eq!(dominant_speaker(&seg, &speakers), Some(0));
    }

    #[test]
    fn dominant_speaker_is_none_without_overlap() {
        let seg = ws(0, 100, "hola");
        assert_eq!(dominant_speaker(&seg, &[sp(200, 300, 0)]), None);
        assert_eq!(dominant_speaker(&seg, &[]), None);
    }

    #[test]
    fn merge_assigns_roles_first_speaker_is_doctor() {
        let whisper = [
            ws(0, 100, "Buenos dias, que lo trae?"),
            ws(100, 250, "Me duele la cabeza desde ayer."),
        ];
        let speakers = [sp(0, 100, 0), sp(100, 250, 1)];
        let turns = merge_segments_with_speakers(&whisper, &speakers);

        assert_eq!(turns.len(), 2);
        assert_eq!(turns[0].role, ScribeRole::Medico);
        assert_eq!(turns[0].id, "turn-1");
        assert_eq!(turns[1].role, ScribeRole::Paciente);
        assert!(turns[1].text.contains("duele la cabeza"));
    }

    #[test]
    fn merge_fuses_contiguous_same_speaker_segments() {
        let whisper = [
            ws(0, 100, "Buenos dias."),
            ws(100, 200, "Soy el doctor."),
            ws(200, 300, "Me duele aqui."),
        ];
        // Primeros dos segmentos: hablante 0; tercero: hablante 1.
        let speakers = [sp(0, 200, 0), sp(200, 300, 1)];
        let turns = merge_segments_with_speakers(&whisper, &speakers);

        assert_eq!(turns.len(), 2, "fusiona los dos primeros en un turno");
        assert_eq!(turns[0].text, "Buenos dias. Soy el doctor.");
        assert_eq!(turns[0].start_cs, 0);
        assert_eq!(turns[0].end_cs, 200);
        assert_eq!(turns[0].role, ScribeRole::Medico);
        assert_eq!(turns[1].role, ScribeRole::Paciente);
    }

    #[test]
    fn single_speaker_yields_one_role() {
        let whisper = [
            ws(0, 100, "Solo una voz."),
            ws(100, 200, "Sin interlocutor."),
        ];
        let speakers = [sp(0, 200, 0)];
        let turns = merge_segments_with_speakers(&whisper, &speakers);
        assert_eq!(turns.len(), 1);
        assert_eq!(turns[0].role, ScribeRole::Medico);
    }

    #[test]
    fn segment_without_speaker_inherits_previous() {
        let whisper = [
            ws(0, 100, "Hola."),
            // Sin tramo que cubra 100..200: hereda al hablante previo (0).
            ws(100, 200, "Sigo yo."),
            ws(200, 300, "Ahora el otro."),
        ];
        let speakers = [sp(0, 100, 0), sp(200, 300, 1)];
        let turns = merge_segments_with_speakers(&whisper, &speakers);

        assert_eq!(turns.len(), 2);
        assert_eq!(
            turns[0].text, "Hola. Sigo yo.",
            "el segmento sin hablante hereda el previo"
        );
        assert_eq!(turns[0].role, ScribeRole::Medico);
        assert_eq!(turns[1].role, ScribeRole::Paciente);
    }

    #[test]
    fn empty_text_segments_are_skipped() {
        let whisper = [ws(0, 100, "   "), ws(100, 200, "Contenido.")];
        let speakers = [sp(0, 200, 0)];
        let turns = merge_segments_with_speakers(&whisper, &speakers);
        assert_eq!(turns.len(), 1);
        assert_eq!(turns[0].text, "Contenido.");
    }

    #[test]
    fn no_speakers_falls_back_to_index_zero_as_doctor() {
        // Diarizacion no disponible: todo cae en un solo turno del Medico.
        let whisper = [
            ws(0, 100, "Texto sin diarizar."),
            ws(100, 200, "Mas texto."),
        ];
        let turns = merge_segments_with_speakers(&whisper, &[]);
        assert_eq!(turns.len(), 1);
        assert_eq!(turns[0].role, ScribeRole::Medico);
    }

    #[test]
    fn empty_input_yields_no_turns() {
        assert!(merge_segments_with_speakers(&[], &[]).is_empty());
    }

    #[test]
    fn role_serializes_with_frontend_labels_and_speaker_id() {
        let turn = DiarizedTurn {
            id: "turn-1".into(),
            speaker_id: "speaker-0".into(),
            role: ScribeRole::Medico,
            text: "hola".into(),
            start_cs: 0,
            end_cs: 100,
        };
        let json = serde_json::to_string(&turn).unwrap();
        assert!(json.contains("\"speakerId\":\"speaker-0\""));
        assert!(json.contains("\"role\":\"MEDICO\""));
        assert!(!json.contains("\"speaker\":\"MEDICO\""));
        assert!(json.contains("\"startCs\":0"));
        assert!(json.contains("\"endCs\":100"));
    }
}
