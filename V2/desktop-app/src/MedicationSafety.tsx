import { useState } from "react";
import { call } from "./ipc";
import { AutoGrowTextarea } from "./AutoGrowTextarea";

/**
 * Verificacion determinista de seguridad de la prescripcion (paso 14): el medico
 * lista los medicamentos y MiDoc revisa interacciones, alergias cruzadas y
 * duplicidad terapeutica contra una base de referencia local, citando la fuente.
 * No usa IA. La prescripcion no sale del equipo.
 */

interface NormalizedDrug {
  input: string;
  ingredient: string | null;
  displayName: string | null;
  drugClass: string | null;
  recognized: boolean;
}

interface InteractionAlert {
  drugA: string;
  drugB: string;
  severity: string;
  description: string;
  source: string;
  sourceVersion: string;
}

interface AllergyAlert {
  drug: string;
  matchedAllergy: string;
  viaClass: string | null;
  source: string;
}

interface DuplicateTherapyAlert {
  drugA: string;
  drugB: string;
  drugClass: string;
}

interface LabelNote {
  drugA: string;
  drugB: string;
  text: string;
  source: string;
}

interface SafetyReport {
  normalized: NormalizedDrug[];
  unrecognized: string[];
  interactions: InteractionAlert[];
  allergyAlerts: AllergyAlert[];
  duplicateTherapy: DuplicateTherapyAlert[];
  labelNotes: LabelNote[];
  referenceVersion: string;
  hasAlerts: boolean;
}

const SEVERITY_LABEL: Record<string, string> = {
  CONTRAINDICATED: "Contraindicado",
  MAJOR: "Grave",
  MODERATE: "Moderada",
  MINOR: "Leve",
  UNKNOWN: "No clasificada"
};

export function MedicationSafety({
  encounterId,
  disabled,
  prescription
}: {
  encounterId: string;
  disabled: boolean;
  prescription: string;
}) {
  const [text, setText] = useState("");
  const [report, setReport] = useState<SafetyReport | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function fillFromPrescription() {
    setBusy(true);
    setError("");
    try {
      const found = await call<string[]>("extract_prescription_medications", { prescription });
      if (found.length === 0) {
        setError("No se reconocio ningun medicamento en la receta.");
      } else {
        setText(found.join("\n"));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    const medications = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (medications.length === 0) {
      setError("Escribe al menos un medicamento (uno por linea).");
      return;
    }
    setBusy(true);
    setError("");
    try {
      setReport(await call<SafetyReport>("check_medication_safety", { encounterId, medications }));
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel-plain">
      <h3>Seguridad de la prescripcion</h3>
      <p className="meta">
        Revision determinista (sin IA) de interacciones, alergias cruzadas y duplicidad. Escribe un
        medicamento por linea.
      </p>
      <div className="stack">
        <AutoGrowTextarea
          rows={3}
          placeholder={"Ibuprofeno\nWarfarina"}
          value={text}
          disabled={busy || disabled}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="button-row">
          <button className="action-button" onClick={() => void verify()} disabled={busy || disabled}>
            {busy ? "Verificando…" : "Verificar seguridad"}
          </button>
          <button
            className="ghost-button"
            onClick={() => void fillFromPrescription()}
            disabled={busy || disabled || prescription.trim().length === 0}
          >
            Tomar de la receta
          </button>
        </div>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        {report && (
          <div className="stack">
            {!report.hasAlerts && report.unrecognized.length === 0 && report.labelNotes.length === 0 && (
              <p className="form-success" role="status">
                Sin interacciones, alergias ni duplicidades detectadas en la base local.
              </p>
            )}

            {report.interactions.map((alert, i) => (
              <div className={`med-alert med-${alert.severity.toLowerCase()}`} key={`int-${i}`}>
                <strong>
                  Interaccion ({SEVERITY_LABEL[alert.severity] ?? alert.severity}): {alert.drugA} +{" "}
                  {alert.drugB}
                </strong>
                <p>{alert.description}</p>
                <p className="meta">Fuente: {alert.source}</p>
              </div>
            ))}

            {report.allergyAlerts.map((alert, i) => (
              <div className="med-alert med-allergy" key={`alg-${i}`}>
                <strong>Alergia: {alert.drug}</strong>
                <p>
                  Coincide con la alergia registrada &quot;{alert.matchedAllergy}&quot;
                  {alert.viaClass ? ` (clase ${alert.viaClass})` : ""}.
                </p>
                <p className="meta">Fuente: {alert.source}</p>
              </div>
            ))}

            {report.duplicateTherapy.map((alert, i) => (
              <div className="med-alert med-duplicate" key={`dup-${i}`}>
                <strong>Duplicidad terapeutica: {alert.drugA} + {alert.drugB}</strong>
                <p>Ambos pertenecen a la clase {alert.drugClass}.</p>
              </div>
            ))}

            {report.labelNotes.map((note, i) => (
              <div className="med-alert med-label" key={`lbl-${i}`}>
                <strong>
                  Posible interaccion segun etiqueta: {note.drugA} + {note.drugB}
                </strong>
                <p>{note.text}</p>
                <p className="meta">
                  Sin interaccion estructurada para este par; evidencia de la etiqueta. Fuente:{" "}
                  {note.source}.
                </p>
              </div>
            ))}

            {report.unrecognized.length > 0 && (
              <p className="meta">
                No reconocidos en la base local (no verificados): {report.unrecognized.join(", ")}.
              </p>
            )}

            <p className="meta">Base de referencia: {report.referenceVersion}.</p>
          </div>
        )}
      </div>
    </section>
  );
}
