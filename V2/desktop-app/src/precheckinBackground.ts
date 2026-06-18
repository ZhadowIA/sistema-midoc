import { linesForMedicalHistoryGroup } from "./medicalHistoryFormat.ts";

export interface BackgroundDraft {
  allergies: string;
  medical_background: string;
  family_background: string;
}

export interface BackgroundFormState extends BackgroundDraft {
  birth_date: string;
}

export interface BackgroundReviewField {
  key: keyof BackgroundDraft;
  label: string;
  current: string;
  incoming: string;
  hasDifference: boolean;
}

export interface BackgroundReview {
  incoming: BackgroundDraft;
  fields: BackgroundReviewField[];
  hasDiscrepancies: boolean;
  hasImportableChanges: boolean;
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeForComparison(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export function extractPrecheckinBackground(raw: string | null): BackgroundDraft | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (Array.isArray(parsed.conversation)) return null;

    const medicalLines = [
      cleanText(parsed.antecedentes),
      ...linesForMedicalHistoryGroup(raw, "pathological")
    ].filter(Boolean);
    const familyLines = linesForMedicalHistoryGroup(raw, "familyHistory");

    const draft: BackgroundDraft = {
      allergies: cleanText(parsed.allergies),
      medical_background: medicalLines.join("\n"),
      family_background: familyLines.join("\n")
    };

    return draft.allergies || draft.medical_background || draft.family_background ? draft : null;
  } catch {
    return null;
  }
}

export function buildBackgroundReview(
  current: BackgroundFormState,
  precheckin: string | null
): BackgroundReview | null {
  const incoming = extractPrecheckinBackground(precheckin);
  if (!incoming) return null;

  const labels: Record<keyof BackgroundDraft, string> = {
    allergies: "Alergias",
    medical_background: "Antecedentes personales",
    family_background: "Antecedentes familiares"
  };

  const keys: Array<keyof BackgroundDraft> = [
    "allergies",
    "medical_background",
    "family_background"
  ];
  const fields = keys
    .map((key) => {
      const currentValue = current[key] ?? "";
      const incomingValue = incoming[key] ?? "";
      return {
        key,
        label: labels[key],
        current: currentValue,
        incoming: incomingValue,
        hasDifference:
          Boolean(incomingValue) &&
          normalizeForComparison(currentValue) !== normalizeForComparison(incomingValue)
      };
    })
    .filter((field) => field.current || field.incoming);

  const hasDiscrepancies = fields.some(
    (field) => Boolean(field.current) && Boolean(field.incoming) && field.hasDifference
  );
  const hasImportableChanges = fields.some((field) => field.hasDifference);

  return { incoming, fields, hasDiscrepancies, hasImportableChanges };
}
