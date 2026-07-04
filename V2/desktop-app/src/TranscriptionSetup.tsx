import { useCallback, useEffect, useRef, useState } from "react";
import { call } from "./ipc";

/**
 * Configuracion de transcripcion local (Whisper). Detecta el hardware del
 * equipo y sugiere el tamano de modelo adecuado, para que el medico no tenga
 * que entender de tamanos de modelo. La transcripcion corre en el dispositivo
 * (local-first); la nube solo se sugiere como respaldo con consentimiento.
 *
 * Antes de transcribir, el medico descarga aqui los pesos del modelo sugerido.
 * Son REFERENCIA publica (no PHI) y se comparten entre perfiles; la descarga
 * muestra progreso y se puede reanudar.
 */

interface TranscriptionRecommendation {
  totalRamMb: number;
  cpuCores: number;
  hasGpu: boolean;
  accel: string;
  accelLabel: string;
  modelId: string;
  modelLabel: string;
  modelRamMb: number;
  diskMb: number;
  realtimeCapable: boolean;
  recommendCloudFallback: boolean;
  reason: string;
}

interface ModelStatus {
  modelId: string;
  fileName: string;
  expectedSizeBytes: number;
  downloadedBytes: number;
  present: boolean;
  verified: boolean;
  downloading: boolean;
  error: string | null;
}

function gb(mb: number): string {
  return `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB`;
}

function bytesToGb(bytes: number): string {
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function bytesToMb(bytes: number): string {
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}

// Etiquetas legibles de los dos modelos ONNX de diarizacion (el backend solo
// devuelve el identificador estable y el nombre de archivo).
const DIARIZATION_LABELS: Record<string, string> = {
  "diarization-segmentation": "Segmentacion de voz (detecta cuando hay habla)",
  "diarization-embedding": "Identificacion de hablante (separa las voces)"
};

export function TranscriptionSetup() {
  const [rec, setRec] = useState<TranscriptionRecommendation | null>(null);
  const [models, setModels] = useState<ModelStatus[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  // Marca local: el backend aun no registro la descarga, pero queremos arrancar
  // el sondeo y deshabilitar el boton de inmediato (evita dobles clics que
  // lanzarian descargas concurrentes).
  const [starting, setStarting] = useState(false);
  // Marca optimista equivalente para la descarga del modelo VAD (saltar silencios).
  const [vadStarting, setVadStarting] = useState(false);
  const pollRef = useRef<number | null>(null);

  const loadModels = useCallback(async () => {
    try {
      setModels(await call<ModelStatus[]>("transcription_model_status"));
    } catch (e) {
      setError(String(e));
    }
  }, []);

  async function detect() {
    setBusy(true);
    setError("");
    try {
      setRec(await call<TranscriptionRecommendation>("transcription_recommendation"));
      await loadModels();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  const recommended = rec ? models.find((m) => m.modelId === rec.modelId) ?? null : null;
  // Modelo VAD (saltar silencios): opcional pero recomendado en CPU. Acelera la
  // transcripcion recortando los silencios; sin el, se transcribe todo el audio.
  const vad = models.find((m) => m.modelId === "vad-silero") ?? null;

  // En cuanto el backend confirma la descarga, soltamos la marca optimista.
  useEffect(() => {
    if (starting && recommended?.downloading) setStarting(false);
  }, [starting, recommended?.downloading]);

  useEffect(() => {
    if (vadStarting && vad?.downloading) setVadStarting(false);
  }, [vadStarting, vad?.downloading]);

  // Sondea el estado mientras hay una descarga en curso, para pintar el avance.
  useEffect(() => {
    const downloading =
      starting ||
      vadStarting ||
      (recommended?.downloading ?? false) ||
      (vad?.downloading ?? false);
    if (downloading && pollRef.current === null) {
      pollRef.current = window.setInterval(() => void loadModels(), 800);
    } else if (!downloading && pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current !== null) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [starting, vadStarting, recommended?.downloading, vad?.downloading, loadModels]);

  async function downloadRecommended() {
    if (!rec || starting || recommended?.downloading) return;
    setError("");
    // Marca optimista: arranca el sondeo y deshabilita el boton ya, sin esperar
    // a que el backend registre la descarga (asi no se lanzan dos a la vez).
    setStarting(true);
    try {
      await call("download_transcription_model", { modelId: rec.modelId });
    } catch (e) {
      setError(String(e));
    } finally {
      setStarting(false);
      await loadModels();
    }
  }

  async function downloadVad() {
    if (vadStarting || vad?.downloading) return;
    setError("");
    setVadStarting(true);
    try {
      await call("download_transcription_model", { modelId: "vad-silero" });
    } catch (e) {
      setError(String(e));
    } finally {
      setVadStarting(false);
      await loadModels();
    }
  }

  useEffect(() => {
    void detect();
  }, []);

  return (
    <>
    <section className="panel">
      <div className="panel-header">
        <h2>Transcripcion de consulta</h2>
        <p>
          La transcripcion corre cifrada en esta computadora (sin enviar audio a la nube).
          MiDoc revisa tu equipo y elige el modelo adecuado por ti.
        </p>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {busy ? (
        <p className="meta">Revisando tu equipo…</p>
      ) : rec ? (
        <div className="stack">
          <div className="empty-state">
            <strong>Modelo sugerido: {rec.modelLabel}</strong>
            <p>{rec.reason}</p>
          </div>

          <dl className="spec-grid">
            <div>
              <dt>Memoria del equipo</dt>
              <dd>{gb(rec.totalRamMb)}</dd>
            </div>
            <div>
              <dt>Nucleos de CPU</dt>
              <dd>{rec.cpuCores}</dd>
            </div>
            <div>
              <dt>Aceleracion</dt>
              <dd>{rec.accelLabel}</dd>
            </div>
            <div>
              <dt>El modelo usa</dt>
              <dd>
                ~{gb(rec.modelRamMb)} en memoria · ~{gb(rec.diskMb)} en disco
              </dd>
            </div>
            <div>
              <dt>Velocidad</dt>
              <dd>
                {rec.realtimeCapable
                  ? "Casi en vivo mientras hablas"
                  : "Por lotes: grabas y obtienes el texto al terminar"}
              </dd>
            </div>
          </dl>

          <div className="model-download">
            {recommended?.present ? (
              <p className="form-success" role="status">
                Modelo descargado y listo para transcribir sin conexion
                {recommended.verified ? " (verificado)." : "."}
              </p>
            ) : starting || recommended?.downloading ? (
              <div className="stack">
                <div
                  className="model-progress"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={recommended?.expectedSizeBytes ?? 0}
                  aria-valuenow={recommended?.downloadedBytes ?? 0}
                >
                  <span
                    className="model-progress-bar"
                    style={{
                      width: `${
                        recommended && recommended.expectedSizeBytes > 0
                          ? Math.min(
                              100,
                              Math.round(
                                (recommended.downloadedBytes / recommended.expectedSizeBytes) * 100
                              )
                            )
                          : 0
                      }%`
                    }}
                  />
                </div>
                <p className="meta">
                  Descargando… {bytesToGb(recommended?.downloadedBytes ?? 0)} de{" "}
                  {bytesToGb(recommended?.expectedSizeBytes ?? rec.diskMb * 1024 * 1024)}
                </p>
              </div>
            ) : (
              <button className="action-button" onClick={() => void downloadRecommended()}>
                Descargar modelo (~{gb(rec.diskMb)})
              </button>
            )}
            {recommended?.error && (
              <p className="form-error" role="alert">
                {recommended.error}
              </p>
            )}
          </div>

          <div className="model-download">
            <p className="meta">
              Acelerador opcional: el detector de voz (VAD) salta los silencios de la
              consulta para transcribir mas rapido en equipos sin GPU, sin perder precision.
            </p>
            {vad?.present ? (
              <p className="form-success" role="status">
                Detector de voz listo: se saltaran los silencios al transcribir
                {vad.verified ? " (verificado)." : "."}
              </p>
            ) : vadStarting || vad?.downloading ? (
              <div className="stack">
                <div
                  className="model-progress"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={vad?.expectedSizeBytes ?? 0}
                  aria-valuenow={vad?.downloadedBytes ?? 0}
                >
                  <span
                    className="model-progress-bar"
                    style={{
                      width: `${
                        vad && vad.expectedSizeBytes > 0
                          ? Math.min(
                              100,
                              Math.round((vad.downloadedBytes / vad.expectedSizeBytes) * 100)
                            )
                          : 0
                      }%`
                    }}
                  />
                </div>
                <p className="meta">
                  Descargando detector de voz… {bytesToMb(vad?.downloadedBytes ?? 0)} de{" "}
                  {bytesToMb(vad?.expectedSizeBytes ?? 0)}
                </p>
              </div>
            ) : (
              <button className="ghost-button" onClick={() => void downloadVad()}>
                Descargar detector de voz (~{bytesToMb(vad?.expectedSizeBytes ?? 885098)})
              </button>
            )}
            {vad?.error && (
              <p className="form-error" role="alert">
                {vad.error}
              </p>
            )}
          </div>

          {rec.recommendCloudFallback && (
            <p className="form-success" role="status">
              Tu equipo esta por debajo del minimo comodo para transcripcion local fluida.
              Puedes usar el modelo pequeno sin conexion, o activar la transcripcion en nube
              (con consentimiento del paciente y datos seudonimizados) si prefieres mayor
              velocidad o precision.
            </p>
          )}

          <div className="button-row">
            <button className="ghost-button" onClick={() => void detect()} disabled={busy}>
              Volver a revisar el equipo
            </button>
          </div>
        </div>
      ) : null}
    </section>
    <DiarizationModelsSetup />
    </>
  );
}

/**
 * Descarga de los modelos de separacion de voces (diarizacion local con
 * sherpa-onnx). Son dos modelos ONNX (segmentacion + embedding) que corren en el
 * dispositivo, igual que Whisper: REFERENCIA publica, sin enviar audio a la nube.
 * Con ellos, la transcripcion puede separarse en turnos Medico/Paciente; sin ellos,
 * la consulta se transcribe igual (solo sin la separacion automatica de hablantes).
 */
export function DiarizationModelsSetup() {
  const [models, setModels] = useState<ModelStatus[]>([]);
  const [error, setError] = useState("");
  // Modelo cuya descarga acabamos de lanzar (marca optimista antes de que el
  // backend la registre), para deshabilitar su boton y arrancar el sondeo.
  const [starting, setStarting] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      setModels(await call<ModelStatus[]>("diarization_model_status"));
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const anyDownloading = starting !== null || models.some((m) => m.downloading);

  // Suelta la marca optimista cuando el backend confirma la descarga.
  useEffect(() => {
    if (starting && models.find((m) => m.modelId === starting)?.downloading) {
      setStarting(null);
    }
  }, [starting, models]);

  // Sondea mientras haya alguna descarga en curso, para pintar el avance.
  useEffect(() => {
    if (anyDownloading && pollRef.current === null) {
      pollRef.current = window.setInterval(() => void load(), 800);
    } else if (!anyDownloading && pollRef.current !== null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current !== null) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [anyDownloading, load]);

  useEffect(() => {
    void load();
  }, [load]);

  async function download(modelId: string) {
    const current = models.find((m) => m.modelId === modelId);
    if (starting || current?.downloading) return;
    setError("");
    setStarting(modelId);
    try {
      await call("download_diarization_model", { modelId });
    } catch (e) {
      setError(String(e));
    } finally {
      setStarting(null);
      await load();
    }
  }

  const allReady = models.length > 0 && models.every((m) => m.present);

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Separacion de voces (medico y paciente)</h2>
        <p>
          Opcional: separa la transcripcion en turnos de medico y paciente. Corre en
          esta computadora (sin enviar audio a la nube). Sin estos modelos, la
          consulta se transcribe igual, solo sin la separacion automatica.
        </p>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {allReady && (
        <p className="form-success" role="status">
          Modelos de separacion de voces listos: la transcripcion se dividira en
          turnos de medico y paciente para tu revision.
        </p>
      )}

      <div className="stack">
        {models.map((model) => {
          const downloading = starting === model.modelId || model.downloading;
          const pct =
            model.expectedSizeBytes > 0
              ? Math.min(100, Math.round((model.downloadedBytes / model.expectedSizeBytes) * 100))
              : 0;
          return (
            <div className="model-download" key={model.modelId}>
              <strong>{DIARIZATION_LABELS[model.modelId] ?? model.fileName}</strong>
              {model.present ? (
                <p className="form-success" role="status">
                  Descargado y listo{model.verified ? " (verificado)." : "."}
                </p>
              ) : downloading ? (
                <div className="stack">
                  <div
                    className="model-progress"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={model.expectedSizeBytes}
                    aria-valuenow={model.downloadedBytes}
                  >
                    <span className="model-progress-bar" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="meta">
                    Descargando… {bytesToMb(model.downloadedBytes)} de{" "}
                    {bytesToMb(model.expectedSizeBytes)}
                  </p>
                </div>
              ) : (
                <button
                  className="action-button"
                  onClick={() => void download(model.modelId)}
                  disabled={starting !== null}
                >
                  Descargar ({bytesToMb(model.expectedSizeBytes)})
                </button>
              )}
              {model.error && (
                <p className="form-error" role="alert">
                  {model.error}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
