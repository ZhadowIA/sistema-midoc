"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkles, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/Button";
import {
  buildInsightApplicationKey,
  isInsightApplied,
  markInsightApplied,
} from "@/lib/aiInsights";

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
  const [appliedDiagnoses, setAppliedDiagnoses] = useState<Record<string, boolean>>({});
  const [appliedTreatments, setAppliedTreatments] = useState<Record<string, boolean>>({});

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
      setAppliedDiagnoses({});
      setAppliedTreatments({});
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

  const trackApply = useCallback(
    async (kind: "DIAGNOSIS" | "TREATMENT", text: string) => {
      await fetch(`/api/clinical/admin/appointments/${appointmentId}/ai-insights/apply`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, text }),
      }).catch(() => undefined);
    },
    [appointmentId],
  );

  const applyDiagnosis = useCallback(
    (diagnosis: string) => {
      const key = buildInsightApplicationKey(diagnosis);
      if (!key || appliedDiagnoses[key]) return;
      onApplyDiagnosis(diagnosis);
      setAppliedDiagnoses((prev) => markInsightApplied(prev, diagnosis));
      void trackApply("DIAGNOSIS", diagnosis);
      toast.success("Diagnóstico aplicado en Assessment.");
    },
    [appliedDiagnoses, onApplyDiagnosis, trackApply],
  );

  const applyTreatment = useCallback(
    (treatment: string, instructions?: string) => {
      const payload = instructions ? `${treatment} — ${instructions}` : treatment;
      const key = buildInsightApplicationKey(payload);
      if (!key || appliedTreatments[key]) return;
      onApplyTreatment(payload);
      setAppliedTreatments((prev) => markInsightApplied(prev, payload));
      void trackApply("TREATMENT", payload);
      toast.success("Tratamiento aplicado en Plan.");
    },
    [appliedTreatments, onApplyTreatment, trackApply],
  );

  return (
    <div className="space-y-3">
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
          <p className="text-sm font-medium mb-1">Diagnósticos sugeridos</p>
          <ul className="space-y-1">
            {data.diagnoses.map((d, i) => (
              (() => {
                const alreadyApplied = isInsightApplied(appliedDiagnoses, d.diagnosis);
                return (
              <li
                key={i}
                className="flex items-start justify-between gap-2 rounded-lg border border-border bg-secondary/10 p-2"
              >
                <div>
                  <p className="text-sm font-medium">{d.diagnosis}</p>
                  {d.reasoning && (
                    <p className="text-xs text-muted-foreground">{d.reasoning}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="tertiary"
                  onClick={() => applyDiagnosis(d.diagnosis)}
                  disabled={disabled || alreadyApplied}
                >
                  <Plus className="w-4 h-4" /> {alreadyApplied ? "Aplicado" : "Assessment"}
                </Button>
              </li>
                );
              })()
            ))}
          </ul>
        </div>
      )}

      {data?.treatments && data.treatments.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-1">Tratamientos sugeridos</p>
          <ul className="space-y-1">
            {data.treatments.map((t, i) => (
              (() => {
                const payload = t.instructions ? `${t.treatment} — ${t.instructions}` : t.treatment;
                const alreadyApplied = isInsightApplied(appliedTreatments, payload);
                return (
              <li
                key={i}
                className="flex items-start justify-between gap-2 rounded-lg border border-border bg-secondary/10 p-2"
              >
                <div>
                  <p className="text-sm font-medium">{t.treatment}</p>
                  {t.instructions && (
                    <p className="text-xs text-muted-foreground">{t.instructions}</p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="tertiary"
                  onClick={() => applyTreatment(t.treatment, t.instructions)}
                  disabled={disabled || alreadyApplied}
                >
                  <Plus className="w-4 h-4" /> {alreadyApplied ? "Aplicado" : "Plan"}
                </Button>
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
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2">
              <p className="text-xs font-medium text-emerald-800 mb-1">Alimentos recomendados</p>
              <p className="text-xs text-emerald-900">{data.allowedFoods.join(", ")}</p>
            </div>
          )}
          {data?.forbiddenFoods && data.forbiddenFoods.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-2">
              <p className="text-xs font-medium text-red-800 mb-1">Alimentos a evitar</p>
              <p className="text-xs text-red-900">{data.forbiddenFoods.join(", ")}</p>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
