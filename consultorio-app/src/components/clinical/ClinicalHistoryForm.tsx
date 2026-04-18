"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/Card";
import { Input } from "@/components/Input";
import { TextArea } from "@/components/TextArea";
import { Button } from "@/components/Button";
import { Save } from "lucide-react";
import type { ClinicalHistoryPayload } from "@/lib/clinicalHistorySchema";
import { CompletionMeter } from "./CompletionMeter";
import { ClinicalAlertsBar } from "./ClinicalAlertsBar";

type Props = {
  initial: ClinicalHistoryPayload;
  completionPct: number;
  onSave: (payload: ClinicalHistoryPayload) => Promise<void>;
  disabled?: boolean;
};

function linesToItems(text: string): Array<Record<string, unknown>> {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((description) => ({ description }));
}

function itemsToLines(items: Array<Record<string, unknown>>): string {
  return items
    .map((it) =>
      typeof it.description === "string"
        ? it.description
        : JSON.stringify(it),
    )
    .join("\n");
}

export function ClinicalHistoryForm({
  initial,
  completionPct,
  onSave,
  disabled,
}: Props) {
  const [payload, setPayload] = useState<ClinicalHistoryPayload>(initial);
  const [saving, setSaving] = useState(false);

  const update = <K extends keyof ClinicalHistoryPayload>(
    key: K,
    value: ClinicalHistoryPayload[K],
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
      <ClinicalAlertsBar alerts={payload.alerts} allergies={payload.allergies} />

      <Card>
        <CardHeader className="flex items-center justify-between gap-4">
          <CardTitle>Historia clínica</CardTitle>
          <CompletionMeter pct={completionPct} className="min-w-[220px]" />
        </CardHeader>
      </Card>

      <Card>
        <CardHeader><CardTitle>Identificación</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            label="Sexo biológico"
            value={payload.identification.sex ?? ""}
            onChange={(e) => update("identification", { ...payload.identification, sex: e.target.value })}
            disabled={disabled}
          />
          <Input
            label="Género"
            value={payload.identification.gender ?? ""}
            onChange={(e) => update("identification", { ...payload.identification, gender: e.target.value })}
            disabled={disabled}
          />
          <Input
            label="Estado civil"
            value={payload.identification.maritalStatus ?? ""}
            onChange={(e) => update("identification", { ...payload.identification, maritalStatus: e.target.value })}
            disabled={disabled}
          />
          <Input
            label="Ocupación"
            value={payload.identification.occupation ?? ""}
            onChange={(e) => update("identification", { ...payload.identification, occupation: e.target.value })}
            disabled={disabled}
          />
          <Input
            label="Domicilio"
            value={payload.identification.address ?? ""}
            onChange={(e) => update("identification", { ...payload.identification, address: e.target.value })}
            disabled={disabled}
          />
          <Input
            label="Grupo sanguíneo"
            value={payload.identification.bloodType ?? ""}
            onChange={(e) => update("identification", { ...payload.identification, bloodType: e.target.value })}
            disabled={disabled}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Antecedentes heredofamiliares</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            ["diabetes", "Diabetes"],
            ["hipertension", "Hipertensión"],
            ["cardiopatia", "Cardiopatía"],
            ["cancer", "Cáncer"],
            ["obesidad", "Obesidad"],
            ["dislipidemia", "Dislipidemia"],
            ["enf_renal", "Enfermedad renal"],
            ["enf_tiroidea", "Enfermedad tiroidea"],
            ["otros", "Otros"],
          ].map(([k, label]) => {
            const val = String((payload.familyHistory as Record<string, unknown>)[k] ?? "");
            return (
              <Input
                key={k}
                label={label}
                placeholder="Ej. padre, madre, hermano"
                value={val}
                onChange={(e) => {
                  const next = { ...(payload.familyHistory as Record<string, unknown>) };
                  if (e.target.value) next[k] = e.target.value;
                  else delete next[k];
                  update("familyHistory", next);
                }}
                disabled={disabled}
              />
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Antecedentes personales no patológicos</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            ["tabaquismo", "Tabaquismo"],
            ["alcohol", "Alcohol"],
            ["toxicomanias", "Toxicomanías"],
            ["actividad_fisica", "Actividad física"],
            ["alimentacion", "Alimentación"],
            ["vivienda", "Vivienda / servicios"],
            ["ocupacion_riesgos", "Riesgos ocupacionales"],
            ["inmunizaciones", "Inmunizaciones"],
          ].map(([k, label]) => {
            const val = String((payload.nonPathologicalHistory as Record<string, unknown>)[k] ?? "");
            return (
              <Input
                key={k}
                label={label}
                value={val}
                onChange={(e) => {
                  const next = { ...(payload.nonPathologicalHistory as Record<string, unknown>) };
                  if (e.target.value) next[k] = e.target.value;
                  else delete next[k];
                  update("nonPathologicalHistory", next);
                }}
                disabled={disabled}
              />
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Antecedentes personales patológicos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            ["chronicConditions", "Enfermedades crónicas"],
            ["surgeries", "Cirugías"],
            ["hospitalizations", "Hospitalizaciones"],
            ["transfusions", "Transfusiones"],
            ["traumas", "Traumatismos"],
            ["infectious", "Infecciosas relevantes"],
          ].map(([k, label]) => {
            const val = String((payload.pathologicalHistory as Record<string, unknown>)[k] ?? "");
            return (
              <TextArea
                key={k}
                label={label}
                rows={2}
                value={val}
                onChange={(e) => {
                  const next = { ...(payload.pathologicalHistory as Record<string, unknown>) };
                  if (e.target.value) next[k] = e.target.value;
                  else delete next[k];
                  update("pathologicalHistory", next);
                }}
                disabled={disabled}
              />
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Antecedentes ginecoobstétricos</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ["menarca", "Menarca"],
            ["fum", "FUM"],
            ["ciclo", "Ciclo"],
            ["mpf", "Método planificación"],
            ["gestas", "Gestas"],
            ["partos", "Partos"],
            ["cesareas", "Cesáreas"],
            ["abortos", "Abortos"],
            ["papanicolau", "Último Papanicolau"],
            ["mastografia", "Última mastografía"],
          ].map(([k, label]) => {
            const src = (payload.gynecoObstetricHistory ?? {}) as Record<string, unknown>;
            return (
              <Input
                key={k}
                label={label}
                value={String(src[k] ?? "")}
                onChange={(e) => {
                  const next = { ...src };
                  if (e.target.value) next[k] = e.target.value;
                  else delete next[k];
                  update("gynecoObstetricHistory", next);
                }}
                disabled={disabled}
              />
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Antecedentes andrológicos</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            ["urologicos", "Antecedentes urológicos"],
            ["vasectomia", "Vasectomía"],
            ["disfuncion", "Disfunción"],
            ["psa", "PSA (último valor)"],
          ].map(([k, label]) => {
            const src = (payload.andrologicHistory ?? {}) as Record<string, unknown>;
            return (
              <Input
                key={k}
                label={label}
                value={String(src[k] ?? "")}
                onChange={(e) => {
                  const next = { ...src };
                  if (e.target.value) next[k] = e.target.value;
                  else delete next[k];
                  update("andrologicHistory", next);
                }}
                disabled={disabled}
              />
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alergias y medicamentos crónicos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <TextArea
            label="Alergias (una por línea)"
            rows={4}
            value={itemsToLines(payload.allergies)}
            onChange={(e) => update("allergies", linesToItems(e.target.value))}
            disabled={disabled}
          />
          <TextArea
            label="Medicamentos crónicos actuales (uno por línea)"
            rows={4}
            value={itemsToLines(payload.currentMedications)}
            onChange={(e) =>
              update("currentMedications", linesToItems(e.target.value))
            }
            disabled={disabled}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alertas clínicas</CardTitle>
        </CardHeader>
        <CardContent>
          <TextArea
            label="Una por línea (anticoagulantes, embarazo, etc.)"
            rows={4}
            value={itemsToLines(payload.alerts)}
            onChange={(e) => update("alerts", linesToItems(e.target.value))}
            disabled={disabled}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} loading={saving} disabled={disabled}>
          <Save className="w-4 h-4" /> Guardar historia clínica
        </Button>
      </div>
    </div>
  );
}
