/**
 * Medicamento contra padecimiento y alertas graves al firmar (paso 33, etapa 5).
 * Modulo puro para `node --test`; el cruce lo hace Rust.
 */

export interface ContraindicationAlert {
  drug: string;
  line: string;
  condition: string;
  diagnosis_code: string;
  diagnosis_name: string;
  /** CONTRAINDICADA | PRECAUCION. */
  severity: string;
  recommendation: string;
  source: string;
  current_encounter: boolean;
}

export interface SevereAlert {
  key: string;
  text: string;
}

export interface PendingSevereAlerts {
  alerts: SevereAlert[];
  fingerprint: string;
  acknowledged: boolean;
}

/** "Ibuprofeno — Úlcera gástrica (K25.9, diagnóstico de una consulta anterior)". */
export function contraindicationTitle(alert: ContraindicationAlert): string {
  const origin = alert.current_encounter ? "diagnóstico de esta consulta" : "diagnóstico de una consulta anterior";
  return `${alert.drug} — ${alert.condition} (${alert.diagnosis_code}, ${origin})`;
}

/**
 * Texto de la confirmacion antes de firmar. El medico decide; lo que confirma
 * queda en la bitacora (sin nombres, solo una huella).
 */
export function confirmationText(pending: PendingSevereAlerts): string {
  const lines = pending.alerts.map((alert) => `• ${alert.text}`);
  return [
    `La receta tiene ${pending.alerts.length === 1 ? "una alerta grave" : `${pending.alerts.length} alertas graves`}:`,
    "",
    ...lines,
    "",
    "¿Confirmas que las revisaste y decides continuar? Tu confirmación quedará registrada."
  ].join("\n");
}
