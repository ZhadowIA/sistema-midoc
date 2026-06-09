"use client";

import { Plus, Trash2 } from "lucide-react";
import { useSpecialtyPayload } from "@/components/clinical/useSpecialtyPayload";
import { SpecialtyShell } from "@/components/clinical/SpecialtyShell";
import { SectionAccordion } from "@/components/clinical/SectionAccordion";
import {
  EMPTY_GYNECOLOGY_PAYLOAD,
  type GynecologyPayload,
  type PrenatalVisit,
} from "@/lib/specialtyPayloadSchemas";

const SCREENING_ITEMS = [
  { id: "pap",          label: "Papanicolaou (PAP)" },
  { id: "colposcopy",   label: "Colposcopía" },
  { id: "mammography",  label: "Mastografía" },
  { id: "biopsy",       label: "Biopsia mamaria" },
  { id: "hpv",          label: "Prueba VPH" },
  { id: "glucose",      label: "Glucosa en ayunas" },
  { id: "tsh",          label: "TSH" },
  { id: "hiv",          label: "VIH" },
  { id: "vdrl",         label: "VDRL" },
  { id: "gbs",          label: "Cultivo Streptococcus B" },
  { id: "urine",        label: "Urocultivo" },
  { id: "anomaly_scan", label: "Ultrasonido 20 sem." },
  { id: "gtt",          label: "Curva de tolerancia glucosa" },
];

function uid() { return `v-${Date.now()}-${Math.random().toString(36).slice(2,6)}`; }

type ObstetricFormulaRecord = GynecologyPayload["obstetricFormula"];

function ObstetricField({ label, field, of_, set, disabled }: {
  label: string;
  field: keyof ObstetricFormulaRecord;
  of_: ObstetricFormulaRecord;
  set: (patch: Partial<ObstetricFormulaRecord>) => void;
  disabled: boolean;
}) {
  return (
    <div className="text-center">
      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
      <input type="number" min={0} max={30}
        value={(of_[field] as number) ?? ""}
        disabled={disabled}
        onChange={(e) => set({ [field]: e.target.value ? Number(e.target.value) : undefined })}
        className="w-16 text-center text-lg font-bold border-2 border-border rounded-md px-2 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
        placeholder="0"
      />
    </div>
  );
}

function ObstetricFormula({
  data, update, disabled,
}: { data: GynecologyPayload; update: (d: GynecologyPayload) => void; disabled: boolean }) {
  const of_ = data.obstetricFormula;
  const set = (patch: Partial<typeof of_>) =>
    update({ ...data, obstetricFormula: { ...of_, ...patch } });

  return (
    <div className="space-y-4">
      <div className="flex gap-6 flex-wrap">
        <ObstetricField label="G (Gestas)" field="G" of_={of_} set={set} disabled={disabled} />
        <ObstetricField label="P (Partos)" field="P" of_={of_} set={set} disabled={disabled} />
        <ObstetricField label="C (Cesáreas)" field="C" of_={of_} set={set} disabled={disabled} />
        <ObstetricField label="A (Abortos)" field="A" of_={of_} set={set} disabled={disabled} />
        <ObstetricField label="V (Vivos)" field="V" of_={of_} set={set} disabled={disabled} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Fecha última menstruación (FUM)</label>
          <input type="date" value={data.lastMenstrualPeriod ?? ""} disabled={disabled}
            onChange={(e) => update({ ...data, lastMenstrualPeriod: e.target.value || undefined })}
            className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Fecha probable de parto (FPP)</label>
          <input type="date" value={data.estimatedDueDate ?? ""} disabled={disabled}
            onChange={(e) => update({ ...data, estimatedDueDate: e.target.value || undefined })}
            className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Edad gestacional (semanas)</label>
          <input type="number" min={0} max={45} value={data.gestationalAgeWeeks ?? ""} disabled={disabled}
            onChange={(e) => update({ ...data, gestationalAgeWeeks: e.target.value ? Number(e.target.value) : undefined })}
            className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
            placeholder="Ej: 28" />
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={data.currentPregnancy} disabled={disabled}
          onChange={(e) => update({ ...data, currentPregnancy: e.target.checked })}
          className="w-4 h-4 accent-primary" />
        <span className="text-sm text-foreground">Paciente embarazada actualmente</span>
      </label>

      <div>
        <label className="text-xs text-muted-foreground block mb-1">Método anticonceptivo actual</label>
        <input type="text" value={data.contraceptionMethod ?? ""} disabled={disabled}
          onChange={(e) => update({ ...data, contraceptionMethod: e.target.value || undefined })}
          className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          placeholder="Ej: ACO, DIU, preservativo..." />
      </div>
    </div>
  );
}

function PrenatalTable({
  visits, onChange, disabled,
}: { visits: PrenatalVisit[]; onChange: (v: PrenatalVisit[]) => void; disabled: boolean }) {
  const add = () => onChange([...visits, {
    id: uid(), date: new Date().toISOString().slice(0,10), sdg: undefined,
  }]);

  const update = (idx: number, patch: Partial<PrenatalVisit>) => {
    const next = [...visits]; next[idx] = { ...next[idx], ...patch }; onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[700px]">
          <thead>
            <tr className="border-b border-border">
              {["Fecha","SDG","Peso (kg)","TA","FCF (lpm)","FUH (cm)","Presentación","Notas",""].map((h) => (
                <th key={h} className="text-left text-muted-foreground font-medium pb-2 pr-2">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visits.map((v, idx) => (
              <tr key={v.id} className="border-b border-border/40">
                <td className="py-1.5 pr-2">
                  <input type="date" value={v.date} disabled={disabled}
                    onChange={(e) => update(idx, { date: e.target.value })}
                    className="border border-border rounded px-1 py-0.5 bg-background w-28 disabled:opacity-50" />
                </td>
                {(["sdg","weight","fhr","fuh"] as const).map((f) => (
                  <td key={f} className="py-1.5 pr-2">
                    <input type="number" min={0} value={(v[f] as number) ?? ""} disabled={disabled}
                      onChange={(e) => update(idx, { [f]: e.target.value ? Number(e.target.value) : undefined })}
                      className="border border-border rounded px-1 py-0.5 bg-background w-16 disabled:opacity-50" />
                  </td>
                ))}
                {(["bp","presentation","notes"] as const).map((f) => (
                  <td key={f} className="py-1.5 pr-2">
                    <input type="text" value={v[f] ?? ""} disabled={disabled}
                      onChange={(e) => update(idx, { [f]: e.target.value || undefined })}
                      className="border border-border rounded px-1 py-0.5 bg-background w-24 disabled:opacity-50" />
                  </td>
                ))}
                <td className="py-1.5">
                  {!disabled && (
                    <button type="button" onClick={() => onChange(visits.filter((_, i) => i !== idx))}
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
          <Plus className="w-3.5 h-3.5" /> Agregar consulta prenatal
        </button>
      )}
    </div>
  );
}

function ScreeningChecklist({
  data, update, disabled,
}: { data: GynecologyPayload; update: (d: GynecologyPayload) => void; disabled: boolean }) {
  const cl = data.screeningChecklist;
  const set = (id: string, patch: Partial<(typeof cl)[string]>) =>
    update({ ...data, screeningChecklist: { ...cl, [id]: { ...cl[id], ...patch } } });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {SCREENING_ITEMS.map((item) => {
        const entry = cl[item.id] ?? { done: false };
        return (
          <div key={item.id} className={`flex items-start gap-2 p-2.5 rounded-lg border ${
            entry.done ? "border-success/30 bg-success/10/50" : "border-border"
          }`}>
            <input type="checkbox" checked={entry.done} disabled={disabled}
              onChange={(e) => set(item.id, { done: e.target.checked })}
              className="mt-0.5 w-4 h-4 accent-primary" />
            <div className="flex-1 min-w-0">
              <p className={`text-sm ${entry.done ? "line-through text-muted-foreground" : "text-foreground"}`}>{item.label}</p>
              {entry.done && (
                <div className="flex gap-2 mt-1 flex-wrap">
                  <input type="date" value={entry.date ?? ""} disabled={disabled}
                    onChange={(e) => set(item.id, { date: e.target.value || undefined })}
                    className="text-xs border border-border rounded px-1 py-0.5 bg-background disabled:opacity-50" />
                  <input type="text" value={entry.result ?? ""} disabled={disabled}
                    onChange={(e) => set(item.id, { result: e.target.value || undefined })}
                    placeholder="Resultado" className="flex-1 min-w-20 text-xs border border-border rounded px-1.5 py-0.5 bg-background disabled:opacity-50" />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function GynecologySection({ encounterId, disabled = false }: { encounterId: string; disabled?: boolean }) {
  const { data, loaded, saveState, update } = useSpecialtyPayload<GynecologyPayload>(
    encounterId, "GYNECOLOGY_OBSTETRICS", EMPTY_GYNECOLOGY_PAYLOAD,
  );

  const screeningDone = Object.values(data.screeningChecklist).filter((v) => v.done).length;

  return (
    <SpecialtyShell label="Módulo Ginecología y Obstetricia" saveState={saveState} loaded={loaded}>
      <SectionAccordion title="Fórmula obstétrica y datos generales" defaultOpen>
        <ObstetricFormula data={data} update={update} disabled={disabled} />
      </SectionAccordion>

      {data.currentPregnancy && (
        <SectionAccordion title="Control prenatal"
          badge={<span className="text-xs px-2 py-0.5 rounded-full bg-secondary/50 text-muted-foreground">{data.prenatalVisits.length} consultas</span>}>
          <PrenatalTable visits={data.prenatalVisits}
            onChange={(prenatalVisits) => update({ ...data, prenatalVisits })} disabled={disabled} />
        </SectionAccordion>
      )}

      <SectionAccordion title="Tamizajes y estudios"
        badge={<span className="text-xs px-2 py-0.5 rounded-full bg-secondary/50 text-muted-foreground">{screeningDone}/{SCREENING_ITEMS.length} realizados</span>}>
        <ScreeningChecklist data={data} update={update} disabled={disabled} />
      </SectionAccordion>
    </SpecialtyShell>
  );
}
