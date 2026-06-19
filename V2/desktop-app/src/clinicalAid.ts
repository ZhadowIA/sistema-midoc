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
  studies: Array<{ name: string; reason: string; priority: "ROUTINE" | "SOON" | "URGENT" }>;
  treatments: Array<{ name: string; reason: string; precautions: string[] }>;
  warnings: string[];
}

export function compatibilityLabel(level: CompatibilityLevel): string {
  return level === "HIGH" ? "Alta" : level === "MEDIUM" ? "Media" : "Baja";
}
