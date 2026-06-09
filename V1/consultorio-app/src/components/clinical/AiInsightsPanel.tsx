"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkles, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/Button";
import { AiClinicalDisclaimer } from "@/components/clinical/AiClinicalDisclaimer";
import {
  buildInsightApplicationKey,
  getInsightAction,
  isInsightApplied,
  markInsightAction,
} from "@/lib/aiInsights";
import type { AIInsightAction } from "@/lib/aiInsightsTypes";

type Diagnosis = { diagnosis: string; reasoning?: string };
type Treatment = { treatment: string; instructions?: string };

type Insights = {
  diagnoses?: Diagnosis[];
  treatments?: Treatment[];
  allowedFoods?: string[];
  forbiddenFoods?: string[];
};

type Soap = {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
};

type Props = {
  appointmentId: string;
  soap: Soap;
  disabled?: boolean;
  onApplyDiagnosis: (text: string) => void;
  onApplyTreatment: (text: string) => void;
};

export function AiInsightsPanel({
  appointmentId,
  soap,
  disabled,
  onApplyDiagnosis,
  onApplyTreatment,
}: Props) {
  // Loading local y no unificado con combinedSaveState del workspace: generar
  // sugerencias es una acción one-shot del usuario, no un autosave. Mezclarlo
  // haría que disparar IA marcara "Guardando..." en el header.
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Insights | null>(null);
  const [diagnosisActions, setDiagnosisActions] = useState<Record<string, AIInsightAction>>({});
  const [treatmentActions, setTreatmentActions] = useState<Record<string, AIInsightAction>>({});

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/clinical/admin/appointments/${appointmentId}/ai-insights`, {
      credentials: "include",
    })
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        if (body && !body.error) setData(body as Insights);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [appointmentId]);

  const generate = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/clinical/admin/appointments/${appointmentId}/ai-insights`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ soap }),
        },
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Error generando sugerencias");
      setData(body as Insights);
      setDiagnosisActions({});
      setTreatmentActions({});
      toast.success("Sugerencias generadas.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error generando sugerencias");
    } finally {
      setLoading(false);
    }
  }, [appointmentId, soap]);

  const hasData =
    data &&
    ((data.diagnoses?.length ?? 0) > 0 ||
      (data.treatments?.length ?? 0) > 0 ||
      (data.allowedFoods?.length ?? 0) > 0 ||
      (data.forbiddenFoods?.length ?? 0) > 0);

  const trackAction = useCallback(
    async (
      kind: "DIAGNOSIS" | "TREATMENT",
      text: string,
      action: AIInsightAction,
      editedText?: string,
    ) => {
      await fetch(`/api/clinical/admin/appointments/${appointmentId}/ai-insights/apply`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, text, action, editedText }),
      }).catch(() => undefined);
    },
    [appointmentId],
  );

  const applyDiagnosis = useCallback(
    (diagnosis: string, action: AIInsightAction = "APPLIED", editedText?: string) => {
      const targetText = editedText?.trim() || diagnosis;
      const key = buildInsightApplicationKey(diagnosis);
      if (!key) return;
      if (action === "APPLIED" || action === "EDITED") {
        onApplyDiagnosis(targetText);
      }
      setDiagnosisActions((prev) => markInsightAction(prev, diagnosis, action));
      void trackAction("DIAGNOSIS", diagnosis, action, editedText);
      if (action === "APPLIED") {
        toast.success("Diagnóstico aplicado en Assessment.");
      } else if (action === "EDITED") {
        toast.success("Diagnóstico editado y aplicado.");
      } else if (action === "REJECTED") {
        toast.success("Diagnóstico rechazado.");
      } else {
        toast.success("Diagnóstico ignorado.");
      }
    },
    [onApplyDiagnosis, trackAction],
  );

  const applyTreatment = useCallback(
    (treatment: string, instructions?: string, action: AIInsightAction = "APPLIED", editedText?: string) => {
      const payload = instructions ? `${treatment} — ${instructions}` : treatment;
      const key = buildInsightApplicationKey(payload);
      if (!key) return;
      const targetText = editedText?.trim() || payload;
      if (action === "APPLIED" || action === "EDITED") {
        onApplyTreatment(targetText);
      }
      setTreatmentActions((prev) => markInsightAction(prev, payload, action));
      void trackAction("TREATMENT", payload, action, editedText);
      if (action === "APPLIED") {
        toast.success("Tratamiento aplicado en Plan.");
      } else if (action === "EDITED") {
        toast.success("Tratamiento editado y aplicado.");
      } else if (action === "REJECTED") {
        toast.success("Tratamiento rechazado.");
      } else {
        toast.success("Tratamiento ignorado.");
      }
    },
    [onApplyTreatment, trackAction],
  );

  const resolveActionLabel = (action: AIInsightAction | undefined) => {
    if (action === "EDITED") return "Editado";
    if (action === "REJECTED") return "Rechazado";
    if (action === "IGNORED") return "Ignorado";
    if (action === "APPLIED") return "Aplicado";
    return null;
  };

  const applyDiagnosisDeprecated = useCallback(
    (diagnosis: string) => {
      const key = buildInsightApplicationKey(diagnosis);
      if (!key || diagnosisActions[key]) return;
      onApplyDiagnosis(diagnosis);
      setDiagnosisActions((prev) => markInsightAction(prev, diagnosis, "APPLIED"));
      void trackAction("DIAGNOSIS", diagnosis, "APPLIED");
    },
    [diagnosisActions, onApplyDiagnosis, trackAction],
  );

  const applyTreatmentDeprecated = useCallback(
    (treatment: string, instructions?: string) => {
      const payload = instructions ? `${treatment} — ${instructions}` : treatment;
      const key = buildInsightApplicationKey(payload);
      if (!key || treatmentActions[key]) return;
      onApplyTreatment(payload);
      setTreatmentActions((prev) => markInsightAction(prev, payload, "APPLIED"));
      void trackAction("TREATMENT", payload, "APPLIED");
    },
    [treatmentActions, onApplyTreatment, trackAction],
  );

  return (
    <div className="space-y-3">
      <AiClinicalDisclaimer />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          La IA sugiere diagnósticos, tratamientos y recomendaciones a partir del SOAP actual.
          Revisa y decide qué aplicar.
        </p>
        <Button onClick={generate} size="sm" variant="secondary" disabled={disabled || loading}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {hasData ? "Regenerar" : "Generar sugerencias"}
        </Button>
      </div>

      {!hasData && !loading && (
        <p className="text-sm text-muted-foreground">Aún no hay sugerencias para esta cita.</p>
      )}

      {data?.diagnoses && data.diagnoses.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-2">Diagnósticos sugeridos</p>
          <ul className="space-y-2">
            {data.diagnoses.map((d, i) => (
              (() => {
                const currentAction = getInsightAction(diagnosisActions, d.diagnosis);
                const alreadyApplied = isInsightApplied(diagnosisActions, d.diagnosis);
                const actionLabel = resolveActionLabel(currentAction);
                return (
              <li
                key={i}
                className="rounded-md border border-border bg-secondary/20 p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{d.diagnosis}</p>
                    {d.reasoning && (
                      <p className="text-xs text-muted-foreground mt-1">{d.reasoning}</p>
                    )}
                  </div>
                  {actionLabel && (
                    <span className="text-[11px] font-medium text-primary">{actionLabel}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => applyDiagnosisDeprecated(d.diagnosis)}
                    disabled={disabled || alreadyApplied}
                  >
                    <Plus className="w-4 h-4" /> {alreadyApplied ? "Aplicado" : "Assessment"}
                  </Button>
                  <Button
                    size="sm"
                    variant="tertiary"
                    onClick={() => applyDiagnosis(d.diagnosis, "REJECTED")}
                    disabled={disabled || currentAction === "REJECTED"}
                  >
                    Rechazar
                  </Button>
                </div>
              </li>
                );
              })()
            ))}
          </ul>
        </div>
      )}

      {data?.treatments && data.treatments.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-2">Tratamientos sugeridos</p>
          <ul className="space-y-2">
            {data.treatments.map((t, i) => (
              (() => {
                const payload = t.instructions ? `${t.treatment} — ${t.instructions}` : t.treatment;
                const currentAction = getInsightAction(treatmentActions, payload);
                const alreadyApplied = isInsightApplied(treatmentActions, payload);
                const actionLabel = resolveActionLabel(currentAction);
                return (
              <li
                key={i}
                className="rounded-md border border-border bg-secondary/20 p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{t.treatment}</p>
                    {t.instructions && (
                      <p className="text-xs text-muted-foreground mt-1">{t.instructions}</p>
                    )}
                  </div>
                  {actionLabel && (
                    <span className="text-[11px] font-medium text-primary">{actionLabel}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => applyTreatmentDeprecated(t.treatment, t.instructions)}
                    disabled={disabled || alreadyApplied}
                  >
                    <Plus className="w-4 h-4" /> {alreadyApplied ? "Aplicado" : "Plan"}
                  </Button>
                  <Button
                    size="sm"
                    variant="tertiary"
                    onClick={() => applyTreatment(t.treatment, t.instructions, "REJECTED")}
                    disabled={disabled || currentAction === "REJECTED"}
                  >
                    Rechazar
                  </Button>
                </div>
              </li>
                );
              })()
            ))}
          </ul>
        </div>
      )}

      {(data?.allowedFoods?.length || data?.forbiddenFoods?.length) ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {data?.allowedFoods && data.allowedFoods.length > 0 && (
            <div className="rounded-md border border-success/30 bg-success/10 p-3">
              <p className="text-xs font-semibold text-success mb-1">Alimentos recomendados</p>
              <p className="text-xs text-foreground/80">{data.allowedFoods.join(", ")}</p>
            </div>
          )}
          {data?.forbiddenFoods && data.forbiddenFoods.length > 0 && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3">
              <p className="text-xs font-semibold text-destructive mb-1">Alimentos a evitar</p>
              <p className="text-xs text-foreground/80">{data.forbiddenFoods.join(", ")}</p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
