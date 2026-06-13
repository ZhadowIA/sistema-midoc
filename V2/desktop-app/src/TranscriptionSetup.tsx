import { useEffect, useState } from "react";
import { call } from "./ipc";

/**
 * Configuracion de transcripcion local (Whisper). Detecta el hardware del
 * equipo y sugiere el tamano de modelo adecuado, para que el medico no tenga
 * que entender de tamanos de modelo. La transcripcion corre en el dispositivo
 * (local-first); la nube solo se sugiere como respaldo con consentimiento.
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

function gb(mb: number): string {
  return `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB`;
}

export function TranscriptionSetup() {
  const [rec, setRec] = useState<TranscriptionRecommendation | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);

  async function detect() {
    setBusy(true);
    setError("");
    try {
      setRec(await call<TranscriptionRecommendation>("transcription_recommendation"));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
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
