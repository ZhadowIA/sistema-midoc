import type { ConsultationTurn, ScribeSpeaker } from "./consultationScribe";
import {
  deriveTranscriptionView,
  type RecordingState
} from "./transcriptionWorkspace";

interface Props {
  busy: boolean;
  voiceConsent: boolean;
  recordingState: RecordingState;
  recordingSeconds: number;
  recordingError: string;
  useCloud: boolean;
  turns: ConsultationTurn[];
  reviewed: boolean;
  provider: string | null;
  onToggleConsent(): void;
  onStart(): void;
  onPause(): void;
  onResume(): void;
  onStop(): void;
  onFile(file: File | null): void;
  onCloudChange(value: boolean): void;
  onTurnChange(id: string, patch: Partial<Pick<ConsultationTurn, "speaker" | "text">>): void;
  onSwapRoles(): void;
  onMarkReviewed(): void;
  onDiscard(): void;
}

function durationLabel(seconds: number): string {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60)
    .toString()
    .padStart(2, "0")}`;
}

export function TranscriptionWorkspace(props: Props) {
  const view = deriveTranscriptionView({
    voiceConsent: props.voiceConsent,
    recordingState: props.recordingState,
    processing: props.busy,
    hasTranscript: props.turns.some((turn) => turn.text.trim()),
    reviewed: props.reviewed,
    streamingSupported: false,
    realtimeCapable: true
  });

  return (
    <div className="transcription-workspace">
      <section className="transcription-capture" aria-label="Captura de audio">
        <span className="transcription-mic" aria-hidden="true">●</span>
        <strong>
          {props.recordingState === "recording"
            ? `Grabando · ${durationLabel(props.recordingSeconds)}`
            : props.recordingState === "paused"
              ? `Grabación pausada · ${durationLabel(props.recordingSeconds)}`
              : "Grabadora lista"}
        </strong>
        <p className="meta">El audio permanece en memoria y se descarta al terminar.</p>
        <div className="button-row">
          {props.recordingState === "idle" ? (
            <button className="action-button" onClick={props.onStart} disabled={!view.canStart}>
              Iniciar grabación
            </button>
          ) : null}
          {view.canPause ? <button className="ghost-button" onClick={props.onPause}>Pausar</button> : null}
          {view.canResume ? <button className="ghost-button" onClick={props.onResume}>Continuar</button> : null}
          {view.canStop ? <button className="action-button" onClick={props.onStop}>Detener y transcribir</button> : null}
        </div>
        {props.recordingError ? <p className="form-error" role="alert">{props.recordingError}</p> : null}
      </section>

      <section className="transcription-settings" aria-label="Configuración de transcripción">
        <strong>Configuración</strong>
        <label className="field">
          <span>Archivo WAV</span>
          <input
            type="file"
            accept=".wav,audio/wav,audio/x-wav"
            disabled={props.busy || !props.voiceConsent}
            onChange={(event) => {
              props.onFile(event.currentTarget.files?.[0] ?? null);
              event.currentTarget.value = "";
            }}
          />
        </label>
        <label className="week-cancelled-toggle">
          <input
            type="checkbox"
            checked={props.useCloud}
            disabled={props.busy || !props.voiceConsent}
            onChange={(event) => props.onCloudChange(event.currentTarget.checked)}
          />
          <span>Usar respaldo en nube</span>
        </label>
        <dl className="transcription-facts">
          <div><dt>Método</dt><dd>{props.useCloud ? "Nube" : "Local"}</dd></div>
          <div><dt>Proveedor</dt><dd>{props.provider ?? "Pendiente"}</dd></div>
          <div><dt>Texto</dt><dd>{view.transcriptStatus}</dd></div>
        </dl>
        <button className="ghost-button" onClick={props.onToggleConsent}>
          {props.voiceConsent ? "Revocar voz" : "Autorizar voz"}
        </button>
      </section>

      <section className="transcription-review" aria-label="Transcripción de consulta">
        <div className="panel-header">
          <h4>Transcripción</h4>
          <p>{view.transcriptMessage}</p>
        </div>
        {props.turns.length ? (
          <>
            <button className="ghost-button" onClick={props.onSwapRoles} disabled={props.busy || props.reviewed}>
              Intercambiar médico/paciente
            </button>
            <div className="scribe-turn-list">
              {props.turns.map((turn) => (
                <div className="scribe-turn" key={turn.id}>
                  <label className="field compact-field">
                    <span>Hablante</span>
                    <select
                      value={turn.speaker}
                      disabled={props.busy || props.reviewed}
                      onChange={(event) =>
                        props.onTurnChange(turn.id, {
                          speaker: event.currentTarget.value as ScribeSpeaker
                        })
                      }
                    >
                      <option value="MEDICO">Médico</option>
                      <option value="PACIENTE">Paciente</option>
                    </select>
                  </label>
                  <label className="field">
                    <span>{turn.id}</span>
                    <textarea
                      rows={3}
                      value={turn.text}
                      disabled={props.busy || props.reviewed}
                      onChange={(event) => props.onTurnChange(turn.id, { text: event.currentTarget.value })}
                    />
                  </label>
                </div>
              ))}
            </div>
            <div className="button-row">
              <button className="action-button" onClick={props.onMarkReviewed} disabled={!view.canMarkReviewed}>
                {props.reviewed ? "Transcripción revisada" : "Marcar como revisada"}
              </button>
              <button className="ghost-button danger-link" onClick={props.onDiscard} disabled={props.busy}>
                Descartar
              </button>
            </div>
          </>
        ) : (
          <div className="transcription-empty">
            <strong>{view.transcriptStatus}</strong>
            <p>{view.transcriptMessage}</p>
          </div>
        )}
      </section>
    </div>
  );
}
