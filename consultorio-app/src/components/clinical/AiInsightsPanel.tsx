"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkles, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/Button";

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
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<Insights | null>(null);

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
                  onClick={() => onApplyDiagnosis(d.diagnosis)}
                  disabled={disabled}
                >
                  <Plus className="w-4 h-4" /> Assessment
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data?.treatments && data.treatments.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-1">Tratamientos sugeridos</p>
          <ul className="space-y-1">
            {data.treatments.map((t, i) => (
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
                  onClick={() =>
                    onApplyTreatment(
                      t.instructions ? `${t.treatment} — ${t.instructions}` : t.treatment,
                    )
                  }
                  disabled={disabled}
                >
                  <Plus className="w-4 h-4" /> Plan
                </Button>
              </li>
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
