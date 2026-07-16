export type ClinicalProfile = "GENERAL_MEDICINE" | "ODONTOLOGY";

export interface GeneralMedicinePayload {
  riskFactors: string;
  reviewOfSystems: string;
  physicalExam: string;
  labs: string;
  screenings: string;
  preventivePlan: string;
  followUp: string;
}

export const EMPTY_GENERAL_MEDICINE_PAYLOAD: GeneralMedicinePayload = {
  riskFactors: "",
  reviewOfSystems: "",
  physicalExam: "",
  labs: "",
  screenings: "",
  preventivePlan: "",
  followUp: ""
};

export const GENERAL_MEDICINE_FIELDS: Array<{
  key: keyof GeneralMedicinePayload;
  label: string;
  rows: number;
}> = [
  { key: "riskFactors", label: "Factores de riesgo", rows: 2 },
  { key: "reviewOfSystems", label: "Revision por sistemas", rows: 3 },
  { key: "physicalExam", label: "Exploracion fisica", rows: 3 },
  { key: "labs", label: "Laboratorios y estudios", rows: 2 },
  { key: "screenings", label: "Tamizajes", rows: 2 },
  { key: "preventivePlan", label: "Plan preventivo", rows: 2 },
  { key: "followUp", label: "Seguimiento / proxima cita", rows: 2 }
];

export const DENTAL_TOOTH_IDS = [
  "18", "17", "16", "15", "14", "13", "12", "11",
  "21", "22", "23", "24", "25", "26", "27", "28",
  "48", "47", "46", "45", "44", "43", "42", "41",
  "31", "32", "33", "34", "35", "36", "37", "38"
] as const;

export type DentalToothId = (typeof DENTAL_TOOTH_IDS)[number];
export type ToothFace = "M" | "O" | "D" | "V" | "L";
export type ToothStatus =
  | "HEALTHY"
  | "CARIES"
  | "RESTORED"
  | "CROWN"
  | "MISSING"
  | "IMPLANT"
  | "ROOT_CANAL"
  | "FRACTURE"
  | "EXTRACTION_INDICATED";
export type SurfaceCondition = "HEALTHY" | "CARIES" | "RESTORED" | "SEALANT" | "FRACTURE";
// Alias temporal para consumidores que todavía nombran la condición como estado.
export type SurfaceStatus = SurfaceCondition;
export type RestorationMaterial =
  | "RESIN"
  | "AMALGAM"
  | "GLASS_IONOMER"
  | "CERAMIC"
  | "METAL"
  | "TEMPORARY";
export type MouthCondition = "BRUXISM" | "MALOCCLUSION" | "PERIODONTAL_DISEASE" | "TMJ" | "OTHER";
export type MouthConditionSeverity = "MILD" | "MODERATE" | "SEVERE";
export type TreatmentPriority = "URGENT" | "ELECTIVE" | "PREVENTIVE";
export type TreatmentStatus = "PLANNED" | "IN_PROGRESS" | "COMPLETED";

export interface DentalToothRecord {
  status: ToothStatus;
  surfaces: Partial<Record<ToothFace, DentalSurfaceRecord>>;
  notes: string;
}

export interface DentalSurfaceRecord {
  condition: SurfaceCondition;
  material?: RestorationMaterial;
}

export interface PeriodontogramRecord {
  pocketDepth: [number, number, number, number, number, number];
  recession: [number, number, number, number, number, number];
  bleeding: [boolean, boolean, boolean, boolean, boolean, boolean];
  mobility: 0 | 1 | 2 | 3;
  furcation: 0 | 1 | 2 | 3;
}

export interface MouthConditionEntry {
  id: string;
  date: string;
  condition: MouthCondition;
  severity?: MouthConditionSeverity;
  notes?: string;
  resolved: boolean;
}

export interface TreatmentPlanItem {
  id: string;
  toothId: string;
  procedure: string;
  priority: TreatmentPriority;
  status: TreatmentStatus;
  sessionDate: string;
  notes: string;
}

export interface DentalPayload {
  schemaVersion: 2;
  odontogram: Record<string, DentalToothRecord>;
  periodontogram: Record<string, PeriodontogramRecord>;
  /** Indice de placa (O'Leary): caras M/D/V/L con placa por pieza (paso 26). */
  plaque: Record<string, ToothFace[]>;
  mouthConditions: MouthConditionEntry[];
  treatmentPlan: TreatmentPlanItem[];
  hygienePlan: string;
  nextRevision: string;
}

export const EMPTY_DENTAL_PAYLOAD: DentalPayload = {
  schemaVersion: 2,
  odontogram: {},
  periodontogram: {},
  plaque: {},
  mouthConditions: [],
  treatmentPlan: [],
  hygienePlan: "",
  nextRevision: ""
};

export const TOOTH_STATUS_OPTIONS: Array<{ value: ToothStatus; label: string }> = [
  { value: "HEALTHY", label: "Sano" },
  { value: "CARIES", label: "Caries" },
  { value: "RESTORED", label: "Restaurado" },
  { value: "CROWN", label: "Corona" },
  { value: "MISSING", label: "Ausente" },
  { value: "IMPLANT", label: "Implante" },
  { value: "ROOT_CANAL", label: "Endodoncia" },
  { value: "FRACTURE", label: "Fractura" },
  { value: "EXTRACTION_INDICATED", label: "Extraccion indicada" }
];

export const SURFACE_STATUS_OPTIONS: Array<{ value: SurfaceStatus; label: string }> = [
  { value: "HEALTHY", label: "Sano" },
  { value: "CARIES", label: "Caries" },
  { value: "RESTORED", label: "Restaurado" },
  { value: "SEALANT", label: "Sellador" },
  { value: "FRACTURE", label: "Fractura" }
];

export const RESTORATION_MATERIAL_OPTIONS: Array<{
  value: RestorationMaterial;
  label: string;
}> = [
  { value: "RESIN", label: "Resina" },
  { value: "AMALGAM", label: "Amalgama" },
  { value: "GLASS_IONOMER", label: "Ionomero de vidrio" },
  { value: "CERAMIC", label: "Ceramica" },
  { value: "METAL", label: "Metal" },
  { value: "TEMPORARY", label: "Provisional" }
];

export const MOUTH_CONDITION_OPTIONS: Array<{ value: MouthCondition; label: string }> = [
  { value: "BRUXISM", label: "Bruxismo" },
  { value: "MALOCCLUSION", label: "Maloclusion" },
  { value: "PERIODONTAL_DISEASE", label: "Enfermedad periodontal" },
  { value: "TMJ", label: "ATM / disfuncion temporomandibular" },
  { value: "OTHER", label: "Otro" }
];

export const TREATMENT_PRIORITY_OPTIONS: Array<{ value: TreatmentPriority; label: string }> = [
  { value: "URGENT", label: "Urgente" },
  { value: "ELECTIVE", label: "Electivo" },
  { value: "PREVENTIVE", label: "Preventivo" }
];

export const TREATMENT_STATUS_OPTIONS: Array<{ value: TreatmentStatus; label: string }> = [
  { value: "PLANNED", label: "Planeado" },
  { value: "IN_PROGRESS", label: "En progreso" },
  { value: "COMPLETED", label: "Completado" }
];

export const TOOTH_FACES: ToothFace[] = ["M", "O", "D", "V", "L"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toTupleNumbers(value: unknown): [number, number, number, number, number, number] {
  const source = Array.isArray(value) ? value : [];
  return [
    Number(source[0] ?? 0),
    Number(source[1] ?? 0),
    Number(source[2] ?? 0),
    Number(source[3] ?? 0),
    Number(source[4] ?? 0),
    Number(source[5] ?? 0)
  ];
}

function toTupleBooleans(value: unknown): [boolean, boolean, boolean, boolean, boolean, boolean] {
  const source = Array.isArray(value) ? value : [];
  return [
    Boolean(source[0]),
    Boolean(source[1]),
    Boolean(source[2]),
    Boolean(source[3]),
    Boolean(source[4]),
    Boolean(source[5])
  ];
}

function normalizeToothStatus(value: unknown): ToothStatus {
  return TOOTH_STATUS_OPTIONS.some((option) => option.value === value)
    ? (value as ToothStatus)
    : "HEALTHY";
}

function normalizeRestorationMaterial(value: unknown): RestorationMaterial | undefined {
  return RESTORATION_MATERIAL_OPTIONS.some((option) => option.value === value)
    ? (value as RestorationMaterial)
    : undefined;
}

function normalizeSurfaceRecord(value: unknown): DentalSurfaceRecord | undefined {
  const source = isRecord(value) ? value : null;
  const rawCondition = source?.condition ?? value;
  const condition = SURFACE_STATUS_OPTIONS.find((option) => option.value === rawCondition)?.value;
  if (!condition || condition === "HEALTHY") {
    return undefined;
  }
  const material = condition === "RESTORED"
    ? normalizeRestorationMaterial(source?.material)
    : undefined;
  return material ? { condition, material } : { condition };
}

export function coerceClinicalProfile(value: unknown): ClinicalProfile {
  return value === "ODONTOLOGY" ? "ODONTOLOGY" : "GENERAL_MEDICINE";
}

export function coerceGeneralMedicinePayload(value: unknown): GeneralMedicinePayload {
  const source = isRecord(value) ? value : {};
  return {
    riskFactors: String(source.riskFactors ?? ""),
    reviewOfSystems: String(source.reviewOfSystems ?? ""),
    physicalExam: String(source.physicalExam ?? ""),
    labs: String(source.labs ?? ""),
    screenings: String(source.screenings ?? ""),
    preventivePlan: String(source.preventivePlan ?? ""),
    followUp: String(source.followUp ?? "")
  };
}

export function coerceDentalPayload(value: unknown): DentalPayload {
  const source = isRecord(value) ? value : {};
  const odontogramSource = isRecord(source.odontogram) ? source.odontogram : {};
  const periodontogramSource = isRecord(source.periodontogram) ? source.periodontogram : {};
  // Retrocompatible: payloads previos a la seccion de placa validan igual.
  const plaqueSource = isRecord(source.plaque) ? source.plaque : {};
  const mouthConditionsSource = Array.isArray(source.mouthConditions) ? source.mouthConditions : [];
  const treatmentPlanSource = Array.isArray(source.treatmentPlan) ? source.treatmentPlan : [];

  const odontogram = Object.fromEntries(
    Object.entries(odontogramSource).map(([toothId, record]) => {
      const toothRecord = isRecord(record) ? record : {};
      const surfacesSource = isRecord(toothRecord.surfaces) ? toothRecord.surfaces : {};
      return [
        toothId,
        {
          status: normalizeToothStatus(toothRecord.status),
          surfaces: Object.fromEntries(
            TOOTH_FACES.map((face) => [face, normalizeSurfaceRecord(surfacesSource[face])]).filter(
              ([, surface]) => surface !== undefined
            )
          ) as Partial<Record<ToothFace, DentalSurfaceRecord>>,
          notes: String(toothRecord.notes ?? "")
        } satisfies DentalToothRecord
      ];
    })
  );

  const periodontogram = Object.fromEntries(
    Object.entries(periodontogramSource).map(([toothId, record]) => {
      const periodontalRecord = isRecord(record) ? record : {};
      return [
        toothId,
        {
          pocketDepth: toTupleNumbers(periodontalRecord.pocketDepth),
          recession: toTupleNumbers(periodontalRecord.recession),
          bleeding: toTupleBooleans(periodontalRecord.bleeding),
          mobility: Number(periodontalRecord.mobility ?? 0) as 0 | 1 | 2 | 3,
          furcation: Number(periodontalRecord.furcation ?? 0) as 0 | 1 | 2 | 3
        } satisfies PeriodontogramRecord
      ];
    })
  );

  // El O'Leary clasico registra placa en 4 caras (M, D, V, L); la oclusal no
  // participa. Se filtra cualquier otra cosa y se deduplica.
  const plaque = Object.fromEntries(
    Object.entries(plaqueSource)
      .map(([toothId, faces]) => {
        const list = Array.isArray(faces) ? faces : [];
        const valid = [
          ...new Set(
            list.filter(
              (face): face is ToothFace =>
                face === "M" || face === "D" || face === "V" || face === "L"
            )
          )
        ];
        return [toothId, valid] as const;
      })
      .filter(([, faces]) => faces.length > 0)
  );

  return {
    schemaVersion: 2,
    odontogram,
    periodontogram,
    plaque,
    mouthConditions: mouthConditionsSource.map((entry, index) => {
      const item = isRecord(entry) ? entry : {};
      return {
        id: String(item.id ?? `condition-${index + 1}`),
        date: String(item.date ?? ""),
        condition:
          MOUTH_CONDITION_OPTIONS.find((option) => option.value === item.condition)?.value ?? "OTHER",
        severity:
          item.severity === "MILD" || item.severity === "MODERATE" || item.severity === "SEVERE"
            ? item.severity
            : undefined,
        notes: item.notes ? String(item.notes) : undefined,
        resolved: Boolean(item.resolved)
      };
    }),
    treatmentPlan: treatmentPlanSource.map((entry, index) => {
      const item = isRecord(entry) ? entry : {};
      return {
        id: String(item.id ?? `plan-${index + 1}`),
        toothId: String(item.toothId ?? "GENERAL"),
        procedure: String(item.procedure ?? ""),
        priority:
          TREATMENT_PRIORITY_OPTIONS.find((option) => option.value === item.priority)?.value ??
          "ELECTIVE",
        status:
          TREATMENT_STATUS_OPTIONS.find((option) => option.value === item.status)?.value ?? "PLANNED",
        sessionDate: String(item.sessionDate ?? ""),
        notes: String(item.notes ?? "")
      };
    }),
    hygienePlan: String(source.hygienePlan ?? ""),
    nextRevision: String(source.nextRevision ?? "")
  };
}

export function createEmptyMouthCondition(today: string): MouthConditionEntry {
  return {
    id: `condition-${Math.random().toString(36).slice(2, 10)}`,
    date: today,
    condition: "BRUXISM",
    resolved: false
  };
}

export function createEmptyTreatmentPlanItem(): TreatmentPlanItem {
  return {
    id: `plan-${Math.random().toString(36).slice(2, 10)}`,
    toothId: "GENERAL",
    procedure: "",
    priority: "ELECTIVE",
    status: "PLANNED",
    sessionDate: "",
    notes: ""
  };
}

export function getDefaultPeriodontogramRecord(): PeriodontogramRecord {
  return {
    pocketDepth: [0, 0, 0, 0, 0, 0],
    recession: [0, 0, 0, 0, 0, 0],
    bleeding: [false, false, false, false, false, false],
    mobility: 0,
    furcation: 0
  };
}

export function getDefaultDentalToothRecord(): DentalToothRecord {
  return {
    status: "HEALTHY",
    surfaces: {},
    notes: ""
  };
}
