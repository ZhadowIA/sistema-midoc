"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/Card";
import { Input } from "@/components/Input";
import { TextArea } from "@/components/TextArea";
import { Button } from "@/components/Button";
import { Save } from "lucide-react";
import type { EncounterHistoryPayload } from "@/lib/encounterHistorySchema";
import { CompletionMeter } from "./CompletionMeter";
import { AssessmentList } from "./AssessmentList";

type Props = {
  initial: EncounterHistoryPayload;
  completionPct: number;
  onSave: (payload: EncounterHistoryPayload) => Promise<void>;
  disabled?: boolean;
};

export function EncounterHistoryForm({
  initial,
  completionPct,
  onSave,
  disabled,
}: Props) {
  const [payload, setPayload] = useState<EncounterHistoryPayload>(initial);
  const [saving, setSaving] = useState(false);

  const update = <K extends keyof EncounterHistoryPayload>(
    key: K,
    value: EncounterHistoryPayload[K],
  ) => setPayload((p) => ({ ...p, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(payload);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex items-center justify-between gap-4">
          <CardTitle>Encuentro clínico</CardTitle>
          <CompletionMeter pct={completionPct} className="min-w-[220px]" />
        </CardHeader>
      </Card>

      <Card>
        <CardHeader><CardTitle>Motivo de consulta</CardTitle></CardHeader>
        <CardContent>
          <Input
            value={payload.chiefComplaint}
            onChange={(e) => update("chiefComplaint", e.target.value)}
            placeholder="Dolor abdominal de 3 días..."
            disabled={disabled}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Padecimiento actual</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            label="Inicio"
            value={payload.presentIllness.onset ?? ""}
            onChange={(e) =>
              update("presentIllness", { ...payload.presentIllness, onset: e.target.value })
            }
            disabled={disabled}
          />
          <Input
            label="Duración"
            value={payload.presentIllness.duration ?? ""}
            onChange={(e) =>
              update("presentIllness", { ...payload.presentIllness, duration: e.target.value })
            }
            disabled={disabled}
          />
          <Input
            label="Curso"
            value={payload.presentIllness.course ?? ""}
            onChange={(e) =>
              update("presentIllness", { ...payload.presentIllness, course: e.target.value })
            }
            disabled={disabled}
          />
          <Input
            label="Localización"
            value={payload.presentIllness.location ?? ""}
            onChange={(e) =>
              update("presentIllness", { ...payload.presentIllness, location: e.target.value })
            }
            disabled={disabled}
          />
          <Input
            label="Intensidad"
            value={payload.presentIllness.intensity ?? ""}
            onChange={(e) =>
              update("presentIllness", { ...payload.presentIllness, intensity: e.target.value })
            }
            disabled={disabled}
          />
          <Input
            label="Características"
            value={payload.presentIllness.characteristics ?? ""}
            onChange={(e) =>
              update("presentIllness", { ...payload.presentIllness, characteristics: e.target.value })
            }
            disabled={disabled}
          />
          <div className="md:col-span-2">
            <TextArea
              label="Resumen"
              rows={3}
              value={payload.presentIllness.summary ?? ""}
              onChange={(e) =>
                update("presentIllness", { ...payload.presentIllness, summary: e.target.value })
              }
              disabled={disabled}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Negativos relevantes</CardTitle></CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Interrogatorio por aparatos y sistemas</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            ["respiratorio", "Respiratorio"],
            ["cardiovascular", "Cardiovascular"],
            ["digestivo", "Digestivo"],
            ["genitourinario", "Genitourinario"],
            ["musculoesqueletico", "Musculoesquelético"],
            ["neurologico", "Neurológico"],
            ["endocrino", "Endocrino"],
            ["piel", "Piel y tegumentos"],
          ].map(([k, label]) => (
            <TextArea
              key={k}
              label={label}
              rows={2}
              value={String((payload.reviewOfSystems as Record<string, unknown>)[k] ?? "")}
              onChange={(e) => {
                const next = { ...(payload.reviewOfSystems as Record<string, unknown>) };
                if (e.target.value) next[k] = e.target.value;
                else delete next[k];
                update("reviewOfSystems", next);
              }}
              disabled={disabled}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Signos vitales y somatometría</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(() => {
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
              <>
                <Input label="TA (mmHg)" placeholder="120/80" value={s("ta")} onChange={(e) => setVital("ta", e.target.value)} disabled={disabled} />
                <Input label="FC (lpm)" type="number" value={s("fc")} onChange={(e) => setVital("fc", e.target.value)} disabled={disabled} />
                <Input label="FR (rpm)" type="number" value={s("fr")} onChange={(e) => setVital("fr", e.target.value)} disabled={disabled} />
                <Input label="Temp (°C)" type="number" step="0.1" value={s("temp")} onChange={(e) => setVital("temp", e.target.value)} disabled={disabled} />
                <Input label="SatO₂ (%)" type="number" value={s("sato2")} onChange={(e) => setVital("sato2", e.target.value)} disabled={disabled} />
                <Input label="Peso (kg)" type="number" step="0.1" value={s("peso")} onChange={(e) => setVital("peso", e.target.value)} disabled={disabled} />
                <Input label="Talla (cm)" type="number" step="0.1" value={s("talla")} onChange={(e) => setVital("talla", e.target.value)} disabled={disabled} />
                <Input label="IMC" value={s("imc")} readOnly disabled />
              </>
            );
          })()}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Exploración física</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            ["general", "General"],
            ["cabezaCuello", "Cabeza y cuello"],
            ["cardiopulmonar", "Cardiopulmonar"],
            ["abdomen", "Abdomen"],
            ["extremidades", "Extremidades"],
            ["neurologico", "Neurológico"],
            ["piel", "Piel y tegumentos"],
            ["otros", "Otros hallazgos"],
          ].map(([k, label]) => (
            <TextArea
              key={k}
              label={label}
              rows={2}
              value={String((payload.physicalExam as Record<string, unknown>)[k] ?? "")}
              onChange={(e) => {
                const next = { ...(payload.physicalExam as Record<string, unknown>) };
                if (e.target.value) next[k] = e.target.value;
                else delete next[k];
                update("physicalExam", next);
              }}
              disabled={disabled}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Impresión diagnóstica</CardTitle></CardHeader>
        <CardContent>
          <AssessmentList
            value={payload.assessment}
            onChange={(v) => update("assessment", v)}
            disabled={disabled}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Plan diagnóstico</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {[
            ["laboratorios", "Laboratorios"],
            ["gabinete", "Imagen / gabinete"],
            ["interconsultas", "Interconsultas"],
          ].map(([k, label]) => (
            <TextArea
              key={k}
              label={label}
              rows={2}
              value={String((payload.diagnosticPlan as Record<string, unknown>)[k] ?? "")}
              onChange={(e) => {
                const next = { ...(payload.diagnosticPlan as Record<string, unknown>) };
                if (e.target.value) next[k] = e.target.value;
                else delete next[k];
                update("diagnosticPlan", next);
              }}
              disabled={disabled}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Plan terapéutico</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {[
            ["farmacologico", "Farmacológico"],
            ["no_farmacologico", "No farmacológico"],
            ["educacion", "Educación al paciente"],
          ].map(([k, label]) => (
            <TextArea
              key={k}
              label={label}
              rows={2}
              value={String((payload.treatmentPlan as Record<string, unknown>)[k] ?? "")}
              onChange={(e) => {
                const next = { ...(payload.treatmentPlan as Record<string, unknown>) };
                if (e.target.value) next[k] = e.target.value;
                else delete next[k];
                update("treatmentPlan", next);
              }}
              disabled={disabled}
            />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Seguimiento</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            label="Próxima cita"
            value={String((payload.followUp as Record<string, unknown>).proxima_cita ?? "")}
            onChange={(e) => {
              const next = { ...(payload.followUp as Record<string, unknown>) };
              if (e.target.value) next.proxima_cita = e.target.value;
              else delete next.proxima_cita;
              update("followUp", next);
            }}
            placeholder="En 2 semanas"
            disabled={disabled}
          />
          <TextArea
            label="Datos de alarma"
            rows={2}
            value={String((payload.followUp as Record<string, unknown>).datos_alarma ?? "")}
            onChange={(e) => {
              const next = { ...(payload.followUp as Record<string, unknown>) };
              if (e.target.value) next.datos_alarma = e.target.value;
              else delete next.datos_alarma;
              update("followUp", next);
            }}
            placeholder="Fiebre > 38.5, dolor progresivo"
            disabled={disabled}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} loading={saving} disabled={disabled}>
          <Save className="w-4 h-4" /> Guardar encuentro
        </Button>
      </div>
    </div>
  );
}
