"use client";

import { useSpecialtyPayload } from "@/components/clinical/useSpecialtyPayload";
import { SpecialtyShell } from "@/components/clinical/SpecialtyShell";
import { SectionAccordion } from "@/components/clinical/SectionAccordion";
import {
  EMPTY_FAMILY_MEDICINE_PAYLOAD,
  type FamilyMedicinePayload,
} from "@/lib/specialtyPayloadSchemas";

// ─── Preventive checklist items ───────────────────────────────────────────────

const PREVENTIVE_ITEMS = [
  { id: "glycemia",      label: "Glucemia en ayunas" },
  { id: "lipids",        label: "Perfil de lípidos" },
  { id: "bp",            label: "Presión arterial" },
  { id: "pap",           label: "Papanicolaou" },
  { id: "mammography",   label: "Mastografía" },
  { id: "colonoscopy",   label: "Colonoscopía" },
  { id: "bmd",           label: "Densitometría ósea" },
  { id: "influenza",     label: "Vacuna influenza (anual)" },
  { id: "pneumococcal",  label: "Vacuna neumococo" },
  { id: "eyeExam",       label: "Examen visual" },
  { id: "dentalCheckup", label: "Revisión dental" },
  { id: "thyroid",       label: "TSH / Función tiroidea" },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

type RiskFactorsRecord = FamilyMedicinePayload["riskFactors"];

function BoolRow({
  label,
  field,
  rf,
  set,
  disabled,
}: {
  label: string;
  field: keyof RiskFactorsRecord;
  rf: RiskFactorsRecord;
  set: (patch: Partial<RiskFactorsRecord>) => void;
  disabled: boolean;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        disabled={disabled}
        checked={Boolean(rf[field])}
        onChange={(e) => set({ [field]: e.target.checked })}
        className="w-4 h-4 rounded border-border accent-primary"
      />
      <span className="text-sm text-foreground">{label}</span>
    </label>
  );
}

function RiskFactors({
  data,
  update,
  disabled,
}: {
  data: FamilyMedicinePayload;
  update: (d: FamilyMedicinePayload) => void;
  disabled: boolean;
}) {
  const rf = data.riskFactors;
  const set = (patch: Partial<typeof rf>) =>
    update({ ...data, riskFactors: { ...rf, ...patch } });

  return (
    <div className="space-y-4">
      {/* Lifestyle */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Tabaquismo</label>
          <select
            value={rf.smoking ?? ""}
            disabled={disabled}
            onChange={(e) => set({ smoking: (e.target.value || undefined) as typeof rf.smoking })}
            className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          >
            <option value="">— No registrado —</option>
            <option value="NEVER">Nunca fumó</option>
            <option value="FORMER">Ex-fumador</option>
            <option value="CURRENT">Fumador activo</option>
          </select>
        </div>
        {rf.smoking && rf.smoking !== "NEVER" && (
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Paquetes/año</label>
            <input
              type="number"
              min={0}
              value={rf.smokingPackYear ?? ""}
              disabled={disabled}
              onChange={(e) => set({ smokingPackYear: e.target.value ? Number(e.target.value) : undefined })}
              className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
              placeholder="Ej: 10"
            />
          </div>
        )}
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Consumo de alcohol</label>
          <select
            value={rf.alcohol ?? ""}
            disabled={disabled}
            onChange={(e) => set({ alcohol: (e.target.value || undefined) as typeof rf.alcohol })}
            className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
          >
            <option value="">— No registrado —</option>
            <option value="NONE">No consume</option>
            <option value="OCCASIONAL">Ocasional</option>
            <option value="MODERATE">Moderado</option>
            <option value="HEAVY">Alto riesgo</option>
          </select>
        </div>
      </div>

      {/* Boolean risk factors */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <BoolRow label="Sedentarismo" field="sedentary" rf={rf} set={set} disabled={disabled} />
        <BoolRow label="Obesidad" field="obesity" rf={rf} set={set} disabled={disabled} />
        <BoolRow label="Diabetes" field="diabetes" rf={rf} set={set} disabled={disabled} />
        <BoolRow label="Hipertensión" field="hypertension" rf={rf} set={set} disabled={disabled} />
        <BoolRow label="Dislipidemia" field="dyslipidemia" rf={rf} set={set} disabled={disabled} />
        <BoolRow label="Cardiopatía familiar" field="familyHeartDisease" rf={rf} set={set} disabled={disabled} />
      </div>

      {/* Notes */}
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Notas adicionales</label>
        <textarea
          rows={2}
          value={rf.notes ?? ""}
          disabled={disabled}
          onChange={(e) => set({ notes: e.target.value || undefined })}
          className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 resize-none"
          placeholder="Antecedentes adicionales relevantes…"
        />
      </div>
    </div>
  );
}

function PreventiveChecklist({
  data,
  update,
  disabled,
}: {
  data: FamilyMedicinePayload;
  update: (d: FamilyMedicinePayload) => void;
  disabled: boolean;
}) {
  const cl = data.preventiveChecklist;

  const setItem = (id: string, patch: Partial<(typeof cl)[string]>) =>
    update({ ...data, preventiveChecklist: { ...cl, [id]: { ...cl[id], ...patch } } });

  return (
    <div className="space-y-2">
      {PREVENTIVE_ITEMS.map((item) => {
        const entry = cl[item.id] ?? { done: false };
        return (
          <div
            key={item.id}
            className={`flex items-start gap-3 p-3 rounded-md border transition-colors ${
              entry.done ? "border-success/30 bg-success/10/50" : "border-border bg-card"
            }`}
          >
            <input
              type="checkbox"
              checked={entry.done}
              disabled={disabled}
              onChange={(e) => setItem(item.id, { done: e.target.checked })}
              className="mt-0.5 w-4 h-4 accent-primary"
            />
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
              <span className={`text-sm ${entry.done ? "line-through text-muted-foreground" : "text-foreground"}`}>
                {item.label}
              </span>
              {entry.done && (
                <>
                  <input
                    type="date"
                    value={entry.date ?? ""}
                    disabled={disabled}
                    onChange={(e) => setItem(item.id, { date: e.target.value || undefined })}
                    className="text-xs border border-border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                  />
                  <input
                    type="text"
                    value={entry.result ?? ""}
                    disabled={disabled}
                    onChange={(e) => setItem(item.id, { result: e.target.value || undefined })}
                    placeholder="Resultado / observación"
                    className="text-xs border border-border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                  />
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function FamilyMedicineSection({
  encounterId,
  disabled = false,
}: {
  encounterId: string;
  disabled?: boolean;
}) {
  const { data, loaded, saveState, update } = useSpecialtyPayload<FamilyMedicinePayload>(
    encounterId,
    "FAMILY_MEDICINE",
    EMPTY_FAMILY_MEDICINE_PAYLOAD,
  );

  const doneCount = Object.values(data.preventiveChecklist).filter((v) => v.done).length;
  const activeRisks = [
    data.riskFactors.smoking === "CURRENT" && "Tabaquismo",
    data.riskFactors.alcohol === "HEAVY" && "Alcohol alto riesgo",
    data.riskFactors.obesity && "Obesidad",
    data.riskFactors.diabetes && "Diabetes",
    data.riskFactors.hypertension && "HTA",
    data.riskFactors.dyslipidemia && "Dislipidemia",
  ].filter(Boolean) as string[];

  return (
    <SpecialtyShell label="Módulo Medicina Familiar" saveState={saveState} loaded={loaded}>
      <SectionAccordion
        title="Factores de riesgo"
        defaultOpen
        badge={
          activeRisks.length > 0 ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-warning/15 text-warning">
              {activeRisks.length} activo{activeRisks.length !== 1 ? "s" : ""}
            </span>
          ) : undefined
        }
      >
        <RiskFactors data={data} update={update} disabled={disabled} />
      </SectionAccordion>

      <SectionAccordion
        title="Checklist preventivo"
        badge={
          <span className="text-xs px-2 py-0.5 rounded-full bg-secondary/50 text-muted-foreground">
            {doneCount}/{PREVENTIVE_ITEMS.length} realizados
          </span>
        }
      >
        <PreventiveChecklist data={data} update={update} disabled={disabled} />
      </SectionAccordion>
    </SpecialtyShell>
  );
}
