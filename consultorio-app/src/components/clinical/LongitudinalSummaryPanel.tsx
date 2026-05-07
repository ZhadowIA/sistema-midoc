"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { History, ChevronDown, ChevronUp, CheckCircle2, Clock } from "lucide-react";

type LongitudinalEntry = {
  encounterId: string;
  date: string;
  chiefComplaint: string | null;
  assessmentDiagnoses: string[];
  treatmentPlanSummary: string | null;
  soapAssessment: string | null;
  followUpNotes: string | null;
  completionPct: number;
  signed: boolean;
};

type SummaryData = {
  totalPrior: number;
  entries: LongitudinalEntry[];
};

type Props = {
  encounterId: string;
};

export function LongitudinalSummaryPanel({ encounterId }: Props) {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/clinical/admin/encounters/${encounterId}/longitudinal-summary`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error((await res.json()).error ?? "Error al cargar historial");
      setData(await res.json() as SummaryData);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [encounterId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground animate-pulse py-3">
        Cargando historial longitudinal…
      </p>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-destructive py-2">{error}</p>
    );
  }

  if (!data || data.totalPrior === 0) {
    return (
      <div className="flex items-center gap-2 py-3 text-muted-foreground text-sm">
        <History className="w-4 h-4 shrink-0" />
        <span>Sin consultas previas registradas para este paciente.</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground mb-2">
        {data.totalPrior} consulta{data.totalPrior !== 1 ? "s" : ""} previa{data.totalPrior !== 1 ? "s" : ""}
      </p>

      {data.entries.map((entry) => {
        const isOpen = expandedId === entry.encounterId;
        const dateLabel = format(new Date(entry.date), "d 'de' MMMM yyyy", { locale: es });

        return (
          <div
            key={entry.encounterId}
            className="border border-border rounded-md overflow-hidden"
          >
            <button
              onClick={() => setExpandedId(isOpen ? null : entry.encounterId)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-card hover:bg-secondary/30 transition-colors text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                {entry.signed ? (
                  <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                ) : (
                  <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{dateLabel}</p>
                  {entry.chiefComplaint && (
                    <p className="text-xs text-muted-foreground truncate max-w-xs">
                      {entry.chiefComplaint}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground hidden sm:block">
                  {entry.completionPct}% completado
                </span>
                {isOpen ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
            </button>

            {isOpen && (
              <div className="px-4 py-3 border-t border-border bg-secondary/10 space-y-3 text-sm">
                {entry.assessmentDiagnoses.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      Diagnósticos
                    </p>
                    <ul className="space-y-0.5">
                      {entry.assessmentDiagnoses.map((d, i) => (
                        <li key={i} className="text-foreground flex gap-2">
                          <span className="text-muted-foreground">•</span>
                          <span>{d}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {entry.treatmentPlanSummary && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      Plan de tratamiento
                    </p>
                    <p className="text-foreground">{entry.treatmentPlanSummary}</p>
                  </div>
                )}

                {entry.followUpNotes && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      Seguimiento indicado
                    </p>
                    <p className="text-foreground">{entry.followUpNotes}</p>
                  </div>
                )}

                {!entry.signed && (
                  <p className="text-xs text-warning">Consulta sin firmar</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
