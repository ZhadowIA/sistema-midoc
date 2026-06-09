"use client";

import { useSpecialtyPayload } from "@/components/clinical/useSpecialtyPayload";
import { SpecialtyShell } from "@/components/clinical/SpecialtyShell";
import { SectionAccordion } from "@/components/clinical/SectionAccordion";
import { Plus, Trash2 } from "lucide-react";
import {
  EMPTY_MENTAL_HEALTH_PAYLOAD,
  type MentalHealthPayload,
} from "@/lib/specialtyPayloadSchemas";

// ─── PHQ-9 items ──────────────────────────────────────────────────────────────

const PHQ9_ITEMS = [
  "Poco interés o placer en hacer las cosas",
  "Se ha sentido decaído, deprimido o sin esperanzas",
  "Dificultad para quedarse dormido o dormir demasiado",
  "Se ha sentido cansado o con poca energía",
  "Sin apetito o comiendo en exceso",
  "Sintiéndose mal consigo mismo o como un fracaso",
  "Dificultad para concentrarse",
  "Moverse o hablar tan lento que otros lo notaron, o muy agitado",
  "Pensamientos de que sería mejor estar muerto o hacerse daño",
];

const GAD7_ITEMS = [
  "Se ha sentido nervioso, ansioso o con los nervios de punta",
  "No ha podido dejar de preocuparse",
  "Se ha preocupado demasiado por diferentes cosas",
  "Dificultad para relajarse",
  "Se ha sentido tan inquieto que no puede estar sentado tranquilo",
  "Se ha molestado o irritado fácilmente",
  "Ha sentido miedo de que algo espantoso pudiera ocurrir",
];

const SCORE_LABELS = ["Nunca (0)", "Varios días (1)", "Más de la mitad (2)", "Casi todos los días (3)"];

function phq9Severity(score: number): string {
  if (score <= 4)  return "Mínima";
  if (score <= 9)  return "Leve";
  if (score <= 14) return "Moderada";
  if (score <= 19) return "Moderadamente severa";
  return "Severa";
}

function gad7Severity(score: number): string {
  if (score <= 4)  return "Mínima";
  if (score <= 9)  return "Leve";
  if (score <= 14) return "Moderada";
  return "Severa";
}

function severityColor(severity: string): string {
  if (severity === "Mínima") return "text-success";
  if (severity === "Leve")   return "text-warning";
  if (severity === "Moderada" || severity === "Moderadamente severa") return "text-warning";
  return "text-destructive";
}

// ─── Scale component ──────────────────────────────────────────────────────────

function ScaleForm({
  title,
  items,
  answers,
  score,
  severity,
  severityFn,
  onChange,
  disabled,
}: {
  title: string;
  items: string[];
  answers: number[] | undefined;
  score: number | undefined;
  severity: string | undefined;
  severityFn: (s: number) => string;
  onChange: (answers: number[], score: number, severity: string) => void;
  disabled: boolean;
}) {
  const current = answers ?? new Array(items.length).fill(0);

  const setAnswer = (idx: number, val: number) => {
    const next = [...current];
    next[idx] = val;
    const total = next.reduce((a, b) => a + b, 0);
    onChange(next, total, severityFn(total));
  };

  const total = score ?? current.reduce((a, b) => a + b, 0);
  const sev   = severity ?? severityFn(total);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <span className="text-2xl font-bold text-primary">{total}</span>
        <span className={`text-sm font-semibold ${severityColor(sev)}`}>{sev}</span>
      </div>

      <div className="space-y-2">
        {items.map((item, idx) => (
          <div key={idx} className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-start">
            <p className="text-sm text-foreground">{idx + 1}. {item}</p>
            <div className="flex gap-1 flex-wrap">
              {[0, 1, 2, 3].map((val) => (
                <button
                  key={val}
                  type="button"
                  disabled={disabled}
                  onClick={() => setAnswer(idx, val)}
                  className={`px-2 py-1 text-xs rounded-lg border transition-colors ${
                    current[idx] === val
                      ? "border-primary bg-primary/10 text-primary font-semibold"
                      : "border-border hover:bg-secondary/40 text-muted-foreground"
                  }`}
                >
                  {val}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">{SCORE_LABELS.join(" · ")}</p>
    </div>
  );
}

// ─── Risk assessment ──────────────────────────────────────────────────────────

function RiskPanel({
  data, update, disabled,
}: { data: MentalHealthPayload; update: (d: MentalHealthPayload) => void; disabled: boolean }) {
  const ra = data.riskAssessment;
  const set = (patch: Partial<typeof ra>) => update({ ...data, riskAssessment: { ...ra, ...patch } });

  const riskLevel = ra.riskLevel;
  const riskColor = riskLevel === "IMMINENT" || riskLevel === "HIGH"
    ? "border-destructive/40 bg-destructive/10"
    : riskLevel === "MODERATE" ? "border-warning/40 bg-warning/10"
    : "border-border";

  return (
    <div className={`space-y-4 p-4 rounded-md border ${riskColor}`}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Ideación suicida</label>
          <select value={ra.suicidalIdeation ?? ""} disabled={disabled}
            onChange={(e) => set({ suicidalIdeation: (e.target.value || undefined) as typeof ra.suicidalIdeation })}
            className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50">
            <option value="">— No evaluado —</option>
            <option value="NONE">Ninguna</option>
            <option value="PASSIVE">Pasiva (no quiero vivir)</option>
            <option value="ACTIVE">Activa (quiero morir)</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Nivel de riesgo global</label>
          <select value={ra.riskLevel ?? ""} disabled={disabled}
            onChange={(e) => set({ riskLevel: (e.target.value || undefined) as typeof ra.riskLevel })}
            className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50">
            <option value="">— No evaluado —</option>
            <option value="NONE">Sin riesgo</option>
            <option value="LOW">Bajo</option>
            <option value="MODERATE">Moderado</option>
            <option value="HIGH">Alto</option>
            <option value="IMMINENT">Inminente 🔴</option>
          </select>
        </div>
      </div>

      <div className="flex gap-4 flex-wrap">
        {([
          { label: "Plan suicida estructurado", field: "suicidalPlan" },
          { label: "Intento previo de suicidio", field: "suicidalAttempt" },
          { label: "Ideación homicida", field: "homicidalIdeation" },
        ] as const).map(({ label, field }) => (
          <label key={field} className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={Boolean(ra[field])} disabled={disabled}
              onChange={(e) => set({ [field]: e.target.checked })}
              className="w-4 h-4 accent-red-500" />
            <span className="text-sm text-foreground">{label}</span>
          </label>
        ))}
      </div>

      <div>
        <label className="text-xs text-muted-foreground block mb-1">Notas de riesgo</label>
        <textarea rows={2} value={ra.notes ?? ""} disabled={disabled}
          onChange={(e) => set({ notes: e.target.value || undefined })}
          className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 resize-none"
          placeholder="Plan de seguridad, factores protectores, seguimiento…" />
      </div>
    </div>
  );
}

// ─── Longitudinal tracking ────────────────────────────────────────────────────

function LongitudinalTable({
  data, update, disabled,
}: { data: MentalHealthPayload; update: (d: MentalHealthPayload) => void; disabled: boolean }) {
  const tracking = data.longitudinalTracking;

  const add = () => update({ ...data, longitudinalTracking: [
    ...tracking, { date: new Date().toISOString().slice(0,10) },
  ]});

  const set = (idx: number, patch: Partial<(typeof tracking)[number]>) => {
    const next = [...tracking]; next[idx] = { ...next[idx], ...patch };
    update({ ...data, longitudinalTracking: next });
  };

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[480px]">
          <thead>
            <tr className="border-b border-border">
              {["Fecha","PHQ-9","GAD-7","Notas",""].map((h) => (
                <th key={h} className="text-left text-muted-foreground font-medium pb-2 pr-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tracking.map((row, idx) => (
              <tr key={idx} className="border-b border-border/40">
                <td className="py-1.5 pr-3">
                  <input type="date" value={row.date} disabled={disabled}
                    onChange={(e) => set(idx, { date: e.target.value })}
                    className="border border-border rounded px-1 py-0.5 bg-background w-28 disabled:opacity-50" />
                </td>
                {(["phq9Score","gad7Score"] as const).map((f) => (
                  <td key={f} className="py-1.5 pr-3">
                    <input type="number" min={0} max={27} value={(row[f] as number) ?? ""} disabled={disabled}
                      onChange={(e) => set(idx, { [f]: e.target.value ? Number(e.target.value) : undefined })}
                      className="border border-border rounded px-1 py-0.5 bg-background w-14 disabled:opacity-50" />
                  </td>
                ))}
                <td className="py-1.5 pr-3">
                  <input type="text" value={row.notes ?? ""} disabled={disabled}
                    onChange={(e) => set(idx, { notes: e.target.value || undefined })}
                    placeholder="Observaciones"
                    className="border border-border rounded px-2 py-0.5 bg-background w-full disabled:opacity-50" />
                </td>
                <td className="py-1.5">
                  {!disabled && (
                    <button type="button" onClick={() => update({ ...data, longitudinalTracking: tracking.filter((_,i) => i !== idx) })}
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!disabled && (
        <button type="button" onClick={add}
          className="flex items-center gap-1.5 text-xs text-primary border border-primary/30 bg-primary/5 hover:bg-primary/10 px-2.5 py-1.5 rounded-lg font-medium">
          <Plus className="w-3.5 h-3.5" /> Agregar seguimiento
        </button>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function MentalHealthSection({ encounterId, disabled = false }: { encounterId: string; disabled?: boolean }) {
  const { data, loaded, saveState, update } = useSpecialtyPayload<MentalHealthPayload>(
    encounterId, "MENTAL_HEALTH", EMPTY_MENTAL_HEALTH_PAYLOAD,
  );

  const riskLevel = data.riskAssessment.riskLevel;
  const isHighRisk = riskLevel === "HIGH" || riskLevel === "IMMINENT";

  return (
    <SpecialtyShell label="Módulo Salud Mental" saveState={saveState} loaded={loaded}>
      {isHighRisk && (
        <div className="p-3 bg-destructive/10 border border-destructive/40 rounded-md text-sm text-destructive font-semibold">
          🔴 Riesgo {riskLevel === "IMMINENT" ? "INMINENTE" : "ALTO"} — Requiere intervención inmediata
        </div>
      )}

      <SectionAccordion title="PHQ-9 — Depresión" defaultOpen>
        <ScaleForm
          title="PHQ-9" items={PHQ9_ITEMS}
          answers={data.phq9.answers} score={data.phq9.score} severity={data.phq9.severity}
          severityFn={phq9Severity}
          onChange={(answers, score, severity) => update({ ...data, phq9: { ...data.phq9, answers, score, severity, date: new Date().toISOString().slice(0,10) } })}
          disabled={disabled}
        />
      </SectionAccordion>

      <SectionAccordion title="GAD-7 — Ansiedad">
        <ScaleForm
          title="GAD-7" items={GAD7_ITEMS}
          answers={data.gad7.answers} score={data.gad7.score} severity={data.gad7.severity}
          severityFn={gad7Severity}
          onChange={(answers, score, severity) => update({ ...data, gad7: { ...data.gad7, answers, score, severity, date: new Date().toISOString().slice(0,10) } })}
          disabled={disabled}
        />
      </SectionAccordion>

      <SectionAccordion title="Evaluación de riesgo"
        badge={isHighRisk ? <span className="text-xs px-2 py-0.5 rounded-full bg-destructive/15 text-destructive">Riesgo {riskLevel}</span> : undefined}>
        <RiskPanel data={data} update={update} disabled={disabled} />
      </SectionAccordion>

      <SectionAccordion title="Seguimiento longitudinal"
        badge={<span className="text-xs px-2 py-0.5 rounded-full bg-secondary/50 text-muted-foreground">{data.longitudinalTracking.length} registros</span>}>
        <LongitudinalTable data={data} update={update} disabled={disabled} />
      </SectionAccordion>
    </SpecialtyShell>
  );
}
