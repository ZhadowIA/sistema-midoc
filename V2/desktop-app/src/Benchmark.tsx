import { useCallback, useEffect, useState } from "react";
import { call } from "./ipc";

/**
 * Benchmark clinico de IA (paso 11): compara proveedores con casos SIMULADOS
 * (sin PHI) y documenta una decision. La ejecucion reusa la capa multi-proveedor
 * local; el proveedor real entra en staging con BAA.
 */

interface BenchmarkResult {
  provider: string;
  success_count: number;
  avg_latency_ms: number;
  total_cost_cents: number;
  completeness_pct: number;
}

interface BenchmarkRun {
  id: string;
  name: string;
  case_count: number;
  recommended_provider: string | null;
  notes: string | null;
  created_at: string;
  results: BenchmarkResult[];
}

const dateTimeFormatter = new Intl.DateTimeFormat("es-MX", {
  dateStyle: "medium",
  timeStyle: "short"
});
const centsFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN"
});

export function Benchmark() {
  const [runs, setRuns] = useState<BenchmarkRun[]>([]);
  const [name, setName] = useState("Comparativa de proveedores");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    call<BenchmarkRun[]>("ai_list_benchmarks")
      .then(setRuns)
      .catch((e: unknown) => setError(String(e)));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  function runBenchmark() {
    setBusy(true);
    setMessage("");
    setError("");
    call<BenchmarkRun>("ai_run_benchmark", { name })
      .then((run) => {
        setMessage(
          run.recommended_provider
            ? `Benchmark ejecutado. Proveedor recomendado: ${run.recommended_provider}.`
            : "Benchmark ejecutado."
        );
        refresh();
      })
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setBusy(false));
  }

  return (
    <div className="content">
      <section className="panel">
        <div className="panel-header">
          <h2>Benchmark clinico de IA</h2>
          <p>
            Compara proveedores con casos simulados (sin datos de pacientes) por exito,
            completitud, costo y latencia, y documenta el proveedor recomendado. El
            proveedor real se evalua en staging con acuerdo (BAA).
          </p>
        </div>
        <div className="button-row">
          <label className="field grow-field">
            <span>Nombre de la corrida</span>
            <input value={name} onChange={(e) => setName(e.currentTarget.value)} disabled={busy} />
          </label>
          <button className="action-button" onClick={runBenchmark} disabled={busy || !name.trim()}>
            {busy ? "Ejecutando…" : "Ejecutar benchmark"}
          </button>
        </div>
        {message && (
          <p className="form-success" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </section>

      {runs.length === 0 ? (
        <section className="panel">
          <div className="empty-state">
            <strong>Sin corridas todavia</strong>
            <p>Ejecuta un benchmark para comparar proveedores y registrar la decision.</p>
          </div>
        </section>
      ) : (
        runs.map((run) => (
          <section className="panel" key={run.id}>
            <div className="panel-header">
              <h3>{run.name}</h3>
              <p>
                {dateTimeFormatter.format(new Date(run.created_at))} · {run.case_count} casos
              </p>
            </div>
            {run.recommended_provider ? (
              <p className="meta">
                <span className="pill pill-success">Recomendado: {run.recommended_provider}</span>
              </p>
            ) : null}
            {run.notes ? <p className="meta">{run.notes}</p> : null}
            <ul className="appointment-list">
              {run.results.map((result) => (
                <li key={result.provider} className="list-row">
                  <div className="list-row-main">
                    <strong>
                      {result.provider}
                      {result.provider === run.recommended_provider ? " ★" : ""}
                    </strong>
                    <span className="meta">
                      {result.success_count}/{run.case_count} exitos · completitud{" "}
                      {result.completeness_pct}% · {centsFormatter.format(result.total_cost_cents / 100)}{" "}
                      · {result.avg_latency_ms} ms promedio
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
