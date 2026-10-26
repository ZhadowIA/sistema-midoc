import { useEffect, useState } from "react";
import { call } from "./ipc";
import { contraindicationTitle, type ContraindicationAlert } from "./contraindicationsModel";

/**
 * Medicamento contra padecimiento (paso 33, etapa 5): cruza la receta con los
 * diagnosticos CIE-10 del paciente usando reglas revisadas. Solo se muestra con
 * la seguridad farmacologica encendida. Determinista, sin IA.
 */
export function ContraindicationAlerts({ encounterId, prescription }: { encounterId: string; prescription: string }) {
  const [alerts, setAlerts] = useState<ContraindicationAlert[]>([]);

  useEffect(() => {
    if (!prescription.trim()) {
      setAlerts([]);
      return;
    }
    const timer = setTimeout(() => {
      call<ContraindicationAlert[]>("check_contraindications", { encounterId, prescription })
        .then(setAlerts)
        .catch(() => setAlerts([]));
    }, 700);
    return () => clearTimeout(timer);
  }, [encounterId, prescription]);

  if (alerts.length === 0) return null;

  return (
    <section className="panel-plain">
      <h3>Medicamento y padecimientos del paciente</h3>
      <div className="stack">
        {alerts.map((alert, index) => (
          <div
            key={`${alert.drug}-${alert.diagnosis_code}-${index}`}
            className={`med-alert ${alert.severity === "CONTRAINDICADA" ? "med-contraindicated" : "med-moderate"}`}
          >
            <strong>
              {alert.severity === "CONTRAINDICADA" ? "Contraindicación" : "Precaución"}: {contraindicationTitle(alert)}
            </strong>
            {alert.recommendation ? <p>{alert.recommendation}</p> : null}
            <p className="meta">Fuente: {alert.source}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
