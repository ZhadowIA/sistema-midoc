import type {
  ConflictDecision,
  MedicalHistoryConflict
} from "./medicalHistoryReconciliation";

function displayValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return String(value ?? "");
}

export function MedicalHistoryConflictReview({
  conflicts,
  decisions,
  autoMergedCount,
  onChoose,
  onContinue,
  onCancel
}: {
  conflicts: MedicalHistoryConflict[];
  decisions: Record<string, ConflictDecision>;
  autoMergedCount: number;
  onChoose: (path: string, decision: ConflictDecision) => void;
  onContinue: () => void;
  onCancel: () => void;
}) {
  const resolved = conflicts.filter((conflict) => Boolean(decisions[conflict.path])).length;
  const complete = resolved === conflicts.length;

  return (
    <div className="medical-history-workflow">
      <div className="panel-header">
        <strong>Comparar antecedentes</strong>
        <p>
          El paciente envió información nueva. Decide solo donde ambas versiones
          tienen datos distintos.
        </p>
      </div>

      {autoMergedCount > 0 ? (
        <p className="history-auto-merge">
          Se incorporaron automáticamente {autoMergedCount}{" "}
          {autoMergedCount === 1 ? "dato nuevo" : "datos nuevos"}.
        </p>
      ) : null}

      <div className="history-reconciliation-progress">
        <strong>
          {resolved} de {conflicts.length} diferencias resueltas
        </strong>
      </div>

      <div className="history-conflict-list">
        {conflicts.map((conflict) => (
          <section className="history-conflict" key={conflict.path}>
            <div className="history-conflict-title">
              <span>{conflict.groupLabel}</span>
              <strong>{conflict.fieldLabel}</strong>
            </div>
            <div className="history-conflict-columns">
              <button
                type="button"
                className={
                  decisions[conflict.path] === "current"
                    ? "history-choice history-choice-selected"
                    : "history-choice"
                }
                onClick={() => onChoose(conflict.path, "current")}
              >
                <small>Expediente actual</small>
                <span>{displayValue(conflict.currentValue)}</span>
                <b>Conservar expediente</b>
              </button>
              <button
                type="button"
                className={
                  decisions[conflict.path] === "incoming"
                    ? "history-choice history-choice-selected"
                    : "history-choice"
                }
                onClick={() => onChoose(conflict.path, "incoming")}
              >
                <small>Respuesta nueva del paciente</small>
                <span>{displayValue(conflict.incomingValue)}</span>
                <b>Usar respuesta nueva</b>
              </button>
            </div>
          </section>
        ))}
      </div>

      <div className="button-row">
        <button type="button" className="ghost-button" onClick={onCancel}>
          Cancelar
        </button>
        <button type="button" className="action-button" disabled={!complete} onClick={onContinue}>
          Revisar y editar resultado
        </button>
      </div>
    </div>
  );
}
