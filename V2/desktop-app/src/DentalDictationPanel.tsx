import { useEffect, useRef, useState } from "react";
import { call } from "./ipc";
import type { DentalPayload } from "./clinicalProfiles.ts";
import {
  applyProposals,
  describeProposal,
  parseDentalDictation,
  type DictationProposal
} from "./dentalDictation.ts";
import { createRecordedWavFile } from "./consultationRecorder";
import { AutoGrowTextarea } from "./AutoGrowTextarea";

// Dictado manos-libres al odontograma (paso 26 rebanada 5a). El dentista
// dicta con guantes ("18 caries oclusal, 17 amalgama..."), Whisper LOCAL
// transcribe (paso 15, gobernado por el consentimiento de voz del paso 11) y
// el parser determinista propone marcas que se confirman en lote. El texto
// tambien puede teclearse: el flujo no depende de la IA.

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

interface ReviewableProposal {
  proposal: DictationProposal;
  checked: boolean;
}

export function DentalDictationPanel({
  patientId,
  encounterId,
  payload,
  disabled,
  onChange
}: {
  patientId: string;
  encounterId: string;
  payload: DentalPayload;
  disabled: boolean;
  onChange: (next: DentalPayload) => void;
}) {
  const [text, setText] = useState("");
  const [review, setReview] = useState<ReviewableProposal[]>([]);
  const [voiceConsent, setVoiceConsent] = useState<boolean | null>(null);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const chunksRef = useRef<Float32Array[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  useEffect(() => {
    call<boolean>("ai_voice_consent_status", { patientId })
      .then(setVoiceConsent)
      .catch(() => setVoiceConsent(false));
  }, [patientId]);

  function cleanupRecording() {
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    void contextRef.current?.close().catch(() => {});
    processorRef.current = null;
    sourceRef.current = null;
    streamRef.current = null;
    contextRef.current = null;
  }

  useEffect(() => cleanupRecording, []);

  async function startDictation() {
    if (recording || disabled || !voiceConsent) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Este equipo no expone acceso al microfono en la app.");
      return;
    }
    try {
      setError(null);
      chunksRef.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }
      });
      const context = new AudioContext();
      if (context.state === "suspended") {
        await context.resume();
      }
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (event) => {
        chunksRef.current.push(new Float32Array(event.inputBuffer.getChannelData(0)));
        event.outputBuffer.getChannelData(0).fill(0);
      };
      source.connect(processor);
      processor.connect(context.destination);
      streamRef.current = stream;
      contextRef.current = context;
      sourceRef.current = source;
      processorRef.current = processor;
      setRecording(true);
    } catch (cause) {
      cleanupRecording();
      setError(String(cause));
    }
  }

  async function stopDictation() {
    if (!recording) return;
    const sampleRate = contextRef.current?.sampleRate ?? 48_000;
    const chunks = chunksRef.current.slice();
    cleanupRecording();
    setRecording(false);
    setTranscribing(true);
    setError(null);
    try {
      const file = createRecordedWavFile(chunks, sampleRate);
      const audioBase64 = await fileToBase64(file);
      // Whisper local (paso 15): el audio no sale del equipo y se descarta
      // tras transcribir. La corrida queda trazada como las demas (paso 11).
      const draft = await call<{ transcript_text: string }>("ai_transcribe_audio", {
        encounterId,
        audio: {
          fileName: file.name,
          mediaType: file.type || "audio/wav",
          audioBase64,
          durationSeconds: null
        },
        useCloud: false
      });
      setText((current) =>
        current.trim() === "" ? draft.transcript_text : `${current.trim()} ${draft.transcript_text}`
      );
      setMessage("Dictado transcrito. Revisa el texto e interpretalo.");
    } catch (cause) {
      setError(String(cause));
    } finally {
      setTranscribing(false);
    }
  }

  function interpret() {
    const proposals = parseDentalDictation(text);
    if (proposals.length === 0) {
      setError("No hay dictado que interpretar.");
      return;
    }
    setError(null);
    setMessage(null);
    setReview(
      proposals.map((proposal) => ({ proposal, checked: proposal.kind !== "UNRECOGNIZED" }))
    );
  }

  function applySelected() {
    const selected = review.filter((entry) => entry.checked).map((entry) => entry.proposal);
    if (selected.length === 0) {
      setError("No hay marcas seleccionadas que aplicar.");
      return;
    }
    onChange(applyProposals(payload, selected));
    setReview([]);
    setText("");
    setError(null);
    setMessage(
      `${selected.length} marca(s) aplicadas al odontograma. Revisa el resultado y guarda la nota.`
    );
  }

  const unrecognizedCount = review.filter((entry) => entry.proposal.kind === "UNRECOGNIZED").length;

  return (
    <div className="dental-dictation">
      <div className="panel-header">
        <h4>Dictado al odontograma</h4>
        <p>
          Dicta hallazgos con las manos ocupadas: "18 caries oclusal, 17 amalgama, 16 ausente" o
          "16 bolsas 3 2 3 4 3 4". Nada se marca sin tu confirmacion.
        </p>
      </div>
      {message ? <p className="form-success">{message}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      <div className="dictation-input-row">
        <AutoGrowTextarea
          rows={2}
          value={text}
          disabled={disabled || transcribing}
          placeholder="Escribe o dicta aqui los hallazgos..."
          onChange={(event) => setText(event.currentTarget.value)}
        />
        <div className="dictation-controls">
          {!recording ? (
            <button
              className="ghost-button"
              type="button"
              disabled={disabled || transcribing || !voiceConsent}
              title={
                voiceConsent === false
                  ? "Falta el consentimiento de voz del paciente (se registra en Transcripcion consulta)"
                  : undefined
              }
              onClick={() => void startDictation()}
            >
              {transcribing ? "Transcribiendo..." : "Dictar por voz"}
            </button>
          ) : (
            <button className="danger-button" type="button" onClick={() => void stopDictation()}>
              Detener dictado
            </button>
          )}
          <button
            className="action-button"
            type="button"
            disabled={disabled || text.trim() === ""}
            onClick={interpret}
          >
            Interpretar dictado
          </button>
        </div>
      </div>
      {voiceConsent === false ? (
        <p className="dictation-consent-hint">
          El microfono se habilita con el consentimiento de voz del paciente; puedes teclear el
          dictado mientras tanto.
        </p>
      ) : null}
      {review.length > 0 ? (
        <div className="dictation-review">
          <p className="dictation-review-title">
            Propuestas interpretadas — confirma las que se marcaran:
          </p>
          {review.map((entry, index) =>
            entry.proposal.kind === "UNRECOGNIZED" ? (
              <p className="dictation-unrecognized" key={index}>
                {describeProposal(entry.proposal)}
              </p>
            ) : (
              <label className="dictation-proposal" key={index}>
                <input
                  type="checkbox"
                  checked={entry.checked}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    setReview((current) =>
                      current.map((row, i) => (i === index ? { ...row, checked } : row))
                    );
                  }}
                />
                <span>{describeProposal(entry.proposal)}</span>
              </label>
            )
          )}
          {unrecognizedCount > 0 ? (
            <p className="dictation-unrecognized-note">
              Lo no interpretado nunca se aplica; corrigelo en el texto y vuelve a interpretar.
            </p>
          ) : null}
          <div className="button-row">
            <button className="action-button" type="button" disabled={disabled} onClick={applySelected}>
              Aplicar seleccionadas
            </button>
            <button className="ghost-button" type="button" onClick={() => setReview([])}>
              Descartar propuestas
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
