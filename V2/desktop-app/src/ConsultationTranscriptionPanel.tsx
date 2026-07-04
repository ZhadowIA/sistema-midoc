import type { DiarizedReview, DiarizedSpeakerRole, ConsultationTurn, ScribeSpeaker } from "./consultationScribe";
import { AutoGrowTextarea } from "./AutoGrowTextarea";
import {
  CLOUD_TRANSCRIPTION_PROVIDER_OPTIONS,
  deriveTranscriptionView,
  SPEAKER_COUNT_OPTIONS,
  TRANSCRIPTION_MODE_OPTIONS,
  type CloudTranscriptionProviderId,
  type RecordingState,
  type TranscriptionMode
} from "./transcriptionWorkspace";

interface Props {
  busy: boolean;
  voiceConsent: boolean;
  recordingState: RecordingState;
  recordingSeconds: number;
  recordingError: string;
  mode: TranscriptionMode;
  /** Proveedor real de la via en nube elegido por el medico (solo modos nube). */
  cloudProvider: CloudTranscriptionProviderId;
  numSpeakers: number;
  transcribing: boolean;
  turns: ConsultationTurn[];
  /** Hablantes anonimos de la nube diarizada pendientes de asignar rol (Ruta B, F4). */
  diarizedReview: DiarizedReview | null;
  /** `false` mientras falte asignar el rol de algun hablante con texto. */
  rolesResolved: boolean;
  reviewed: boolean;
  provider: string | null;
  onToggleConsent(): void;
  onStart(): void;
  onPause(): void;
  onResume(): void;
  onStop(): void;
  onFile(file: File | null): void;
  onModeChange(value: TranscriptionMode): void;
  onCloudProviderChange(value: CloudTranscriptionProviderId): void;
  onNumSpeakersChange(value: number): void;
  onTurnChange(id: string, patch: Partial<Pick<ConsultationTurn, "speaker" | "text">>): void;
  /** Asigna rol a un hablante anonimo aun sin resolver (pantalla previa, Ruta B F4). */
  onAssignDiarizedRole(speakerId: string, role: DiarizedSpeakerRole): void;
  /** Aplica retroactivamente un rol a todos los turnos de la misma voz ya resuelta. */
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
    realtimeCapable: true,
    rolesResolved: props.rolesResolved
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
        <label className="field compact-field">
          <span>Método de transcripción</span>
          <select
            value={props.mode}
            disabled={props.busy || !props.voiceConsent}
            onChange={(event) => props.onModeChange(event.currentTarget.value as TranscriptionMode)}
          >
            {TRANSCRIPTION_MODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {props.mode !== "local" ? (
          <label className="field compact-field">
            <span>Proveedor de nube</span>
            <select
              value={props.cloudProvider}
              disabled={props.busy || !props.voiceConsent}
              onChange={(event) =>
                props.onCloudProviderChange(
                  event.currentTarget.value as CloudTranscriptionProviderId
                )
              }
            >
              {CLOUD_TRANSCRIPTION_PROVIDER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="field compact-field">
          <span>Número de voces</span>
          <select
            value={props.numSpeakers}
            disabled={props.busy || !props.voiceConsent || props.mode !== "local"}
            onChange={(event) => props.onNumSpeakersChange(Number(event.currentTarget.value))}
          >
            {SPEAKER_COUNT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {props.mode !== "local" ? (
          <p className="meta">La separación de voces por Auto/1/2/3 solo está disponible en modo local.</p>
        ) : null}
        {props.mode === "cloud_diarized" ? (
          <p className="meta">
            La nube devuelve hablantes anónimos (Hablante 1, Hablante 2…); confirma el rol de cada
            uno antes de marcar la transcripción como revisada.
          </p>
        ) : null}
        <dl className="transcription-facts">
          <div>
            <dt>Método</dt>
            <dd>
              {props.mode === "local"
                ? "Local"
                : props.mode === "cloud_diarized"
                  ? "Nube (con hablantes)"
                  : "Nube (estándar)"}
            </dd>
          </div>
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
              {props.mode === "local"
                ? "Whisper y la separación de voces corren localmente; en audios largos puede tardar."
                : "Enviando el audio al proveedor de respaldo."}
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
                      <option value="ACOMPANANTE">Acompañante</option>
                      <option value="OTRO">Otro</option>
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
        ) : props.diarizedReview ? (
          <>
            <p className="meta">
              La nube separó hablantes anónimos sin asumir quién es el médico o el paciente. Asigna
              el rol de cada uno para continuar.
            </p>
            <div className="scribe-speaker-list">
              {props.diarizedReview.speakers.map((speaker) => (
                <label className="field compact-field" key={speaker.id}>
                  <span>{speaker.label}</span>
                  <select
                    value={speaker.role}
                    disabled={props.busy}
                    onChange={(event) =>
                      props.onAssignDiarizedRole(
                        speaker.id,
                        event.currentTarget.value as DiarizedSpeakerRole
                      )
                    }
                  >
                    <option value="UNASSIGNED">Sin asignar</option>
                    <option value="MEDICO">Médico</option>
                    <option value="PACIENTE">Paciente</option>
                    <option value="ACOMPANANTE">Acompañante</option>
                    <option value="OTRO">Otro</option>
                  </select>
                </label>
              ))}
            </div>
            <div className="scribe-turn-list">
              {props.diarizedReview.turns.map((turn) => {
                const speaker = props.diarizedReview?.speakers.find((s) => s.id === turn.speakerId);
                return (
                  <div className="scribe-turn" key={turn.id}>
                    <span className="meta">{speaker?.label ?? turn.speakerId}</span>
                    <p>{turn.text}</p>
                  </div>
                );
              })}
            </div>
            {!props.rolesResolved ? (
              <p className="form-error" role="alert">
                Asigna un rol a cada hablante con texto antes de continuar.
              </p>
            ) : null}
            <div className="button-row">
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
