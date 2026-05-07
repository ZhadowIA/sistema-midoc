"use client";

import { Plus, Trash2, AlertTriangle } from "lucide-react";
import { useSpecialtyPayload } from "@/components/clinical/useSpecialtyPayload";
import { SpecialtyShell } from "@/components/clinical/SpecialtyShell";
import { SectionAccordion } from "@/components/clinical/SectionAccordion";
import {
  EMPTY_PEDIATRICS_PAYLOAD,
  type PediatricsPayload,
  type GrowthPoint,
} from "@/lib/specialtyPayloadSchemas";

// ─── WHO percentile references (simplified thresholds) ───────────────────────

const MILESTONES = [
  { id: "social_smile",    label: "Sonrisa social",          normalMonths: 2 },
  { id: "head_control",    label: "Control cefálico",        normalMonths: 3 },
  { id: "sits_supported",  label: "Sedestación con apoyo",   normalMonths: 6 },
  { id: "sits_alone",      label: "Sedestación sin apoyo",   normalMonths: 9 },
  { id: "stands_support",  label: "Bipedestación con apoyo", normalMonths: 9 },
  { id: "first_words",     label: "Primeras palabras",       normalMonths: 12 },
  { id: "walks_alone",     label: "Marcha independiente",    normalMonths: 15 },
  { id: "two_word_phrases",label: "Frases de 2 palabras",    normalMonths: 24 },
  { id: "tricycle",        label: "Triciclo / pedales",      normalMonths: 36 },
  { id: "dresses_self",    label: "Se viste solo",           normalMonths: 48 },
];

const VACCINES = [
  { id: "bcg",           label: "BCG",                  schedule: "Al nacer" },
  { id: "hepb_0",        label: "Hepatitis B (1ª)",     schedule: "Al nacer" },
  { id: "penta_1",       label: "Pentavalente 1ª",      schedule: "2 meses" },
  { id: "penta_2",       label: "Pentavalente 2ª",      schedule: "4 meses" },
  { id: "penta_3",       label: "Pentavalente 3ª",      schedule: "6 meses" },
  { id: "rotavirus_1",   label: "Rotavirus 1ª",         schedule: "2 meses" },
  { id: "rotavirus_2",   label: "Rotavirus 2ª",         schedule: "4 meses" },
  { id: "pcv_1",         label: "Neumococo 1ª",         schedule: "2 meses" },
  { id: "pcv_2",         label: "Neumococo 2ª",         schedule: "4 meses" },
  { id: "pcv_ref",       label: "Neumococo refuerzo",   schedule: "12 meses" },
  { id: "influenza_1",   label: "Influenza 1ª",         schedule: "6 meses" },
  { id: "influenza_2",   label: "Influenza 2ª",         schedule: "7 meses" },
  { id: "srp_1",         label: "SRP 1ª",               schedule: "12 meses" },
  { id: "varicela",      label: "Varicela",             schedule: "12 meses" },
  { id: "hepatita_1",    label: "Hepatitis A 1ª",       schedule: "12 meses" },
  { id: "hepatita_2",    label: "Hepatitis A 2ª",       schedule: "18 meses" },
  { id: "dpt_ref",       label: "DPT refuerzo",         schedule: "2 años" },
  { id: "srp_2",         label: "SRP 2ª",               schedule: "6 años" },
];

function uid() { return `p-${Date.now()}-${Math.random().toString(36).slice(2,6)}`; }

// ─── Growth table ─────────────────────────────────────────────────────────────

function GrowthTable({
  points,
  onChange,
  disabled,
}: {
  points: GrowthPoint[];
  onChange: (p: GrowthPoint[]) => void;
  disabled: boolean;
}) {
  const addRow = () => {
    const newPoint: GrowthPoint = { date: new Date().toISOString().slice(0,10), ageMonths: 0 };
    onChange([...points, newPoint]);
  };

  const update = (idx: number, patch: Partial<GrowthPoint>) => {
    const next = [...points];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse min-w-[600px]">
          <thead>
            <tr className="border-b border-border">
              {["Fecha","Edad (meses)","Peso (kg)","Talla (cm)","PC (cm)","P. Peso","P. Talla","P. IMC",""].map((h) => (
                <th key={h} className="text-left text-muted-foreground font-medium pb-2 pr-2 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {points.map((pt, idx) => (
              <tr key={idx} className="border-b border-border/50">
                <td className="py-1 pr-2">
                  <input type="date" value={pt.date} disabled={disabled}
                    onChange={(e) => update(idx, { date: e.target.value })}
                    className="border border-border rounded px-1 py-0.5 bg-background w-28 disabled:opacity-50" />
                </td>
                {(["ageMonths","weightKg","heightCm","headCircCm","weightPct","heightPct","bmiPct"] as const).map((field) => (
                  <td key={field} className="py-1 pr-2">
                    <input type="number" min={0} value={(pt[field] as number) ?? ""}
                      disabled={disabled}
                      onChange={(e) => update(idx, { [field]: e.target.value ? Number(e.target.value) : undefined })}
                      className={`border border-border rounded px-1 py-0.5 bg-background w-16 disabled:opacity-50 ${
                        field.includes("Pct") && (pt[field] as number) < 3
                          ? "border-destructive/50 text-destructive"
                          : field.includes("Pct") && (pt[field] as number) > 97
                          ? "border-warning/50 text-warning"
                          : ""
                      }`} />
                  </td>
                ))}
                <td className="py-1">
                  {!disabled && (
                    <button type="button" onClick={() => onChange(points.filter((_,i) => i !== idx))}
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
        <button type="button" onClick={addRow}
          className="flex items-center gap-1.5 text-xs text-primary border border-primary/30 bg-primary/5 hover:bg-primary/10 px-2.5 py-1.5 rounded-lg transition-colors font-medium">
          <Plus className="w-3.5 h-3.5" /> Agregar medición
        </button>
      )}
    </div>
  );
}

// ─── Vaccine record ───────────────────────────────────────────────────────────

function VaccineTable({
  record,
  onChange,
  disabled,
}: {
  record: PediatricsPayload["vaccineRecord"];
  onChange: (r: PediatricsPayload["vaccineRecord"]) => void;
  disabled: boolean;
}) {
  const set = (id: string, patch: Partial<(typeof record)[string]>) =>
    onChange({ ...record, [id]: { ...record[id], ...patch } });

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs min-w-[400px]">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left text-muted-foreground font-medium pb-2">Vacuna</th>
            <th className="text-left text-muted-foreground font-medium pb-2">Esquema</th>
            <th className="text-muted-foreground font-medium pb-2">Aplicada</th>
            <th className="text-left text-muted-foreground font-medium pb-2">Fecha</th>
          </tr>
        </thead>
        <tbody>
          {VACCINES.map((vac) => {
            const entry = record[vac.id] ?? { given: false };
            return (
              <tr key={vac.id} className="border-b border-border/40">
                <td className={`py-1.5 pr-3 ${entry.given ? "text-success font-medium" : "text-foreground"}`}>
                  {vac.label}
                </td>
                <td className="py-1.5 pr-3 text-muted-foreground">{vac.schedule}</td>
                <td className="py-1.5 pr-3 text-center">
                  <input type="checkbox" checked={entry.given} disabled={disabled}
                    onChange={(e) => set(vac.id, { given: e.target.checked })}
                    className="w-4 h-4 accent-primary" />
                </td>
                <td className="py-1.5">
                  {entry.given && (
                    <input type="date" value={entry.date ?? ""} disabled={disabled}
                      onChange={(e) => set(vac.id, { date: e.target.value || undefined })}
                      className="border border-border rounded px-1.5 py-0.5 bg-background w-32 disabled:opacity-50" />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Milestones ───────────────────────────────────────────────────────────────

function MilestonesGrid({
  milestones,
  onChange,
  disabled,
}: {
  milestones: PediatricsPayload["developmentMilestones"];
  onChange: (m: PediatricsPayload["developmentMilestones"]) => void;
  disabled: boolean;
}) {
  const set = (id: string, patch: Partial<(typeof milestones)[string]>) =>
    onChange({ ...milestones, [id]: { ...milestones[id], ...patch } });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {MILESTONES.map((ms) => {
        const entry = milestones[ms.id] ?? { achieved: false };
        const delayed = entry.achieved && entry.ageMonths && entry.ageMonths > ms.normalMonths + 3;
        return (
          <div key={ms.id} className={`flex items-start gap-2 p-2.5 rounded-lg border ${
            delayed ? "border-warning/40 bg-warning/5"
            : entry.achieved ? "border-success/30 bg-success/10/50"
            : "border-border bg-card"
          }`}>
            <input type="checkbox" checked={entry.achieved} disabled={disabled}
              onChange={(e) => set(ms.id, { achieved: e.target.checked })}
              className="mt-0.5 w-4 h-4 accent-primary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className={`text-sm ${delayed ? "text-warning" : entry.achieved ? "text-success" : "text-foreground"}`}>
                  {ms.label}
                </span>
                {delayed && <AlertTriangle className="w-3 h-3 text-warning" />}
              </div>
              <span className="text-[10px] text-muted-foreground">Esperado: {ms.normalMonths} meses</span>
              {entry.achieved && (
                <div className="flex items-center gap-2 mt-1">
                  <input type="number" min={0} max={72} value={entry.ageMonths ?? ""}
                    disabled={disabled} placeholder="Edad (meses)"
                    onChange={(e) => set(ms.id, { ageMonths: e.target.value ? Number(e.target.value) : undefined })}
                    className="w-24 text-xs border border-border rounded px-1.5 py-0.5 bg-background disabled:opacity-50" />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

function AlertsPanel({
  alerts,
  onChange,
  disabled,
}: {
  alerts: PediatricsPayload["pediatricAlerts"];
  onChange: (a: PediatricsPayload["pediatricAlerts"]) => void;
  disabled: boolean;
}) {
  const add = () => onChange([...alerts, {
    id: uid(), category: "", text: "", severity: "INFO", resolved: false,
  }]);

  return (
    <div className="space-y-2">
      {alerts.map((alert, idx) => (
        <div key={alert.id} className={`flex items-start gap-2 p-3 rounded-md border ${
          alert.resolved ? "opacity-50 border-border"
          : alert.severity === "CRITICAL" ? "border-destructive/40 bg-destructive/10/50"
          : alert.severity === "WARNING"  ? "border-warning/40 bg-warning/5"
          : "border-primary/30 bg-primary/10/30"
        }`}>
          <select value={alert.severity} disabled={disabled}
            onChange={(e) => { const a = [...alerts]; a[idx] = { ...a[idx], severity: e.target.value as typeof alert.severity }; onChange(a); }}
            className="text-xs border border-border rounded px-1 py-1 bg-background disabled:opacity-50">
            <option value="INFO">ℹ Info</option>
            <option value="WARNING">⚠ Aviso</option>
            <option value="CRITICAL">🔴 Crítico</option>
          </select>
          <input value={alert.text} disabled={disabled} placeholder="Descripción de la alerta"
            onChange={(e) => { const a = [...alerts]; a[idx] = { ...a[idx], text: e.target.value }; onChange(a); }}
            className="flex-1 text-sm border border-border rounded px-2 py-1 bg-background disabled:opacity-50" />
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <input type="checkbox" checked={alert.resolved} disabled={disabled}
              onChange={(e) => { const a = [...alerts]; a[idx] = { ...a[idx], resolved: e.target.checked }; onChange(a); }}
              className="w-3.5 h-3.5 accent-primary" />
            Resuelta
          </label>
          {!disabled && (
            <button type="button" onClick={() => onChange(alerts.filter((_, i) => i !== idx))}
              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}
      {!disabled && (
        <button type="button" onClick={add}
          className="flex items-center gap-1.5 text-xs text-primary border border-primary/30 bg-primary/5 hover:bg-primary/10 px-2.5 py-1.5 rounded-lg font-medium">
          <Plus className="w-3.5 h-3.5" /> Agregar alerta
        </button>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function PediatricsSection({ encounterId, disabled = false }: { encounterId: string; disabled?: boolean }) {
  const { data, loaded, saveState, update } = useSpecialtyPayload<PediatricsPayload>(
    encounterId, "PEDIATRICS", EMPTY_PEDIATRICS_PAYLOAD,
  );

  const vaccinesGiven = Object.values(data.vaccineRecord).filter((v) => v.given).length;
  const milestonesAchieved = Object.values(data.developmentMilestones).filter((m) => m.achieved).length;
  const activeAlerts = data.pediatricAlerts.filter((a) => !a.resolved && a.severity !== "INFO").length;

  return (
    <SpecialtyShell label="Módulo Pediatría" saveState={saveState} loaded={loaded}>
      <SectionAccordion title="Curvas de crecimiento" defaultOpen
        badge={<span className="text-xs px-2 py-0.5 rounded-full bg-secondary/50 text-muted-foreground">{data.growthCurve.length} mediciones</span>}>
        <GrowthTable points={data.growthCurve}
          onChange={(growthCurve) => update({ ...data, growthCurve })} disabled={disabled} />
      </SectionAccordion>

      <SectionAccordion title="Esquema de vacunación"
        badge={<span className="text-xs px-2 py-0.5 rounded-full bg-secondary/50 text-muted-foreground">{vaccinesGiven}/{VACCINES.length} aplicadas</span>}>
        <VaccineTable record={data.vaccineRecord}
          onChange={(vaccineRecord) => update({ ...data, vaccineRecord })} disabled={disabled} />
      </SectionAccordion>

      <SectionAccordion title="Hitos del desarrollo"
        badge={<span className="text-xs px-2 py-0.5 rounded-full bg-secondary/50 text-muted-foreground">{milestonesAchieved}/{MILESTONES.length} logrados</span>}>
        <MilestonesGrid milestones={data.developmentMilestones}
          onChange={(developmentMilestones) => update({ ...data, developmentMilestones })} disabled={disabled} />
      </SectionAccordion>

      <SectionAccordion title="Alertas pediátricas"
        badge={activeAlerts > 0
          ? <span className="text-xs px-2 py-0.5 rounded-full bg-destructive/15 text-destructive">{activeAlerts} activa{activeAlerts !== 1 ? "s" : ""}</span>
          : <span className="text-xs px-2 py-0.5 rounded-full bg-secondary/50 text-muted-foreground">{data.pediatricAlerts.length}</span>}>
        <AlertsPanel alerts={data.pediatricAlerts}
          onChange={(pediatricAlerts) => update({ ...data, pediatricAlerts })} disabled={disabled} />
      </SectionAccordion>
    </SpecialtyShell>
  );
}
