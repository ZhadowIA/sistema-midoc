"use client";

import { useState, useEffect, useCallback } from "react";
import { format, subDays, startOfMonth, endOfDay } from "date-fns";
import { es } from "date-fns/locale";
import { RefreshCw, Brain, TrendingUp, ThumbsUp, ThumbsDown, Edit2, Minus, Stethoscope } from "lucide-react";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { DoctorLayout } from "@/components/DoctorLayout";

// ── Types ────────────────────────────────────────────────────────────────────

type SummaryItem = {
  key?: string;
  module?: string;
  model?: string;
  jobs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
};

type SpecialtyItem = {
  specialty: string;
  jobs: number;
  totalTokens: number;
  estimatedCostUsd: number;
};

type UsageSummary = {
  filters: { from: string; to: string };
  totals: { jobs: number; inputTokens: number; outputTokens: number; totalTokens: number; estimatedCostUsd: number };
  byModule: SummaryItem[];
  byModel: SummaryItem[];
  bySpecialty: SpecialtyItem[];
  dailySeries: { date: string; jobs: number; totalTokens: number; estimatedCostUsd: number }[];
};

type FeedbackSummary = {
  filters: { from: string; to: string };
  totals: { total: number; applied: number; edited: number; rejected: number; ignored: number };
  byKind: {
    DIAGNOSIS: { total: number; applied: number; edited: number; rejected: number; ignored: number };
    TREATMENT: { total: number; applied: number; edited: number; rejected: number; ignored: number };
  };
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const SPECIALTY_LABEL: Record<string, string> = {
  FAMILY_MEDICINE: "Medicina Familiar / General",
  PEDIATRICS: "Pediatría",
  GYNECOLOGY_OBSTETRICS: "Ginecología y Obstetricia",
  DERMATOLOGY: "Dermatología",
  CARDIOLOGY: "Cardiología",
  MENTAL_HEALTH: "Psiquiatría y Salud Mental",
  DENTISTRY: "Odontología",
  OPHTHALMOLOGY: "Oftalmología",
};

const MODULE_LABEL: Record<string, string> = {
  AI_NOTE_GENERATE_AUDIO: "Nota por audio",
  AI_NOTE_GENERATE_TRANSCRIPT: "Nota por transcripción",
  AI_INSIGHTS: "Insights clínicos",
  AI_PRESCRIPTION_VALIDATE: "Validación de receta",
  AI_CLINICAL_GAPS: "Huecos clínicos",
  AI_QUESTIONNAIRE_INTERVIEW: "Entrevista cuestionario",
};

function fmt(usd: number): string {
  return `$${usd.toFixed(4)} USD`;
}

function pct(num: number, total: number): string {
  if (total === 0) return "0%";
  return `${((num / total) * 100).toFixed(1)}%`;
}

// ── StatCard ──────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-card border border-border rounded-lg px-5 py-4">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function IaGobernanzaPage() {
  const today = new Date();
  const [from, setFrom] = useState(format(startOfMonth(today), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(today, "yyyy-MM-dd"));
  const [loading, setLoading] = useState(false);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [feedback, setFeedback] = useState<FeedbackSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const fromIso = new Date(from + "T00:00:00").toISOString();
      const toIso = endOfDay(new Date(to + "T00:00:00")).toISOString();
      const [usageRes, feedbackRes] = await Promise.all([
        fetch(`/api/admin/ai/usage/summary?from=${fromIso}&to=${toIso}`),
        fetch(`/api/admin/ai/insights/feedback/summary?from=${fromIso}&to=${toIso}`),
      ]);
      if (!usageRes.ok || !feedbackRes.ok) throw new Error("Error al cargar datos");
      const [usageData, feedbackData] = await Promise.all([usageRes.json(), feedbackRes.json()]);
      setUsage(usageData as UsageSummary);
      setFeedback(feedbackData as FeedbackSummary);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { void load(); }, [load]);

  const acceptanceRate = feedback
    ? pct(feedback.totals.applied + feedback.totals.edited, feedback.totals.total)
    : "—";

  const rejectionRate = feedback
    ? pct(feedback.totals.rejected, feedback.totals.total)
    : "—";

  return (
    <DoctorLayout>
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center">
            <Brain className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Gobernanza IA</h1>
            <p className="text-sm text-muted-foreground">Trazabilidad, uso y adopción de funciones IA</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-36 text-sm"
          />
          <span className="text-muted-foreground text-sm">→</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-36 text-sm"
          />
          <Button onClick={() => void load()} disabled={loading} variant="secondary" size="sm">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-md px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Quick shortcuts */}
      <div className="flex gap-2 flex-wrap">
        {[7, 14, 30].map((days) => (
          <button
            key={days}
            onClick={() => {
              setFrom(format(subDays(today, days), "yyyy-MM-dd"));
              setTo(format(today, "yyyy-MM-dd"));
            }}
            className="text-xs px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground transition-colors"
          >
            Últimos {days} días
          </button>
        ))}
        <button
          onClick={() => {
            setFrom(format(startOfMonth(today), "yyyy-MM-dd"));
            setTo(format(today, "yyyy-MM-dd"));
          }}
          className="text-xs px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground transition-colors"
        >
          Este mes
        </button>
      </div>

      {/* ── Uso IA ─────────────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Uso y costo
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Llamadas IA"
            value={usage ? usage.totals.jobs.toLocaleString() : "—"}
          />
          <StatCard
            label="Tokens totales"
            value={usage ? usage.totals.totalTokens.toLocaleString() : "—"}
            sub={usage ? `${usage.totals.inputTokens.toLocaleString()} entrada / ${usage.totals.outputTokens.toLocaleString()} salida` : undefined}
          />
          <StatCard
            label="Costo estimado"
            value={usage ? fmt(usage.totals.estimatedCostUsd) : "—"}
          />
          <StatCard
            label="Tasa de aceptación"
            value={acceptanceRate}
            sub={`Rechazo: ${rejectionRate}`}
          />
        </div>
      </section>

      {/* ── Por módulo ─────────────────────────────────────────────────────── */}
      {usage && usage.byModule.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" /> Uso por módulo
          </h2>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/40">
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Módulo</th>
                  <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Llamadas</th>
                  <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Tokens</th>
                  <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Costo est.</th>
                </tr>
              </thead>
              <tbody>
                {usage.byModule.map((row) => (
                  <tr key={row.module} className="border-b border-border last:border-0 hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-foreground">
                      {MODULE_LABEL[row.module ?? ""] ?? row.module}
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{row.jobs}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{row.totalTokens.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-foreground">{fmt(row.estimatedCostUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Por modelo ─────────────────────────────────────────────────────── */}
      {usage && usage.byModel.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Versiones de modelo usadas
          </h2>
          <div className="flex flex-wrap gap-2">
            {usage.byModel.map((row) => (
              <div key={row.model} className="bg-secondary border border-border rounded-md px-4 py-2 text-sm">
                <span className="font-mono font-medium text-foreground">{row.model}</span>
                <span className="text-muted-foreground ml-2">{row.jobs} llamadas · {fmt(row.estimatedCostUsd)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Por especialidad ──────────────────────────────────────────────── */}
      {usage && usage.bySpecialty.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
            <Stethoscope className="w-4 h-4" /> Uso por especialidad
          </h2>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/40">
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Especialidad</th>
                  <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Llamadas</th>
                  <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Tokens</th>
                  <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Costo est.</th>
                </tr>
              </thead>
              <tbody>
                {usage.bySpecialty.map((row) => (
                  <tr key={row.specialty} className="border-b border-border last:border-0 hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-foreground">
                      {SPECIALTY_LABEL[row.specialty] ?? row.specialty}
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{row.jobs}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{row.totalTokens.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-foreground">{fmt(row.estimatedCostUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Adopción de insights ───────────────────────────────────────────── */}
      {feedback && feedback.totals.total > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Adopción de sugerencias IA
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(["DIAGNOSIS", "TREATMENT"] as const).map((kind) => {
              const k = feedback.byKind[kind];
              return (
                <div key={kind} className="bg-card border border-border rounded-lg px-5 py-4 space-y-3">
                  <p className="font-semibold text-foreground text-sm">
                    {kind === "DIAGNOSIS" ? "Diagnóstico" : "Tratamiento"}
                  </p>
                  <div className="space-y-2">
                    <FeedbackRow icon={<ThumbsUp className="w-3.5 h-3.5 text-success" />} label="Aplicadas" value={k.applied} total={k.total} />
                    <FeedbackRow icon={<Edit2 className="w-3.5 h-3.5 text-primary" />} label="Editadas" value={k.edited} total={k.total} />
                    <FeedbackRow icon={<ThumbsDown className="w-3.5 h-3.5 text-destructive" />} label="Rechazadas" value={k.rejected} total={k.total} />
                    <FeedbackRow icon={<Minus className="w-3.5 h-3.5 text-muted-foreground" />} label="Ignoradas" value={k.ignored} total={k.total} />
                  </div>
                  <p className="text-xs text-muted-foreground">{k.total} sugerencias en el período</p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Serie diaria ───────────────────────────────────────────────────── */}
      {usage && usage.dailySeries.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Actividad diaria
          </h2>
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/40">
                  <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Fecha</th>
                  <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Llamadas</th>
                  <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Tokens</th>
                  <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Costo</th>
                </tr>
              </thead>
              <tbody>
                {usage.dailySeries.map((row) => (
                  <tr key={row.date} className="border-b border-border last:border-0 hover:bg-secondary/20 transition-colors">
                    <td className="px-4 py-2.5 text-foreground">
                      {format(new Date(row.date + "T12:00:00"), "d 'de' MMMM", { locale: es })}
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{row.jobs}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{row.totalTokens.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-foreground">{fmt(row.estimatedCostUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!loading && usage && usage.totals.jobs === 0 && (
        <div className="text-center py-16 text-muted-foreground text-sm">
          No hay actividad IA registrada en el período seleccionado.
        </div>
      )}
    </div>
    </DoctorLayout>
  );
}

function FeedbackRow({
  icon,
  label,
  value,
  total,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  total: number;
}) {
  const width = total === 0 ? 0 : (value / total) * 100;
  return (
    <div className="flex items-center gap-2">
      {icon}
      <span className="w-20 text-xs text-muted-foreground">{label}</span>
      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden">
        <div className="h-full bg-primary/50 rounded-full" style={{ width: `${width}%` }} />
      </div>
      <span className="text-xs font-medium text-foreground w-8 text-right">{value}</span>
      <span className="text-xs text-muted-foreground w-10 text-right">{pct(value, total)}</span>
    </div>
  );
}
