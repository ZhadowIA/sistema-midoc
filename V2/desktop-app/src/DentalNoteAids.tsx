import { useState } from "react";
import { call } from "./ipc";
import type { DentalPayload, TreatmentPlanItem } from "./clinicalProfiles.ts";
import { buildDentalSessionSummary } from "./dentalEvolution.ts";
import {
  composePostOpInstructions,
  inferPostOpKinds,
  POST_OP_KINDS,
  POST_OP_TEMPLATES,
  type PostOpKind
} from "./postOpInstructions.ts";
import { AutoGrowTextarea } from "./AutoGrowTextarea";

// Ayudas de redaccion del modulo dental (paso 26 rebanadas 5b/5c). Ambas
// producen BORRADORES editables que el dentista inserta explicitamente en la
// nota; nada se escribe solo. La via sin IA siempre existe (regla del paso 11).

interface TextDraftResponse {
  run_id: string;
  provider: string;
  model_version: string;
  text: string;
}

export function DentalEvolutionPanel({
  patientId,
  encounterId,
  payload,
  disabled,
  onInsert
}: {
  patientId: string;
  encounterId: string;
  payload: DentalPayload;
  disabled: boolean;
  onInsert: (text: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [meta, setMeta] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const consentMissing = error !== null && /consentimiento/i.test(error);

  async function grantTextConsent() {
    setWorking(true);
    try {
      // Consentimiento TEXT_ASSIST del paso 11 (queda registrado y auditado).
      await call("ai_grant_consent", { patientId });
      setError(null);
      await generateWithAi();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setWorking(false);
    }
  }

  function generateDeterministic() {
    const summary = buildDentalSessionSummary(payload);
    setError(null);
    setMeta(null);
    if (summary === "") {
      setError("La sesion aun no tiene nada capturado que resumir.");
      return;
    }
    setDraft(summary);
    setMeta("Resumen determinista de lo capturado (sin IA).");
  }

  async function generateWithAi() {
    setWorking(true);
    setError(null);
    setMeta(null);
    try {
      const response = await call<TextDraftResponse>("ai_assist_text", {
        encounterId,
        usageType: "DENTAL_EVOLUTION"
      });
      setDraft(response.text);
      setMeta(`Borrador IA (${response.provider} · ${response.model_version}) — revisalo antes de usarlo.`);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="dental-note-aid">
      <div className="panel-header">
        <h4>Nota de evolucion</h4>
        <p>
          Redacta la evolucion desde lo capturado en la sesion. La via sin IA siempre esta
          disponible; el borrador se inserta en O · Objetivo solo cuando tu lo decidas.
        </p>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      {consentMissing && !disabled ? (
        <div className="button-row">
          <button
            className="ghost-button"
            type="button"
            disabled={working}
            onClick={() => void grantTextConsent()}
          >
            Registrar consentimiento del paciente y redactar
          </button>
        </div>
      ) : null}
      {!disabled ? (
        <div className="button-row">
          <button className="action-button" type="button" onClick={generateDeterministic}>
            Resumen de la sesion (sin IA)
          </button>
          <button
            className="ghost-button"
            type="button"
            disabled={working}
            onClick={() => void generateWithAi()}
          >
            {working ? "Redactando..." : "Redactar con IA"}
          </button>
        </div>
      ) : null}
      {draft !== "" ? (
        <div className="dental-aid-draft">
          {meta ? <p className="dental-aid-meta">{meta}</p> : null}
          <AutoGrowTextarea
            rows={5}
            value={draft}
            disabled={disabled}
            onChange={(event) => setDraft(event.currentTarget.value)}
          />
          <div className="button-row">
            <button
              className="action-button"
              type="button"
              disabled={disabled || draft.trim() === ""}
              onClick={() => {
                onInsert(draft.trim());
                setDraft("");
                setMeta(null);
              }}
            >
              Insertar en la nota (O · Objetivo)
            </button>
            <button className="ghost-button" type="button" onClick={() => setDraft("")}>
              Descartar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PostOpInstructionsPanel({
  treatmentPlan,
  disabled,
  onInsert
}: {
  treatmentPlan: TreatmentPlanItem[];
  disabled: boolean;
  onInsert: (text: string) => void;
}) {
  const [selected, setSelected] = useState<PostOpKind[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const suggested = inferPostOpKinds(treatmentPlan);
  const preview = composePostOpInstructions(selected);

  function toggle(kind: PostOpKind) {
    setSelected((current) =>
      current.includes(kind) ? current.filter((entry) => entry !== kind) : [...current, kind]
    );
  }

  return (
    <div className="dental-note-aid">
      <div className="panel-header">
        <h4>Indicaciones post-operatorias</h4>
        <p>
          Plantillas revisadas en lenguaje llano por procedimiento. Se sugieren desde el plan de
          tratamiento y se insertan en Indicaciones al paciente.
        </p>
      </div>
      {message ? <p className="form-success">{message}</p> : null}
      <div className="postop-kind-list">
        {POST_OP_KINDS.map((kind) => (
          <label className="dictation-proposal" key={kind}>
            <input
              type="checkbox"
              checked={selected.includes(kind)}
              disabled={disabled}
              onChange={() => toggle(kind)}
            />
            <span>
              {POST_OP_TEMPLATES[kind].label}
              {suggested.includes(kind) ? (
                <em className="postop-suggested"> · sugerida por el plan</em>
              ) : null}
            </span>
          </label>
        ))}
      </div>
      {!disabled && suggested.length > 0 ? (
        <div className="button-row">
          <button className="ghost-button" type="button" onClick={() => setSelected(suggested)}>
            Marcar las sugeridas ({suggested.length})
          </button>
        </div>
      ) : null}
      {preview !== "" ? (
        <div className="dental-aid-draft">
          <pre className="postop-preview">{preview}</pre>
          <div className="button-row">
            <button
              className="action-button"
              type="button"
              disabled={disabled}
              onClick={() => {
                onInsert(preview);
                setSelected([]);
                setMessage("Indicaciones insertadas en la nota; ajustalas al caso antes de firmar.");
              }}
            >
              Insertar en Indicaciones al paciente
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
