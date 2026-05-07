import {
  AGENDA_FEATURE_KEYS,
  AI_FEATURE_KEYS,
  buildFeatureRecord,
  CLINICAL_FEATURE_KEYS,
  SPECIALTY_FEATURE_KEYS,
  type SubscriptionFeatureKey,
} from "@/lib/subscriptionFeatures";

export const COMMERCIAL_BASE_PLANS = {
  AGENDA: "AGENDA",
  CLINICAL: "CLINICAL",
  INTEGRAL: "INTEGRAL",
} as const;

export type CommercialBasePlan =
  (typeof COMMERCIAL_BASE_PLANS)[keyof typeof COMMERCIAL_BASE_PLANS];

export const COMMERCIAL_ADD_ONS = {
  AI_30: "AI_30",
  AI_60: "AI_60",
  AI_100: "AI_100",
} as const;

export type CommercialAddOn =
  (typeof COMMERCIAL_ADD_ONS)[keyof typeof COMMERCIAL_ADD_ONS];

export type SubscriptionCatalogFeatures = Record<string, unknown>;

export type CommercialPlanSelection = {
  basePlan: CommercialBasePlan;
  addOns?: CommercialAddOn[];
};

export type CommercialPlanResolved = {
  catalogVersion: "2026-04-21";
  basePlan: CommercialBasePlan;
  addOns: CommercialAddOn[];
  displayName: string;
  legacyPlanName: string;
  monthlyPriceMx: number | null;
  features: SubscriptionCatalogFeatures;
};

type CommercialCatalogEntry = {
  code: CommercialBasePlan;
  displayName: string;
  legacyPlanName: string;
  monthlyPriceMx: number | null;
  description: string;
  features: readonly SubscriptionFeatureKey[];
  excludes: readonly SubscriptionFeatureKey[];
};

type CommercialAddOnEntry = {
  code: CommercialAddOn;
  displayName: string;
  monthlyPriceMx: number | null;
  description: string;
  features: readonly SubscriptionFeatureKey[];
};

const CATALOG_VERSION = "2026-04-21" as const;

const BASE_PLAN_CATALOG: Record<CommercialBasePlan, CommercialCatalogEntry> = {
  AGENDA: {
    code: COMMERCIAL_BASE_PLANS.AGENDA,
    displayName: "Plan Agenda",
    legacyPlanName: "Plan Agenda MiDoc",
    monthlyPriceMx: 299,
    description: "Agenda en línea con recordatorios y operación administrativa básica.",
    features: AGENDA_FEATURE_KEYS,
    excludes: [
      ...CLINICAL_FEATURE_KEYS,
      ...AI_FEATURE_KEYS,
      ...SPECIALTY_FEATURE_KEYS,
    ],
  },
  CLINICAL: {
    code: COMMERCIAL_BASE_PLANS.CLINICAL,
    displayName: "Plan Clínico",
    legacyPlanName: "Plan Clínico MiDoc",
    monthlyPriceMx: 449,
    description: "Expediente clínico, historia médica, notas, recetas y firma clínica sin agenda.",
    features: CLINICAL_FEATURE_KEYS,
    excludes: [
      ...AGENDA_FEATURE_KEYS,
      ...AI_FEATURE_KEYS,
      ...SPECIALTY_FEATURE_KEYS,
    ],
  },
  INTEGRAL: {
    code: COMMERCIAL_BASE_PLANS.INTEGRAL,
    displayName: "Plan Integral",
    legacyPlanName: "Plan Integral MiDoc",
    monthlyPriceMx: 599,
    description: "Agenda + sistema clínico trabajando en conjunto.",
    features: [...AGENDA_FEATURE_KEYS, ...CLINICAL_FEATURE_KEYS],
    excludes: [...AI_FEATURE_KEYS, ...SPECIALTY_FEATURE_KEYS],
  },
};

const ADD_ON_CATALOG: Record<CommercialAddOn, CommercialAddOnEntry> = {
  AI_30: {
    code: COMMERCIAL_ADD_ONS.AI_30,
    displayName: "Add-on IA 30%",
    monthlyPriceMx: 359,
    description: "IA clínica en el 30% de tus consultas (126 consultas/mes). Transcripción, SOAP estructurado, insights diagnósticos, validación farmacológica e indicaciones para paciente.",
    features: AI_FEATURE_KEYS,
  },
  AI_60: {
    code: COMMERCIAL_ADD_ONS.AI_60,
    displayName: "Add-on IA 60%",
    monthlyPriceMx: 669,
    description: "IA clínica en el 60% de tus consultas (252 consultas/mes). Transcripción, SOAP estructurado, insights diagnósticos, validación farmacológica e indicaciones para paciente.",
    features: AI_FEATURE_KEYS,
  },
  AI_100: {
    code: COMMERCIAL_ADD_ONS.AI_100,
    displayName: "Add-on IA Ilimitado",
    monthlyPriceMx: 999,
    description: "IA clínica en todas tus consultas (420 consultas/mes). Acceso completo a transcripción, SOAP estructurado, insights diagnósticos, validación farmacológica e indicaciones para paciente.",
    features: AI_FEATURE_KEYS,
  },
};

function uniqueAddOns(addOns: CommercialAddOn[] | undefined): CommercialAddOn[] {
  return Array.from(new Set(addOns ?? []));
}

export function resolveCommercialPlan(selection: CommercialPlanSelection): CommercialPlanResolved {
  const basePlan = BASE_PLAN_CATALOG[selection.basePlan];
  const addOns = uniqueAddOns(selection.addOns);
  const featureKeys = [...basePlan.features];

  for (const addOn of addOns) {
    const entry = ADD_ON_CATALOG[addOn];
    if (!entry) continue;
    featureKeys.push(...entry.features);
  }

  const displayName =
    addOns.length > 0
      ? `${basePlan.displayName} + ${addOns.map((addOn) => ADD_ON_CATALOG[addOn].displayName).join(" + ")}`
      : basePlan.displayName;

  return {
    catalogVersion: CATALOG_VERSION,
    basePlan: basePlan.code,
    addOns,
    displayName,
    legacyPlanName: displayName,
    monthlyPriceMx: basePlan.monthlyPriceMx,
    features: {
      ...buildFeatureRecord(featureKeys),
      "subscription.basePlan": basePlan.code,
      "subscription.addOns": addOns,
      "subscription.catalogVersion": CATALOG_VERSION,
      "subscription.displayName": displayName,
    },
  };
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export function resolveCommercialPlanFromSubscription(input: {
  planName?: string | null;
  features?: unknown;
}): CommercialPlanResolved {
  const features =
    input.features && typeof input.features === "object" && !Array.isArray(input.features)
      ? (input.features as SubscriptionCatalogFeatures)
      : {};

  const basePlanValue = features["subscription.basePlan"];
  const addOnsValue = readStringArray(features["subscription.addOns"]);

  if (
    basePlanValue === COMMERCIAL_BASE_PLANS.AGENDA ||
    basePlanValue === COMMERCIAL_BASE_PLANS.CLINICAL ||
    basePlanValue === COMMERCIAL_BASE_PLANS.INTEGRAL
  ) {
    return resolveCommercialPlan({
      basePlan: basePlanValue,
      addOns: addOnsValue.filter(
        (item): item is CommercialAddOn =>
          item === COMMERCIAL_ADD_ONS.AI_30 ||
          item === COMMERCIAL_ADD_ONS.AI_60 ||
          item === COMMERCIAL_ADD_ONS.AI_100,
      ),
    });
  }

  const normalizedPlanName = (input.planName ?? "").trim().toLowerCase();
  if (normalizedPlanName.includes("agenda")) {
    return resolveCommercialPlan({ basePlan: COMMERCIAL_BASE_PLANS.AGENDA });
  }
  if (
    normalizedPlanName.includes("clínico") ||
    normalizedPlanName.includes("clinico") ||
    normalizedPlanName.includes("expediente")
  ) {
    return resolveCommercialPlan({ basePlan: COMMERCIAL_BASE_PLANS.CLINICAL });
  }

  return resolveCommercialPlan({ basePlan: COMMERCIAL_BASE_PLANS.INTEGRAL });
}

export function getCommercialCatalog() {
  return {
    catalogVersion: CATALOG_VERSION,
    basePlans: Object.values(BASE_PLAN_CATALOG),
    addOns: Object.values(ADD_ON_CATALOG),
  };
}
