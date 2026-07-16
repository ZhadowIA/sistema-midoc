import type { SegmentDraft, TemplateSegment } from "./consultationScribe";
import type { MedicalHistoryProposal } from "./medicalHistoryAi";

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
  medical_history_updates: MedicalHistoryProposal[];
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

/** Segmento generado por la IA junto con la etiqueta legible de su plantilla. */
export interface LabeledAidSegment {
  segment: SegmentDraft;
  label: string;
}

export interface AidSegmentGroups {
  /** Segmentos que llenan campos de la nota (SOAP o plantilla personalizada). */
  template: LabeledAidSegment[];
  /** Segmentos que llenan la plantilla propia de la especialidad (`specialty.*`). */
  specialty: LabeledAidSegment[];
}

/**
 * Separa los segmentos generados entre la plantilla de nota y la plantilla de
 * especialidad usando el target de la definicion activa. Un segmento sin
 * definicion conocida se muestra en el grupo de plantilla con su id como
 * etiqueta, para que nunca desaparezca una propuesta de la vista.
 */
export function splitAidSegments(
  segments: SegmentDraft[],
  template: TemplateSegment[]
): AidSegmentGroups {
  const definitions = new Map(template.map((item) => [item.id, item]));
  const groups: AidSegmentGroups = { template: [], specialty: [] };
  for (const segment of segments) {
    const definition = definitions.get(segment.segment_id);
    const labeled = { segment, label: definition?.label ?? segment.segment_id };
    if (definition?.target.startsWith("specialty.")) {
      groups.specialty.push(labeled);
    } else {
      groups.template.push(labeled);
    }
  }
  return groups;
}

export function compatibilityLabel(level: CompatibilityLevel): string {
  return level === "HIGH" ? "Alta" : level === "MEDIUM" ? "Media" : "Baja";
}

/** Modelo de texto disponible como alternativa (espejo de `TextModelOption` en Rust). */
export interface TextModelOption {
  /** Id estable y único entre proveedores: `gemini:<modelo>` / `openai:<modelo>`. */
  id: string;
  /** Proveedor que sirve el modelo: "gemini-direct" | "openai-direct". */
  provider: string;
  model: string;
  label: string;
  is_default: boolean;
}

/** Sobrecarga transitoria del proveedor de IA, reportada estructurada por el backend. */
export interface AiOverloadInfo {
  provider: string;
  model: string;
  message: string;
}

/**
 * Detecta la sobrecarga del proveedor en un error de IPC. El backend la envía
 * como JSON con `code: "ai_overloaded"`; cualquier otro error devuelve null y
 * se muestra como mensaje plano.
 */
export function parseAiOverload(cause: unknown): AiOverloadInfo | null {
  const text =
    typeof cause === "string"
      ? cause
      : cause instanceof Error
        ? cause.message
        : String(cause);
  if (!text.trim().startsWith("{")) return null;
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (parsed.code !== "ai_overloaded") return null;
    return {
      provider: typeof parsed.provider === "string" ? parsed.provider : "desconocido",
      model: typeof parsed.model === "string" ? parsed.model : "desconocido",
      message:
        typeof parsed.message === "string" && parsed.message.trim()
          ? parsed.message
          : "El proveedor de IA está sobrecargado en este momento."
    };
  } catch {
    return null;
  }
}
