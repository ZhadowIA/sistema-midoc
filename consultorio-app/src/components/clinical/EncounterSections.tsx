"use client";

import { Input } from "@/components/Input";
import { TextArea } from "@/components/TextArea";
import type { EncounterHistoryPayload } from "@/lib/encounterHistorySchema";
import { AssessmentList } from "./AssessmentList";

export type SectionProps = {
  payload: EncounterHistoryPayload;
  update: <K extends keyof EncounterHistoryPayload>(
    key: K,
    value: EncounterHistoryPayload[K],
  ) => void;
  disabled?: boolean;
};

export function ChiefComplaintSection({ payload, update, disabled }: SectionProps) {
  return (
    <Input
      value={payload.chiefComplaint}
      onChange={(e) => update("chiefComplaint", e.target.value)}
      placeholder="Dolor abdominal de 3 días..."
      disabled={disabled}
    />
  );
}

export function PresentIllnessSection({ payload, update, disabled }: SectionProps) {
  const pi = payload.presentIllness;
  const set = (k: keyof typeof pi, v: string) =>
    update("presentIllness", { ...pi, [k]: v });
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <Input label="Inicio" value={pi.onset ?? ""} onChange={(e) => set("onset", e.target.value)} disabled={disabled} />
      <Input label="Duración" value={pi.duration ?? ""} onChange={(e) => set("duration", e.target.value)} disabled={disabled} />
      <Input label="Curso" value={pi.course ?? ""} onChange={(e) => set("course", e.target.value)} disabled={disabled} />
      <Input label="Localización" value={pi.location ?? ""} onChange={(e) => set("location", e.target.value)} disabled={disabled} />
      <Input label="Intensidad" value={pi.intensity ?? ""} onChange={(e) => set("intensity", e.target.value)} disabled={disabled} />
      <Input label="Características" value={pi.characteristics ?? ""} onChange={(e) => set("characteristics", e.target.value)} disabled={disabled} />
      <div className="md:col-span-2">
        <TextArea label="Resumen" rows={3} value={pi.summary ?? ""} onChange={(e) => set("summary", e.target.value)} disabled={disabled} />
      </div>
    </div>
  );
}

export function PertinentNegativesSection({ payload, update, disabled }: SectionProps) {
  return (
    <TextArea
      label="Uno por línea"
      rows={3}
      value={payload.pertinentNegatives.join("\n")}
      onChange={(e) =>
        update(
          "pertinentNegatives",
          e.target.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
        )
      }
      disabled={disabled}
    />
  );
}

function RecordTextAreas({
  field,
  entries,
  payload,
  update,
  disabled,
  rows = 2,
}: SectionProps & {
  field: "reviewOfSystems" | "physicalExam" | "diagnosticPlan" | "treatmentPlan";
  entries: ReadonlyArray<readonly [string, string]>;
  rows?: number;
}) {
  const data = payload[field] as Record<string, unknown>;
  return (
    <>
      {entries.map(([k, label]) => (
        <TextArea
          key={k}
          label={label}
          rows={rows}
          value={String(data[k] ?? "")}
          onChange={(e) => {
            const next = { ...data };
            if (e.target.value) next[k] = e.target.value;
            else delete next[k];
            update(field, next as EncounterHistoryPayload[typeof field]);
          }}
          disabled={disabled}
        />
      ))}
    </>
  );
}

export function ReviewOfSystemsSection(props: SectionProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <RecordTextAreas
        {...props}
        field="reviewOfSystems"
        entries={[
          ["respiratorio", "Respiratorio"],
          ["cardiovascular", "Cardiovascular"],
          ["digestivo", "Digestivo"],
          ["genitourinario", "Genitourinario"],
          ["musculoesqueletico", "Musculoesquelético"],
          ["neurologico", "Neurológico"],
          ["endocrino", "Endocrino"],
          ["piel", "Piel y tegumentos"],
        ]}
      />
    </div>
  );
}

export function VitalsSection({ payload, update, disabled }: SectionProps) {
  const v = payload.vitals as Record<string, unknown>;
  const setVital = (k: string, val: string) => {
    const next = { ...v, [k]: val } as Record<string, unknown>;
    if (!val) delete next[k];
    const peso = parseFloat(String(next.peso ?? ""));
    const tallaCm = parseFloat(String(next.talla ?? ""));
    if (peso > 0 && tallaCm > 0) {
      const m = tallaCm > 3 ? tallaCm / 100 : tallaCm;
      next.imc = (peso / (m * m)).toFixed(1);
    }
    update("vitals", next);
  };
  const s = (k: string) => (v[k] == null ? "" : String(v[k]));
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Input label="TA (mmHg)" placeholder="120/80" value={s("ta")} onChange={(e) => setVital("ta", e.target.value)} disabled={disabled} />
      <Input label="FC (lpm)" type="number" value={s("fc")} onChange={(e) => setVital("fc", e.target.value)} disabled={disabled} />
      <Input label="FR (rpm)" type="number" value={s("fr")} onChange={(e) => setVital("fr", e.target.value)} disabled={disabled} />
      <Input label="Temp (°C)" type="number" step="0.1" value={s("temp")} onChange={(e) => setVital("temp", e.target.value)} disabled={disabled} />
      <Input label="SatO₂ (%)" type="number" value={s("sato2")} onChange={(e) => setVital("sato2", e.target.value)} disabled={disabled} />
      <Input label="Peso (kg)" type="number" step="0.1" value={s("peso")} onChange={(e) => setVital("peso", e.target.value)} disabled={disabled} />
      <Input label="Talla (cm)" type="number" step="0.1" value={s("talla")} onChange={(e) => setVital("talla", e.target.value)} disabled={disabled} />
      <Input label="IMC" value={s("imc")} readOnly disabled />
    </div>
  );
}

export function PhysicalExamSection(props: SectionProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <RecordTextAreas
        {...props}
        field="physicalExam"
        entries={[
          ["general", "General"],
          ["cabezaCuello", "Cabeza y cuello"],
          ["cardiopulmonar", "Cardiopulmonar"],
          ["abdomen", "Abdomen"],
          ["extremidades", "Extremidades"],
          ["neurologico", "Neurológico"],
          ["piel", "Piel y tegumentos"],
          ["otros", "Otros hallazgos"],
        ]}
      />
    </div>
  );
}

export function AssessmentSection({ payload, update, disabled }: SectionProps) {
  return (
    <AssessmentList
      value={payload.assessment}
      onChange={(v) => update("assessment", v)}
      disabled={disabled}
    />
  );
}

export function DiagnosticPlanSection(props: SectionProps) {
  return (
    <div className="space-y-3">
      <RecordTextAreas
        {...props}
        field="diagnosticPlan"
        entries={[
          ["laboratorios", "Laboratorios"],
          ["gabinete", "Imagen / gabinete"],
          ["interconsultas", "Interconsultas"],
        ]}
      />
    </div>
  );
}

export function TreatmentPlanSection(props: SectionProps) {
  return (
    <div className="space-y-3">
      <RecordTextAreas
        {...props}
        field="treatmentPlan"
        entries={[
          ["farmacologico", "Farmacológico"],
          ["no_farmacologico", "No farmacológico"],
          ["educacion", "Educación al paciente"],
        ]}
      />
    </div>
  );
}

export function FollowUpSection({ payload, update, disabled }: SectionProps) {
  const f = payload.followUp as Record<string, unknown>;
  const set = (k: string, val: string) => {
    const next = { ...f };
    if (val) next[k] = val;
    else delete next[k];
    update("followUp", next);
  };
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <Input
        label="Próxima cita"
        value={String(f.proxima_cita ?? "")}
        onChange={(e) => set("proxima_cita", e.target.value)}
        placeholder="En 2 semanas"
        disabled={disabled}
      />
      <TextArea
        label="Datos de alarma"
        rows={2}
        value={String(f.datos_alarma ?? "")}
        onChange={(e) => set("datos_alarma", e.target.value)}
        placeholder="Fiebre > 38.5, dolor progresivo"
        disabled={disabled}
      />
    </div>
  );
}

export const ENCOUNTER_SECTION_TITLES: Record<string, string> = {
  chiefComplaint: "Motivo de consulta",
  presentIllness: "Padecimiento actual",
  pertinentNegatives: "Negativos relevantes",
  reviewOfSystems: "Interrogatorio por sistemas",
  vitals: "Signos vitales y somatometría",
  physicalExam: "Exploración física",
  assessment: "Impresión diagnóstica",
  diagnosticPlan: "Plan diagnóstico",
  treatmentPlan: "Plan terapéutico",
  followUp: "Seguimiento",
};
