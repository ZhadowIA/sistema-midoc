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

export function TranscriptionSetup() {
  const [rec, setRec] = useState<TranscriptionRecommendation | null>(null);
  const [models, setModels] = useState<ModelStatus[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
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

  // Sondea el estado mientras hay una descarga en curso, para pintar el avance.
  useEffect(() => {
    const downloading = recommended?.downloading ?? false;
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
  }, [recommended?.downloading, loadModels]);

  async function downloadRecommended() {
    if (!rec) return;
    setError("");
    try {
      // Marca de inmediato el estado para que arranque el sondeo de progreso.
      await loadModels();
      void call("download_transcription_model", { modelId: rec.modelId }).then(
        () => void loadModels(),
        (e) => setError(String(e))
      );
      await loadModels();
    } catch (e) {
      setError(String(e));
    }
  }

  useEffect(() => {
    void detect();
  }, []);

  return (
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
              <dd>{rec.hasGpu ? "GPU compatible detectada" : "Sin GPU dedicada (usa CPU)"}</dd>
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
            ) : recommended?.downloading ? (
              <div className="stack">
                <div
                  className="model-progress"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={recommended.expectedSizeBytes}
                  aria-valuenow={recommended.downloadedBytes}
                >
                  <span
                    className="model-progress-bar"
                    style={{
                      width: `${
                        recommended.expectedSizeBytes > 0
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
                  Descargando… {bytesToGb(recommended.downloadedBytes)} de{" "}
                  {bytesToGb(recommended.expectedSizeBytes)}
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
  );
}
