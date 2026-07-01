import type { ConsultationTurn, ScribeSpeaker } from "./consultationScribe";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
import {
  deriveTranscriptionView,
  SPEAKER_COUNT_OPTIONS,
  type RecordingState
} from "./transcriptionWorkspace";

interface Props {
  busy: boolean;
  voiceConsent: boolean;
  recordingState: RecordingState;
  recordingSeconds: number;
  recordingError: string;
  useCloud: boolean;
  numSpeakers: number;
  transcribing: boolean;
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
  onNumSpeakersChange(value: number): void;
  onTurnChange(id: string, patch: Partial<Pick<ConsultationTurn, "speaker" | "text">>): void;
  onSpeakerRoleChange(speakerId: string, speaker: ScribeSpeaker): void;
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
        <div className="transcription-card-label">Captura</div>
        <div className="transcription-recorder-face">
          <span className="transcription-mic" aria-hidden="true">●</span>
          <div>
            <strong>
              {props.recordingState === "recording"
                ? `Grabando · ${durationLabel(props.recordingSeconds)}`
                : props.recordingState === "paused"
                  ? `Grabación pausada · ${durationLabel(props.recordingSeconds)}`
                  : "Grabadora lista"}
            </strong>
            <p className="meta">El audio permanece en memoria y se descarta al terminar.</p>
          </div>
        </div>
        <div className="button-row transcription-actions">
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
        <div className="transcription-settings-head">
          <div>
            <span className="transcription-card-label">Preparación</span>
            <strong>Configuración</strong>
          </div>
          <span className={props.voiceConsent ? "status-pill success" : "status-pill"}>
            {props.voiceConsent ? "Voz autorizada" : "Sin autorización"}
          </span>
        </div>
        <label className="field">
          <span>Archivo de audio (WAV, MP3, M4A)</span>
          <input
            type="file"
            accept=".wav,.mp3,.m4a,.aac,audio/wav,audio/x-wav,audio/mpeg,audio/mp4,audio/x-m4a,audio/aac"
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
        <label className="field compact-field">
          <span>Número de voces</span>
          <select
            value={props.numSpeakers}
            disabled={props.busy || !props.voiceConsent || props.useCloud}
            onChange={(event) => props.onNumSpeakersChange(Number(event.currentTarget.value))}
          >
            {SPEAKER_COUNT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {props.useCloud ? (
          <p className="meta">La separación de voces solo está disponible en modo local.</p>
        ) : null}
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
        <div className="transcription-review-head">
          <div>
            <span className="transcription-card-label">Revisión</span>
            <h3>Texto separado por hablantes</h3>
            <p>{props.transcribing ? "Procesando el audio en este equipo…" : view.transcriptMessage}</p>
          </div>
          <span className={props.reviewed ? "status-pill success" : "status-pill"}>
            {props.reviewed ? "Revisada" : view.transcriptStatus}
          </span>
        </div>
        {props.transcribing ? (
          <div className="transcription-loading" role="status" aria-live="polite">
            <span className="transcription-spinner" aria-hidden="true" />
            <strong>Transcribiendo audio…</strong>
            <p className="meta">
              {props.useCloud
                ? "Enviando el audio al proveedor de respaldo."
                : "Whisper y la separación de voces corren localmente; en audios largos puede tardar."}
            </p>
          </div>
        ) : props.turns.length ? (
          <>
            <div className="transcription-review-toolbar">
              <button className="ghost-button" onClick={props.onSwapRoles} disabled={props.busy || props.reviewed}>
                Intercambiar médico/paciente
              </button>
              <p className="meta">Ajusta los roles antes de marcar la transcripción como revisada.</p>
            </div>
            <div className="scribe-turn-list">
              {props.turns.map((turn) => (
                <div className={`scribe-turn ${turn.speaker === "MEDICO" ? "doctor-turn" : "patient-turn"}`} key={turn.id}>
                  <div className="scribe-turn-head">
                    <select
                      className="scribe-turn-role"
                      value={turn.speaker}
                      disabled={props.busy || props.reviewed}
                      aria-label={`Hablante del fragmento ${turn.id}`}
                      onChange={(event) =>
                        props.onTurnChange(turn.id, {
                          speaker: event.currentTarget.value as ScribeSpeaker
                        })
                      }
                    >
                      <option value="MEDICO">Médico</option>
                      <option value="PACIENTE">Paciente</option>
                    </select>
                    {turn.speakerId ? (
                      <span className="scribe-turn-voice">
                        <small className="meta">{turn.speakerId}</small>
                        <button
                          type="button"
                          className="ghost-button"
                          disabled={props.busy || props.reviewed}
                          onClick={() => props.onSpeakerRoleChange(turn.speakerId!, turn.speaker)}
                        >
                          Aplicar a esta voz
                        </button>
                      </span>
                    ) : null}
                  </div>
                  <AutoGrowTextarea
                    className="scribe-turn-text"
                    rows={3}
                    value={turn.text}
                    disabled={props.busy || props.reviewed}
                    aria-label={`Texto del fragmento ${turn.id}`}
                    onChange={(event) => props.onTurnChange(turn.id, { text: event.currentTarget.value })}
                  />
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
