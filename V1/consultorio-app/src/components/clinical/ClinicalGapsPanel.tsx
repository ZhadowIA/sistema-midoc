"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Search,
  Loader2,
  ShieldAlert,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/Button";
import {
  deterministicGapAnalysis,
  dedupeGaps,
  type ClinicalGap,
} from "@/lib/clinicalGapsService";
import type { ClinicalHistoryPayload } from "@/lib/clinicalHistorySchema";
import type { EncounterHistoryPayload } from "@/lib/encounterHistorySchema";

type Props = {
  patientId: string;
  encounterId: string;
  encounterPayload: EncounterHistoryPayload | null;
  aiAvailable: boolean;
};

const SEVERITY_ICON: Record<ClinicalGap["severity"], typeof AlertTriangle> = {
  high: ShieldAlert,
  medium: AlertTriangle,
  low: Info,
};

const SEVERITY_STYLES: Record<ClinicalGap["severity"], string> = {
  high: "border-destructive/30 bg-destructive/10 text-foreground",
  medium: "border-warning/30 bg-warning/10 text-foreground",
  low: "border-primary/30 bg-primary/10 text-foreground",
};

const SEVERITY_ICON_STYLES: Record<ClinicalGap["severity"], string> = {
  high: "text-destructive",
  medium: "text-warning",
  low: "text-primary",
};

const SEVERITY_LABELS: Record<ClinicalGap["severity"], string> = {
  high: "Alta",
  medium: "Media",
  low: "Baja",
};

export function ClinicalGapsPanel({
  patientId,
  encounterId,
  encounterPayload,
  aiAvailable,
}: Props) {
  const [deterministicGaps, setDeterministicGaps] = useState<ClinicalGap[]>([]);
  const [llmGaps, setLlmGaps] = useState<ClinicalGap[]>([]);
  const [loading, setLoading] = useState(false);
  const [llmRan, setLlmRan] = useState(false);
  const [deterministicLoaded, setDeterministicLoaded] = useState(false);

  // Auto-run deterministic analysis on mount
  useEffect(() => {
    let cancelled = false;

    fetch(`/api/admin/patients/${patientId}/clinical-history`, {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        const clinicalHistory =
          (data?.record?.payload as ClinicalHistoryPayload) ?? null;

        // Derive medicalRecord from the patient API response
        const medicalRecord = data?.medicalRecord ?? null;

        const gaps = deterministicGapAnalysis({
          clinicalHistory,
          medicalRecord,
          encounterPayload,
        });
        setDeterministicGaps(gaps);
        setDeterministicLoaded(true);
      })
      .catch(() => {
        setDeterministicLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [patientId, encounterPayload]);

  // LLM analysis (on-demand via button)
  const runLlmAnalysis = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/clinical/admin/encounters/${encounterId}/gaps`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        }
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Error analizando huecos");

      const gaps = (body.gaps ?? []) as ClinicalGap[];
      // Separate LLM-specific gaps (contradictions and red-flags come from server)
      const llmSpecific = gaps.filter(
        (g) => g.category === "contradiction" || g.category === "red-flag"
      );
      setLlmGaps(llmSpecific);
      setLlmRan(true);

      if (llmSpecific.length === 0) {
        toast.success(
          "No se encontraron contradicciones ni alertas adicionales."
        );
      } else {
        toast.info(
          `Se encontraron ${llmSpecific.length} hallazgo(s) clínico(s).`
        );
      }
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Error al analizar huecos clínicos"
      );
    } finally {
      setLoading(false);
    }
  }, [encounterId]);

  const allGaps = dedupeGaps([...deterministicGaps, ...llmGaps]);

  // Don't render until we've checked; hide if nothing to show and no AI
  if (!deterministicLoaded) return null;
  if (allGaps.length === 0 && !aiAvailable) return null;

  return (
    <div className="space-y-2">
      {allGaps.length > 0 && (
        <div className="space-y-1.5">
          {allGaps.map((gap, i) => {
            const Icon = SEVERITY_ICON[gap.severity];
            return (
              <div
                key={`gap-${i}-${gap.category}`}
                className={`flex items-start gap-2 rounded-lg border p-2.5 text-xs ${SEVERITY_STYLES[gap.severity]}`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 mt-0.5 ${SEVERITY_ICON_STYLES[gap.severity]}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">{gap.message}</span>
                    <span className="text-[10px] opacity-60">
                      ({SEVERITY_LABELS[gap.severity]})
                    </span>
                  </div>
                  {gap.recommendation && (
                    <p className="text-[11px] opacity-80 mt-0.5">
                      {gap.recommendation}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {aiAvailable && !llmRan && (
        <Button
          onClick={runLlmAnalysis}
          size="sm"
          variant="secondary"
          disabled={loading}
          className="w-full"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
          {loading
            ? "Analizando..."
            : "Analizar contradicciones y alertas clínicas"}
        </Button>
      )}

      {llmRan && llmGaps.length === 0 && (
        <p className="text-xs text-success text-center py-1">
          ✓ Sin contradicciones ni alertas adicionales detectadas
        </p>
      )}
    </div>
  );
}
