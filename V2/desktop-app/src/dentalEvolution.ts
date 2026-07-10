import {
  TREATMENT_PRIORITY_OPTIONS,
  TREATMENT_STATUS_OPTIONS,
  MOUTH_CONDITION_OPTIONS,
  type DentalPayload
} from "./clinicalProfiles.ts";
import { archRowsForDentition, describeTooth, hasFindings, inferDentition } from "./odontogramModel.ts";
import { computePlaqueIndex, plaqueClassification } from "./plaqueIndex.ts";

// Nota de evolucion dental (paso 26 rebanada 5b), via determinista: resume lo
// capturado en la sesion (odontograma, placa, condiciones, plan, higiene) en
// espanol listo para pegar en la nota. Es la base sin IA — la redaccion
// gobernada por LLM (DENTAL_EVOLUTION) parte del mismo contenido y siempre se
// revisa antes de usarse.

function statusLabel(list: Array<{ value: string; label: string }>, value: string): string {
  return (list.find((option) => option.value === value)?.label ?? value).toLowerCase();
}

export function buildDentalSessionSummary(payload: DentalPayload): string {
  const lines: string[] = [];

  const findings = Object.keys(payload.odontogram)
    .filter((toothId) => hasFindings(payload.odontogram[toothId]))
    .sort((a, b) => Number(a) - Number(b))
    .map((toothId) => `- ${describeTooth(toothId, payload.odontogram[toothId])}`);
  if (findings.length > 0) {
    lines.push("Hallazgos del odontograma:", ...findings);
  }

  const teeth = archRowsForDentition(inferDentition(payload.odontogram)).flatMap((row) => [
    ...row.teeth
  ]);
  const plaque = computePlaqueIndex(payload, teeth);
  if (plaque.markedSurfaces > 0 && plaque.percent !== null) {
    lines.push(
      `Indice de placa (O'Leary): ${plaque.percent}% (${plaque.markedSurfaces} de ${plaque.presentSurfaces} caras) — ${plaqueClassification(plaque.percent).label.toLowerCase()}.`
    );
  }

  const activeConditions = payload.mouthConditions.filter((entry) => !entry.resolved);
  if (activeConditions.length > 0) {
    lines.push(
      "Condiciones bucales activas: " +
        activeConditions
          .map((entry) => statusLabel(MOUTH_CONDITION_OPTIONS, entry.condition))
          .join(", ") +
        "."
    );
  }

  const planItems = payload.treatmentPlan.filter((item) => item.procedure.trim() !== "");
  if (planItems.length > 0) {
    lines.push("Plan de tratamiento:");
    for (const item of planItems) {
      lines.push(
        `- ${item.procedure.trim()} (pieza ${item.toothId.trim() || "GENERAL"}, ` +
          `${statusLabel(TREATMENT_PRIORITY_OPTIONS, item.priority)}, ` +
          `${statusLabel(TREATMENT_STATUS_OPTIONS, item.status)})`
      );
    }
  }

  if (payload.hygienePlan.trim() !== "") {
    lines.push(`Plan de higiene: ${payload.hygienePlan.trim()}`);
  }
  if (payload.nextRevision.trim() !== "") {
    lines.push(`Proxima revision: ${payload.nextRevision.trim()}`);
  }

  if (lines.length === 0) {
    return "";
  }
  return ["Evolucion dental de la sesion:", ...lines].join("\n");
}
