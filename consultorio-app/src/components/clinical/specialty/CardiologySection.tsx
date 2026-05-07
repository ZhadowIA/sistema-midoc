"use client";

import { useSpecialtyPayload } from "@/components/clinical/useSpecialtyPayload";
import { SpecialtyShell } from "@/components/clinical/SpecialtyShell";
import { SectionAccordion } from "@/components/clinical/SectionAccordion";
import {
  EMPTY_CARDIOLOGY_PAYLOAD,
  type CardiologyPayload,
} from "@/lib/specialtyPayloadSchemas";

const RED_FLAGS = [
  { id: "chest_pain",       label: "Dolor torácico en reposo" },
  { id: "syncope",          label: "Síncope / Pre-síncope" },
  { id: "dyspnea_rest",     label: "Disnea en reposo" },
  { id: "orthopnea",        label: "Ortopnea / DPN" },
  { id: "palpitations",     label: "Palpitaciones sostenidas" },
  { id: "edema_bilateral",  label: "Edema bilateral MMII" },
  { id: "hemoptysis",       label: "Hemoptisis" },
  { id: "sudden_death_fhx", label: "Muerte súbita familiar <50 años" },
];

const NYHA_LABELS: Record<string, string> = {
  I:   "Clase I — Sin limitación",
  II:  "Clase II — Limitación leve",
  III: "Clase III — Limitación marcada",
  IV:  "Clase IV — Síntomas en reposo",
};
const CCS_LABELS: Record<string, string> = {
  I:   "Clase I — Angina solo con esfuerzo extenuante",
  II:  "Clase II — Angina con actividad ordinaria",
  III: "Clase III — Angina con mínimo esfuerzo",
  IV:  "Clase IV — Angina en reposo",
};

function riskCategory(score: number): { label: string; color: string } {
  if (score < 10) return { label: "Bajo riesgo", color: "text-success" };
  if (score < 20) return { label: "Riesgo intermedio", color: "text-warning" };
  return { label: "Alto riesgo", color: "text-destructive" };
}

type CvRiskFactors = CardiologyPayload["cvRiskFactors"];

function NumField({ label, field, unit, min = 0, max = 9999, rf, setRf, disabled }: {
  label: string;
  field: keyof CvRiskFactors;
  unit?: string;
  min?: number;
  max?: number;
  rf: CvRiskFactors;
  setRf: (patch: Partial<CvRiskFactors>) => void;
  disabled: boolean;
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground block mb-1">{label}{unit ? ` (${unit})` : ""}</label>
      <input type="number" min={min} max={max} value={(rf[field] as number) ?? ""} disabled={disabled}
        onChange={(e) => setRf({ [field]: e.target.value ? Number(e.target.value) : undefined })}
        className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
        placeholder="—" />
    </div>
  );
}

export function CardiologySection({ encounterId, disabled = false }: { encounterId: string; disabled?: boolean }) {
  const { data, loaded, saveState, update } = useSpecialtyPayload<CardiologyPayload>(
    encounterId, "CARDIOLOGY", EMPTY_CARDIOLOGY_PAYLOAD,
  );

  const rf  = data.cvRiskFactors;
  const setRf = (patch: Partial<typeof rf>) => update({ ...data, cvRiskFactors: { ...rf, ...patch } });
  const flags = data.redFlags;
  const setFlag = (id: string, val: boolean) => update({ ...data, redFlags: { ...flags, [id]: val } });

  const activeFlags = Object.values(flags).filter(Boolean).length;
  const riskInfo = data.framinghamScore !== undefined ? riskCategory(data.framinghamScore) : null;

  return (
    <SpecialtyShell label="Módulo Cardiología" saveState={saveState} loaded={loaded}>
      {/* Red flags — always visible at top */}
      {activeFlags > 0 && (
        <div className="flex flex-wrap gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-md">
          <span className="text-xs font-semibold text-destructive w-full">🔴 Red flags activos:</span>
          {RED_FLAGS.filter((f) => flags[f.id]).map((f) => (
            <span key={f.id} className="text-xs bg-destructive/15 text-destructive border border-destructive/30 px-2 py-0.5 rounded-full">{f.label}</span>
          ))}
        </div>
      )}

      {/* CV Risk Factors */}
      <SectionAccordion title="Factores de riesgo cardiovascular" defaultOpen>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          <NumField label="Edad" field="age" unit="años" min={0} max={120} rf={rf} setRf={setRf} disabled={disabled} />
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Sexo</label>
            <select value={rf.sex ?? ""} disabled={disabled}
              onChange={(e) => setRf({ sex: (e.target.value || undefined) as typeof rf.sex })}
              className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50">
              <option value="">—</option>
              <option value="M">Masculino</option>
              <option value="F">Femenino</option>
            </select>
          </div>
          <NumField label="Colesterol total" field="totalCholesterol" unit="mg/dL" rf={rf} setRf={setRf} disabled={disabled} />
          <NumField label="HDL" field="hdl" unit="mg/dL" rf={rf} setRf={setRf} disabled={disabled} />
          <NumField label="LDL" field="ldl" unit="mg/dL" rf={rf} setRf={setRf} disabled={disabled} />
          <NumField label="TA sistólica" field="systolicBP" unit="mmHg" rf={rf} setRf={setRf} disabled={disabled} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {([
            { label: "En tratamiento antihipertensivo", field: "onBPMeds" },
            { label: "Fumador activo", field: "smoker" },
            { label: "Diabetes mellitus", field: "diabetic" },
            { label: "Historia familiar de ECV", field: "familyHistory" },
          ] as const).map(({ label, field }) => (
            <label key={field} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={Boolean(rf[field])} disabled={disabled}
                onChange={(e) => setRf({ [field]: e.target.checked })}
                className="w-4 h-4 accent-primary" />
              <span className="text-sm text-foreground">{label}</span>
            </label>
          ))}
        </div>
      </SectionAccordion>

      {/* Risk scores */}
      <SectionAccordion title="Escalas de riesgo y clasificación funcional">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Score de Framingham (%)</label>
            <div className="flex items-center gap-2">
              <input type="number" min={0} max={100} value={data.framinghamScore ?? ""} disabled={disabled}
                onChange={(e) => update({ ...data, framinghamScore: e.target.value ? Number(e.target.value) : undefined })}
                className="w-24 text-sm border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                placeholder="0–100" />
              {riskInfo && <span className={`text-sm font-semibold ${riskInfo.color}`}>{riskInfo.label}</span>}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">ASCVD Risk (%)</label>
            <input type="number" min={0} max={100} value={data.ascvdRisk ?? ""} disabled={disabled}
              onChange={(e) => update({ ...data, ascvdRisk: e.target.value ? Number(e.target.value) : undefined })}
              className="w-24 text-sm border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              placeholder="0–100" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Clase funcional NYHA</label>
            <select value={data.nyhaClass ?? ""} disabled={disabled}
              onChange={(e) => update({ ...data, nyhaClass: (e.target.value || undefined) as typeof data.nyhaClass })}
              className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50">
              <option value="">— No aplica —</option>
              {Object.entries(NYHA_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Clase anginosa CCS</label>
            <select value={data.ccsClass ?? ""} disabled={disabled}
              onChange={(e) => update({ ...data, ccsClass: (e.target.value || undefined) as typeof data.ccsClass })}
              className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50">
              <option value="">— No aplica —</option>
              {Object.entries(CCS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
      </SectionAccordion>

      {/* ECG / Echo findings */}
      <SectionAccordion title="Hallazgos ECG y Ecocardiograma">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">ECG de reposo</label>
            <textarea rows={3} value={data.ecgFindings ?? ""} disabled={disabled}
              onChange={(e) => update({ ...data, ecgFindings: e.target.value || undefined })}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 resize-none"
              placeholder="Ritmo sinusal, FC 75 lpm, sin alteraciones…" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Ecocardiograma</label>
            <textarea rows={3} value={data.echoFindings ?? ""} disabled={disabled}
              onChange={(e) => update({ ...data, echoFindings: e.target.value || undefined })}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 resize-none"
              placeholder="FEVI 60%, función diastólica normal…" />
          </div>
        </div>
      </SectionAccordion>

      {/* Red flags */}
      <SectionAccordion title="Red flags cardiovasculares"
        badge={activeFlags > 0
          ? <span className="text-xs px-2 py-0.5 rounded-full bg-destructive/15 text-destructive">{activeFlags} activo{activeFlags !== 1 ? "s" : ""}</span>
          : undefined}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {RED_FLAGS.map((f) => (
            <label key={f.id} className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer ${
              flags[f.id] ? "border-destructive/40 bg-destructive/10" : "border-border"
            }`}>
              <input type="checkbox" checked={Boolean(flags[f.id])} disabled={disabled}
                onChange={(e) => setFlag(f.id, e.target.checked)}
                className="w-4 h-4 accent-red-500" />
              <span className={`text-sm ${flags[f.id] ? "text-destructive font-medium" : "text-foreground"}`}>{f.label}</span>
            </label>
          ))}
        </div>
      </SectionAccordion>
    </SpecialtyShell>
  );
}
