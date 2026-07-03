import type { SegmentDraft } from "./consultationScribe";

export type CompatibilityLevel = "HIGH" | "MEDIUM" | "LOW";

export interface ClinicalAidSoap {
  subjective: string;
  objective: string;
  assessment: string;
  diagnosis: string;
  plan: string;
  instructions: string;
  specialty: unknown;
}

export interface ClinicalAidDraft {
  run_id: string;
  usage_type: "CLINICAL_AID";
  provider: string;
  model_version: string;
  estimated_cost_cents: number;
  latency_ms: number;
  soap: ClinicalAidSoap;
  template_segments: SegmentDraft[];
  possibilities: Array<{
    title: string;
    compatibility: CompatibilityLevel;
    explanation: string;
    supporting_findings: string[];
    conflicting_findings: string[];
    missing_data: string[];
  }>;
  exam_suggestions: Array<{ name: string; reason: string }>;
  question_suggestions: Array<{ question: string; reason: string }>;
  studies: Array<{ name: string; reason: string; priority: "ROUTINE" | "SOON" | "URGENT" }>;
  treatments: Array<{ name: string; reason: string; precautions: string[] }>;
  prescription_draft: string;
  background_updates: BackgroundUpdate[];
  warnings: string[];
}

export type BackgroundField = "allergies" | "medical_background" | "family_background";

export interface BackgroundUpdate {
  field: BackgroundField;
  content: string;
}

export function backgroundFieldLabel(field: BackgroundField): string {
  return field === "allergies"
    ? "Alergias"
    : field === "medical_background"
      ? "Antecedentes médicos"
      : "Antecedentes familiares";
}

export function compatibilityLabel(level: CompatibilityLevel): string {
  return level === "HIGH" ? "Alta" : level === "MEDIUM" ? "Media" : "Baja";
}
