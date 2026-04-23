export const COMMERCIAL_BASE_PLANS = {
  AGENDA: "AGENDA",
  CLINICAL: "CLINICAL",
  INTEGRAL: "INTEGRAL",
} as const;

export type CommercialBasePlan =
  (typeof COMMERCIAL_BASE_PLANS)[keyof typeof COMMERCIAL_BASE_PLANS];

export const COMMERCIAL_ADD_ONS = {
  AI: "AI",
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
  features: string[];
  excludes: string[];
};

type CommercialAddOnEntry = {
  code: CommercialAddOn;
  displayName: string;
  monthlyPriceMx: number | null;
  description: string;
  features: string[];
};

const CATALOG_VERSION = "2026-04-21" as const;

const BASE_PLAN_CATALOG: Record<CommercialBasePlan, CommercialCatalogEntry> = {
  AGENDA: {
    code: COMMERCIAL_BASE_PLANS.AGENDA,
    displayName: "Plan Agenda",
    legacyPlanName: "Plan Agenda MiDoc",
    monthlyPriceMx: null,
    description: "Agenda en línea con recordatorios y operación administrativa básica.",
    features: [
      "agenda.enabled",
      "agenda.reminders.whatsapp",
      "agenda.waitlist",
    ],
    excludes: [
      "clinical.enabled",
      "clinical.history",
      "clinical.notes",
      "clinical.prescriptions",
      "clinical.signoff",
      "clinical.encounters.standalone",
      "ai.enabled",
      "ai.dictation",
      "ai.insights",
    ],
  },
  CLINICAL: {
    code: COMMERCIAL_BASE_PLANS.CLINICAL,
    displayName: "Plan Clínico",
    legacyPlanName: "Plan Clínico MiDoc",
    monthlyPriceMx: null,
    description: "Expediente clínico, historia médica, notas, recetas y firma clínica sin agenda.",
    features: [
      "clinical.enabled",
      "clinical.history",
      "clinical.notes",
      "clinical.prescriptions",
      "clinical.signoff",
      "clinical.encounters.standalone",
    ],
    excludes: [
      "agenda.enabled",
      "agenda.reminders.whatsapp",
      "agenda.waitlist",
      "ai.enabled",
      "ai.dictation",
      "ai.insights",
    ],
  },
  INTEGRAL: {
    code: COMMERCIAL_BASE_PLANS.INTEGRAL,
    displayName: "Plan Integral",
    legacyPlanName: "Plan Integral MiDoc",
    monthlyPriceMx: 899,
    description: "Agenda + sistema clínico trabajando en conjunto.",
    features: [
      "agenda.enabled",
      "agenda.reminders.whatsapp",
      "agenda.waitlist",
      "clinical.enabled",
      "clinical.history",
      "clinical.notes",
      "clinical.prescriptions",
      "clinical.signoff",
      "clinical.encounters.standalone",
    ],
    excludes: [
      "ai.enabled",
      "ai.dictation",
      "ai.insights",
    ],
  },
};

const ADD_ON_CATALOG: Record<CommercialAddOn, CommercialAddOnEntry> = {
  AI: {
    code: COMMERCIAL_ADD_ONS.AI,
    displayName: "Add-on IA",
    monthlyPriceMx: null,
    description: "Capas de IA clínica premium sobre el plan base.",
    features: [
      "ai.enabled",
      "ai.dictation",
      "ai.insights",
    ],
  },
};

function buildFeatureRecord(featureKeys: string[]) {
  const features: SubscriptionCatalogFeatures = {};
  for (const key of featureKeys) {
    features[key] = true;
  }
  return features;
}

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
        (item): item is CommercialAddOn => item === COMMERCIAL_ADD_ONS.AI,
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
