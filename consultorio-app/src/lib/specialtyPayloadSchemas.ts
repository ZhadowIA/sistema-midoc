import { z } from 'zod'

// ─── Shared ───────────────────────────────────────────────────────────────────

// FDI tooth notation: upper 11-18, 21-28 / lower 31-38, 41-48
// Deciduous: 51-55, 61-65, 71-75, 81-85
export const PERMANENT_TEETH = [
  '18','17','16','15','14','13','12','11',
  '21','22','23','24','25','26','27','28',
  '48','47','46','45','44','43','42','41',
  '31','32','33','34','35','36','37','38',
] as const

export const DECIDUOUS_TEETH = [
  '55','54','53','52','51',
  '61','62','63','64','65',
  '85','84','83','82','81',
  '71','72','73','74','75',
] as const

export type ToothId = typeof PERMANENT_TEETH[number] | typeof DECIDUOUS_TEETH[number]

// ─── Dental status enums ──────────────────────────────────────────────────────

export const TOOTH_STATUS = [
  'HEALTHY',
  'CARIES',
  'RESTORED',
  'CROWN',
  'BRIDGE_ABUTMENT',
  'MISSING',
  'IMPLANT',
  'ROOT_CANAL',
  'FRACTURE',
  'EXTRACTION_INDICATED',
  'IMPACTED',
  'SUPERNUMERARY',
] as const

export type ToothStatus = typeof TOOTH_STATUS[number]

export const TOOTH_STATUS_LABEL: Record<ToothStatus, string> = {
  HEALTHY:              'Sano',
  CARIES:               'Caries',
  RESTORED:             'Restaurado',
  CROWN:                'Corona',
  BRIDGE_ABUTMENT:      'Puente (pilar)',
  MISSING:              'Ausente',
  IMPLANT:              'Implante',
  ROOT_CANAL:           'Endodoncia',
  FRACTURE:             'Fractura',
  EXTRACTION_INDICATED: 'Extracción indicada',
  IMPACTED:             'Retenido/Impactado',
  SUPERNUMERARY:        'Supernumerario',
}

export const TOOTH_STATUS_COLOR: Record<ToothStatus, string> = {
  HEALTHY:              '#22c55e',   // green
  CARIES:               '#ef4444',   // red
  RESTORED:             '#3b82f6',   // blue
  CROWN:                '#a855f7',   // purple
  BRIDGE_ABUTMENT:      '#8b5cf6',   // violet
  MISSING:              '#6b7280',   // gray
  IMPLANT:              '#06b6d4',   // cyan
  ROOT_CANAL:           '#f97316',   // orange
  FRACTURE:             '#dc2626',   // dark red
  EXTRACTION_INDICATED: '#f59e0b',   // amber
  IMPACTED:             '#78716c',   // stone
  SUPERNUMERARY:        '#ec4899',   // pink
}

export const SURFACE_STATUS = ['HEALTHY', 'CARIES', 'RESTORED', 'SEALANT', 'FRACTURE'] as const
export type SurfaceStatus = typeof SURFACE_STATUS[number]

// ─── Piece-level findings (whole tooth) ──────────────────────────────────────

export const PIECE_FINDING = [
  'ABSCESS', 'ANKYLOSIS', 'ABSENCE', 'CROWN', 'RETAINED',
  'FRACTURE', 'ROOT_CANAL', 'BRIDGE', 'IMPLANT', 'EXTRACTION_INDICATED',
  'SUPERNUMERARY', 'OTHER',
] as const
export type PieceFinding = typeof PIECE_FINDING[number]

export const PIECE_FINDING_LABEL: Record<PieceFinding, string> = {
  ABSCESS:              'Absceso',
  ANKYLOSIS:            'Anquilosis',
  ABSENCE:              'Ausencia',
  CROWN:                'Corona presente',
  RETAINED:             'Diente retenido',
  FRACTURE:             'Fractura',
  ROOT_CANAL:           'Tratamiento de conducto',
  BRIDGE:               'Puente (pilar)',
  IMPLANT:              'Implante',
  EXTRACTION_INDICATED: 'Extracción indicada',
  SUPERNUMERARY:        'Supernumerario',
  OTHER:                'Otro',
}

export const PIECE_FINDING_COLOR: Record<PieceFinding, string> = {
  ABSCESS:              '#ef4444',
  ANKYLOSIS:            '#78716c',
  ABSENCE:              '#6b7280',
  CROWN:                '#a855f7',
  RETAINED:             '#8b5cf6',
  FRACTURE:             '#dc2626',
  ROOT_CANAL:           '#f97316',
  BRIDGE:               '#7c3aed',
  IMPLANT:              '#0891b2',
  EXTRACTION_INDICATED: '#d97706',
  SUPERNUMERARY:        '#ec4899',
  OTHER:                '#64748b',
}

// ─── Face-level findings (per surface) ───────────────────────────────────────

export const FACE_FINDING = [
  'CARIES', 'AMALGAM', 'FLUOROSIS', 'RESIN', 'SEALANT',
] as const
export type FaceFinding = typeof FACE_FINDING[number]

export const FACE_FINDING_LABEL: Record<FaceFinding, string> = {
  CARIES:   'Caries',
  AMALGAM:  'Amalgama presente',
  FLUOROSIS:'Fluorosis',
  RESIN:    'Resina presente',
  SEALANT:  'Sellador',
}

export const FACE_FINDING_COLOR: Record<FaceFinding, string> = {
  CARIES:   '#ef4444',
  AMALGAM:  '#374151',
  FLUOROSIS:'#f59e0b',
  RESIN:    '#3b82f6',
  SEALANT:  '#10b981',
}

// ─── Tooth face notation ──────────────────────────────────────────────────────

export const TOOTH_FACE = ['V', 'L', 'M', 'D', 'O'] as const
export type ToothFace = typeof TOOTH_FACE[number]

export const TOOTH_FACE_LABEL: Record<ToothFace, string> = {
  V: 'Vestibular',
  L: 'Lingual/Palatino',
  M: 'Mesial',
  D: 'Distal',
  O: 'Oclusal/Incisal',
}

// ─── Finding entry (with history) ────────────────────────────────────────────

const PieceFindingEntrySchema = z.object({
  id:       z.string(),
  date:     z.string(), // ISO date
  level:    z.literal('PIECE'),
  finding:  z.enum(PIECE_FINDING),
  notes:    z.string().optional(),
})

const FaceFindingEntrySchema = z.object({
  id:       z.string(),
  date:     z.string(),
  level:    z.literal('FACE'),
  finding:  z.enum(FACE_FINDING),
  face:     z.enum(TOOTH_FACE),
  notes:    z.string().optional(),
})

export const FindingEntrySchema = z.discriminatedUnion('level', [
  PieceFindingEntrySchema,
  FaceFindingEntrySchema,
])

export type FindingEntry = z.infer<typeof FindingEntrySchema>

// ─── Mouth-wide conditions ────────────────────────────────────────────────────

export const MOUTH_CONDITION = [
  'MALOCCLUSION', 'PERIODONTAL_DISEASE', 'BRUXISM',
  'DRY_MOUTH', 'STOMATITIS', 'TMJ', 'OTHER',
] as const
export type MouthCondition = typeof MOUTH_CONDITION[number]

export const MOUTH_CONDITION_LABEL: Record<MouthCondition, string> = {
  MALOCCLUSION:        'Malposición dental / Maloclusión',
  PERIODONTAL_DISEASE: 'Enfermedad periodontal',
  BRUXISM:             'Bruxismo',
  DRY_MOUTH:           'Boca seca (Xerostomía)',
  STOMATITIS:          'Estomatitis',
  TMJ:                 'Disfunción temporo-mandibular',
  OTHER:               'Otro',
}

const MouthConditionEntrySchema = z.object({
  id:        z.string(),
  date:      z.string(),
  condition: z.enum(MOUTH_CONDITION),
  severity:  z.enum(['MILD', 'MODERATE', 'SEVERE']).optional(),
  notes:     z.string().optional(),
  resolved:  z.boolean().default(false),
})

export type MouthConditionEntry = z.infer<typeof MouthConditionEntrySchema>

export const MOUTH_CONDITION_SEVERITY_LABEL: Record<'MILD' | 'MODERATE' | 'SEVERE', string> = {
  MILD:     'Leve',
  MODERATE: 'Moderado',
  SEVERE:   'Severo',
}

export const TREATMENT_PRIORITY = ['URGENT', 'ELECTIVE', 'PREVENTIVE'] as const
export type TreatmentPriority = typeof TREATMENT_PRIORITY[number]

export const TREATMENT_PRIORITY_LABEL: Record<TreatmentPriority, string> = {
  URGENT:    'Urgente',
  ELECTIVE:  'Electivo',
  PREVENTIVE:'Preventivo',
}

export const TREATMENT_STATUS = ['PLANNED', 'IN_PROGRESS', 'COMPLETED'] as const
export type TreatmentStatus = typeof TREATMENT_STATUS[number]

export const TREATMENT_STATUS_LABEL: Record<TreatmentStatus, string> = {
  PLANNED:     'Planeado',
  IN_PROGRESS: 'En progreso',
  COMPLETED:   'Completado',
}

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const ToothSurfacesSchema = z.object({
  M: z.enum(SURFACE_STATUS).optional(),
  O: z.enum(SURFACE_STATUS).optional(),
  D: z.enum(SURFACE_STATUS).optional(),
  V: z.enum(SURFACE_STATUS).optional(),
  L: z.enum(SURFACE_STATUS).optional(),
})

const ToothRecordSchema = z.object({
  status:   z.enum(TOOTH_STATUS).default('HEALTHY'),
  surfaces: ToothSurfacesSchema.optional(),
  findings: z.array(FindingEntrySchema).default([]),
  notes:    z.string().optional(),
})

// 6-point array per tooth: [MB, B, DB, ML, L, DL]
const SixPoints = z.tuple([
  z.number(), z.number(), z.number(),
  z.number(), z.number(), z.number(),
])

const SixBooleans = z.tuple([
  z.boolean(), z.boolean(), z.boolean(),
  z.boolean(), z.boolean(), z.boolean(),
])

const PeriodontogramRecordSchema = z.object({
  pocketDepth: SixPoints.optional(),
  recession:   SixPoints.optional(),
  bleeding:    SixBooleans.optional(),
  mobility:    z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional(),
  furcation:   z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional(),
})

const TreatmentItemSchema = z.object({
  id:          z.string(),
  toothId:     z.string(),            // FDI id or 'GENERAL'
  procedure:   z.string().min(1),
  priority:    z.enum(TREATMENT_PRIORITY).default('ELECTIVE'),
  status:      z.enum(TREATMENT_STATUS).default('PLANNED'),
  sessionDate: z.string().optional(), // ISO date
  notes:       z.string().optional(),
})

export const DentalSpecialtyPayloadSchema = z.object({
  odontogram:     z.record(z.string(), ToothRecordSchema).default({}),
  periodontogram: z.record(z.string(), PeriodontogramRecordSchema).default({}),
  mouthConditions:z.array(MouthConditionEntrySchema).default([]),
  treatmentPlan:  z.array(TreatmentItemSchema).default([]),
  hygienePlan:    z.string().optional(),
  nextRevision:   z.string().optional(), // ISO date
})

export type ToothRecord          = z.infer<typeof ToothRecordSchema>
export type PeriodontogramRecord = z.infer<typeof PeriodontogramRecordSchema>
export type TreatmentItem        = z.infer<typeof TreatmentItemSchema>
export type DentalSpecialtyPayload = z.infer<typeof DentalSpecialtyPayloadSchema>

export const EMPTY_DENTAL_PAYLOAD: DentalSpecialtyPayload = {
  odontogram:     {},
  periodontogram: {},
  mouthConditions:[],
  treatmentPlan:  [],
  hygienePlan:    undefined,
  nextRevision:   undefined,
}

// ─── Family Medicine ──────────────────────────────────────────────────────────

export const FamilyMedicinePayloadSchema = z.object({
  riskFactors: z.object({
    smoking:        z.enum(['NEVER','FORMER','CURRENT']).optional(),
    smokingPackYear:z.number().optional(),
    alcohol:        z.enum(['NONE','OCCASIONAL','MODERATE','HEAVY']).optional(),
    sedentary:      z.boolean().optional(),
    obesity:        z.boolean().optional(),
    diabetes:       z.boolean().optional(),
    hypertension:   z.boolean().optional(),
    dyslipidemia:   z.boolean().optional(),
    familyHeartDisease: z.boolean().optional(),
    notes:          z.string().optional(),
  }).default({}),
  preventiveChecklist: z.record(z.string(), z.object({
    done:   z.boolean().default(false),
    date:   z.string().optional(),
    result: z.string().optional(),
  })).default({}),
  systemsReview: z.record(z.string(), z.string()).default({}),
})

export type FamilyMedicinePayload = z.infer<typeof FamilyMedicinePayloadSchema>
export const EMPTY_FAMILY_MEDICINE_PAYLOAD: FamilyMedicinePayload = {
  riskFactors: {},
  preventiveChecklist: {},
  systemsReview: {},
}

// ─── Pediatrics ───────────────────────────────────────────────────────────────

export const GrowthPointSchema = z.object({
  date:        z.string(),
  ageMonths:   z.number(),
  weightKg:    z.number().optional(),
  heightCm:    z.number().optional(),
  headCircCm:  z.number().optional(),
  weightPct:   z.number().optional(),
  heightPct:   z.number().optional(),
  bmiPct:      z.number().optional(),
})

export const VaccineRecordSchema = z.object({
  given:  z.boolean().default(false),
  date:   z.string().optional(),
  batch:  z.string().optional(),
  notes:  z.string().optional(),
})

export const PediatricsPayloadSchema = z.object({
  growthCurve:    z.array(GrowthPointSchema).default([]),
  vaccineRecord:  z.record(z.string(), VaccineRecordSchema).default({}),
  developmentMilestones: z.record(z.string(), z.object({
    achieved: z.boolean().default(false),
    ageMonths: z.number().optional(),
    notes: z.string().optional(),
  })).default({}),
  pediatricAlerts: z.array(z.object({
    id:       z.string(),
    category: z.string(),
    text:     z.string(),
    severity: z.enum(['INFO','WARNING','CRITICAL']).default('INFO'),
    resolved: z.boolean().default(false),
  })).default([]),
  feedingType: z.enum(['BREASTFEEDING','FORMULA','MIXED','COMPLEMENTARY','NORMAL']).optional(),
  notes:       z.string().optional(),
})

export type GrowthPoint        = z.infer<typeof GrowthPointSchema>
export type VaccineRecord      = z.infer<typeof VaccineRecordSchema>
export type PediatricsPayload  = z.infer<typeof PediatricsPayloadSchema>
export const EMPTY_PEDIATRICS_PAYLOAD: PediatricsPayload = {
  growthCurve: [], vaccineRecord: {}, developmentMilestones: {},
  pediatricAlerts: [], feedingType: undefined, notes: undefined,
}

// ─── Gynecology / Obstetrics ──────────────────────────────────────────────────

export const PrenatalVisitSchema = z.object({
  id:         z.string(),
  date:       z.string(),
  sdg:        z.number().optional(),
  weight:     z.number().optional(),
  bp:         z.string().optional(),
  fhr:        z.number().optional(),
  fuh:        z.number().optional(),
  presentation:z.string().optional(),
  notes:      z.string().optional(),
})

export const GynecologyPayloadSchema = z.object({
  obstetricFormula: z.object({
    G: z.number().optional(), // gestas
    P: z.number().optional(), // partos
    C: z.number().optional(), // cesáreas
    A: z.number().optional(), // abortos
    V: z.number().optional(), // vivos
  }).default({}),
  lastMenstrualPeriod: z.string().optional(),   // ISO date
  estimatedDueDate:    z.string().optional(),   // ISO date
  gestationalAgeWeeks: z.number().optional(),
  currentPregnancy:    z.boolean().default(false),
  prenatalVisits:      z.array(PrenatalVisitSchema).default([]),
  screeningChecklist:  z.record(z.string(), z.object({
    done:   z.boolean().default(false),
    date:   z.string().optional(),
    result: z.string().optional(),
  })).default({}),
  contraceptionMethod: z.string().optional(),
  notes:               z.string().optional(),
})

export type PrenatalVisit     = z.infer<typeof PrenatalVisitSchema>
export type GynecologyPayload = z.infer<typeof GynecologyPayloadSchema>
export const EMPTY_GYNECOLOGY_PAYLOAD: GynecologyPayload = {
  obstetricFormula: {}, currentPregnancy: false,
  prenatalVisits: [], screeningChecklist: {},
}

// ─── Cardiology ───────────────────────────────────────────────────────────────

export const CardiologyPayloadSchema = z.object({
  cvRiskFactors: z.object({
    age:              z.number().optional(),
    sex:              z.enum(['M','F']).optional(),
    totalCholesterol: z.number().optional(),
    hdl:              z.number().optional(),
    ldl:              z.number().optional(),
    systolicBP:       z.number().optional(),
    onBPMeds:         z.boolean().optional(),
    smoker:           z.boolean().optional(),
    diabetic:         z.boolean().optional(),
    familyHistory:    z.boolean().optional(),
  }).default({}),
  framinghamScore:  z.number().optional(),   // 10-year risk %
  ascvdRisk:        z.number().optional(),   // 10-year %
  nyhaClass:        z.enum(['I','II','III','IV']).optional(),
  ccsClass:         z.enum(['I','II','III','IV']).optional(),
  ecgFindings:      z.string().optional(),
  echoFindings:     z.string().optional(),
  redFlags:         z.record(z.string(), z.boolean()).default({}),
  notes:            z.string().optional(),
})

export type CardiologyPayload = z.infer<typeof CardiologyPayloadSchema>
export const EMPTY_CARDIOLOGY_PAYLOAD: CardiologyPayload = {
  cvRiskFactors: {}, redFlags: {},
}

// ─── Mental Health ────────────────────────────────────────────────────────────

const ScaleResponseSchema = z.object({
  score:    z.number().optional(),
  date:     z.string().optional(),
  answers:  z.array(z.number()).optional(),  // item-level answers
  severity: z.string().optional(),
})

export const MentalHealthPayloadSchema = z.object({
  phq9:  ScaleResponseSchema.default({}),
  gad7:  ScaleResponseSchema.default({}),
  riskAssessment: z.object({
    suicidalIdeation:  z.enum(['NONE','PASSIVE','ACTIVE']).optional(),
    suicidalPlan:      z.boolean().optional(),
    suicidalAttempt:   z.boolean().optional(),
    homicidalIdeation: z.boolean().optional(),
    riskLevel:         z.enum(['NONE','LOW','MODERATE','HIGH','IMMINENT']).optional(),
    notes:             z.string().optional(),
  }).default({}),
  therapeuticPlan: z.object({
    modality:    z.string().optional(),
    frequency:   z.string().optional(),
    goals:       z.array(z.string()).default([]),
    medications: z.string().optional(),
  }).default(() => ({ goals: [] })),
  longitudinalTracking: z.array(z.object({
    date:       z.string(),
    phq9Score:  z.number().optional(),
    gad7Score:  z.number().optional(),
    notes:      z.string().optional(),
  })).default([]),
  notes: z.string().optional(),
})

export type MentalHealthPayload = z.infer<typeof MentalHealthPayloadSchema>
export const EMPTY_MENTAL_HEALTH_PAYLOAD: MentalHealthPayload = {
  phq9: {}, gad7: {}, riskAssessment: {}, therapeuticPlan: { goals: [] },
  longitudinalTracking: [],
}

// ─── Ophthalmology ────────────────────────────────────────────────────────────

const EyeMeasureSchema = z.object({
  sc:    z.string().optional(),   // sin corrección
  cc:    z.string().optional(),   // con corrección
  ph:    z.string().optional(),   // pinhole
})

const RefractionSchema = z.object({
  sphere:   z.number().optional(),
  cylinder: z.number().optional(),
  axis:     z.number().optional(),
  add:      z.number().optional(),
})

export const OphthalmologyPayloadSchema = z.object({
  visualAcuity: z.object({
    od: EyeMeasureSchema.default({}),
    oi: EyeMeasureSchema.default({}),
  }).default(() => ({ od: {}, oi: {} })),
  refraction: z.object({
    od: RefractionSchema.default({}),
    oi: RefractionSchema.default({}),
  }).default(() => ({ od: {}, oi: {} })),
  intraocularPressure: z.object({
    od:     z.number().optional(),
    oi:     z.number().optional(),
    method: z.string().optional(),
    time:   z.string().optional(),
  }).default({}),
  anteriorSegment: z.object({
    od: z.string().optional(),
    oi: z.string().optional(),
  }).default({}),
  posteriorSegment: z.object({
    od: z.string().optional(),
    oi: z.string().optional(),
  }).default({}),
  visualField:  z.string().optional(),
  colorVision:  z.string().optional(),
  notes:        z.string().optional(),
})

export type OphthalmologyPayload = z.infer<typeof OphthalmologyPayloadSchema>
export const EMPTY_OPHTHALMOLOGY_PAYLOAD: OphthalmologyPayload = {
  visualAcuity: { od: {}, oi: {} },
  refraction:   { od: {}, oi: {} },
  intraocularPressure: {},
  anteriorSegment: {}, posteriorSegment: {},
}

// ─── Dermatology ─────────────────────────────────────────────────────────────

export const BODY_REGIONS = [
  'HEAD','NECK','CHEST','ABDOMEN','BACK','LEFT_ARM','RIGHT_ARM',
  'LEFT_HAND','RIGHT_HAND','LEFT_LEG','RIGHT_LEG','LEFT_FOOT','RIGHT_FOOT',
  'GENITALS','BUTTOCKS',
] as const
export type BodyRegion = typeof BODY_REGIONS[number]

export const LESION_MORPHOLOGY = [
  'MACULE','PATCH','PAPULE','PLAQUE','NODULE','TUMOR',
  'VESICLE','BULLA','PUSTULE','WHEAL','SCALE','CRUST',
  'EROSION','ULCER','FISSURE','SCAR','ATROPHY','LICHENIFICATION',
] as const
export type LesionMorphology = typeof LESION_MORPHOLOGY[number]

export const LESION_MORPHOLOGY_LABEL: Record<LesionMorphology, string> = {
  MACULE:'Mácula', PATCH:'Mancha', PAPULE:'Pápula', PLAQUE:'Placa',
  NODULE:'Nódulo', TUMOR:'Tumor', VESICLE:'Vesícula', BULLA:'Bula',
  PUSTULE:'Pústula', WHEAL:'Habón', SCALE:'Escama', CRUST:'Costra',
  EROSION:'Erosión', ULCER:'Úlcera', FISSURE:'Fisura', SCAR:'Cicatriz',
  ATROPHY:'Atrofia', LICHENIFICATION:'Liquenificación',
}

export const LesionSchema = z.object({
  id:          z.string(),
  region:      z.enum(BODY_REGIONS),
  x:           z.number(),  // 0-100% relative to body SVG
  y:           z.number(),
  morphology:  z.enum(LESION_MORPHOLOGY).optional(),
  color:       z.string().optional(),
  size:        z.string().optional(),    // e.g. "2x3 cm"
  border:      z.string().optional(),
  surface:     z.string().optional(),
  evolution:   z.string().optional(),
  notes:       z.string().optional(),
  photos:      z.array(z.string()).default([]),  // URLs
  visitDate:   z.string().optional(),
})

export const DermatologyPayloadSchema = z.object({
  lesions:             z.array(LesionSchema).default([]),
  dermoscopyFindings:  z.string().optional(),
  highSuspicionNotes:  z.string().optional(),
  photoSeriesNotes:    z.string().optional(),
  followUpPlan:        z.string().optional(),
  generalNotes:        z.string().optional(),
})

export type Lesion              = z.infer<typeof LesionSchema>
export type DermatologyPayload  = z.infer<typeof DermatologyPayloadSchema>
export const EMPTY_DERMATOLOGY_PAYLOAD: DermatologyPayload = { lesions: [] }

// ─── Top-level union — discriminated by specialty ─────────────────────────────

export const SpecialtyPayloadSchema = z.discriminatedUnion('specialty', [
  z.object({ specialty: z.literal('DENTISTRY'),            data: DentalSpecialtyPayloadSchema }),
  z.object({ specialty: z.literal('FAMILY_MEDICINE'),      data: FamilyMedicinePayloadSchema }),
  z.object({ specialty: z.literal('PEDIATRICS'),           data: PediatricsPayloadSchema }),
  z.object({ specialty: z.literal('GYNECOLOGY_OBSTETRICS'),data: GynecologyPayloadSchema }),
  z.object({ specialty: z.literal('CARDIOLOGY'),           data: CardiologyPayloadSchema }),
  z.object({ specialty: z.literal('MENTAL_HEALTH'),        data: MentalHealthPayloadSchema }),
  z.object({ specialty: z.literal('OPHTHALMOLOGY'),        data: OphthalmologyPayloadSchema }),
  z.object({ specialty: z.literal('DERMATOLOGY'),          data: DermatologyPayloadSchema }),
])

export type SpecialtyPayload = z.infer<typeof SpecialtyPayloadSchema>
