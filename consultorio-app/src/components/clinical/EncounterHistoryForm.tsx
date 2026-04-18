"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/Card";
import { Button } from "@/components/Button";
import { Save } from "lucide-react";
import type { EncounterHistoryPayload } from "@/lib/encounterHistorySchema";
import { CompletionMeter } from "./CompletionMeter";
import {
  ChiefComplaintSection,
  PresentIllnessSection,
  PertinentNegativesSection,
  ReviewOfSystemsSection,
  VitalsSection,
  PhysicalExamSection,
  AssessmentSection,
  DiagnosticPlanSection,
  TreatmentPlanSection,
  FollowUpSection,
  ENCOUNTER_SECTION_TITLES,
  type SectionProps,
} from "./EncounterSections";

type Props = {
  initial: EncounterHistoryPayload;
  completionPct: number;
  onSave: (payload: EncounterHistoryPayload) => Promise<void>;
  disabled?: boolean;
};

const SECTIONS: Array<{
  key: keyof typeof ENCOUNTER_SECTION_TITLES;
  Component: (p: SectionProps) => React.ReactElement;
}> = [
  { key: "chiefComplaint", Component: ChiefComplaintSection },
  { key: "presentIllness", Component: PresentIllnessSection },
  { key: "pertinentNegatives", Component: PertinentNegativesSection },
  { key: "reviewOfSystems", Component: ReviewOfSystemsSection },
  { key: "vitals", Component: VitalsSection },
  { key: "physicalExam", Component: PhysicalExamSection },
  { key: "assessment", Component: AssessmentSection },
  { key: "diagnosticPlan", Component: DiagnosticPlanSection },
  { key: "treatmentPlan", Component: TreatmentPlanSection },
  { key: "followUp", Component: FollowUpSection },
];

export function EncounterHistoryForm({ initial, completionPct, onSave, disabled }: Props) {
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

      {SECTIONS.map(({ key, Component }) => (
        <Card key={key}>
          <CardHeader>
            <CardTitle>{ENCOUNTER_SECTION_TITLES[key]}</CardTitle>
          </CardHeader>
          <CardContent>
            <Component payload={payload} update={update} disabled={disabled} />
          </CardContent>
        </Card>
      ))}

      <div className="flex justify-end">
        <Button onClick={handleSave} loading={saving} disabled={disabled}>
          <Save className="w-4 h-4" /> Guardar encuentro
        </Button>
      </div>
    </div>
  );
}
