import {
  AI_FEATURE_KEYS,
  SUBSCRIPTION_FEATURES,
  type SubscriptionFeatureKey,
  type SubscriptionFeaturesRecord,
} from "@/lib/subscriptionFeatures";
import {
  COMMERCIAL_ADD_ONS,
  COMMERCIAL_BASE_PLANS,
  resolveCommercialPlan,
  type CommercialAddOn,
  type CommercialBasePlan,
  type CommercialPlanResolved,
} from "@/lib/subscriptionCatalog";

export const MANAGED_AI_FEATURE_KEYS = [
  SUBSCRIPTION_FEATURES.AI_DICTATION,
  SUBSCRIPTION_FEATURES.AI_INSIGHTS,
  SUBSCRIPTION_FEATURES.AI_QUESTIONNAIRE_TEXT,
  SUBSCRIPTION_FEATURES.AI_QUESTIONNAIRE_AUDIO,
] as const;

export type ManagedAiFeatureKey = (typeof MANAGED_AI_FEATURE_KEYS)[number];

export type ManagedAiOverrides = Partial<Record<ManagedAiFeatureKey, boolean>>;

export type ManagedCommercialStateInput = {
  basePlan: CommercialBasePlan;
  addOn: CommercialAddOn | null;
  aiOverrides?: ManagedAiOverrides;
};

export type CommercialDiff = {
  planChanged: boolean;
  addOnChanged: boolean;
  enabledFeatures: string[];
  disabledFeatures: string[];
};

const ADD_ON_SET = new Set(Object.values(COMMERCIAL_ADD_ONS));

export function isCommercialAddOn(value: string | null | undefined): value is CommercialAddOn {
  return typeof value === "string" && ADD_ON_SET.has(value as CommercialAddOn);
}

export function getMonthlyPriceTotal(
  resolved: Pick<CommercialPlanResolved, "basePlan" | "addOns" | "monthlyPriceMx">,
) {
  const base = resolved.monthlyPriceMx ?? 0;
  const addOnTotal = resolved.addOns.reduce((sum, addOn) => {
    if (addOn === COMMERCIAL_ADD_ONS.AI_30) return sum + 359;
    if (addOn === COMMERCIAL_ADD_ONS.AI_60) return sum + 669;
    if (addOn === COMMERCIAL_ADD_ONS.AI_100) return sum + 999;
    return sum;
  }, 0);
  return base + addOnTotal;
}

function disableAllAiFeatures(features: SubscriptionFeaturesRecord) {
  for (const key of [...AI_FEATURE_KEYS, SUBSCRIPTION_FEATURES.AI_SPECIALTY_ENABLED]) {
    delete features[key];
  }
}

export function buildManagedCommercialState(
  input: ManagedCommercialStateInput,
): CommercialPlanResolved & {
  features: SubscriptionFeaturesRecord;
  aiFeaturesEnabled: ManagedAiFeatureKey[];
} {
  if (
    input.addOn &&
    input.basePlan === COMMERCIAL_BASE_PLANS.AGENDA
  ) {
    throw new Error("No puedes activar add-ons de IA sobre el plan Agenda.");
  }

  const resolved = resolveCommercialPlan({
    basePlan: input.basePlan,
    addOns: input.addOn ? [input.addOn] : [],
  });

  const features: SubscriptionFeaturesRecord = { ...resolved.features };

  if (!input.addOn) {
    disableAllAiFeatures(features);
    return {
      ...resolved,
      features,
      aiFeaturesEnabled: [],
    };
  }

  for (const key of MANAGED_AI_FEATURE_KEYS) {
    const nextValue = input.aiOverrides?.[key];
    if (nextValue === false) {
      delete features[key];
    } else {
      features[key] = true;
    }
  }

  const hasAnyAiCapability = MANAGED_AI_FEATURE_KEYS.some((key) => features[key] === true);

  if (hasAnyAiCapability) {
    features[SUBSCRIPTION_FEATURES.AI_ENABLED] = true;
    features[SUBSCRIPTION_FEATURES.AI_CREDITS_ENABLED] = true;
  } else {
    delete features[SUBSCRIPTION_FEATURES.AI_ENABLED];
    delete features[SUBSCRIPTION_FEATURES.AI_CREDITS_ENABLED];
  }

  return {
    ...resolved,
    features,
    aiFeaturesEnabled: MANAGED_AI_FEATURE_KEYS.filter((key) => features[key] === true),
  };
}

export function buildCommercialDiff(
  previous: {
    basePlan: CommercialBasePlan;
    addOn: CommercialAddOn | null;
    features: Record<string, unknown>;
  },
  next: {
    basePlan: CommercialBasePlan;
    addOn: CommercialAddOn | null;
    features: Record<string, unknown>;
  },
): CommercialDiff {
  const previousKeys = new Set(
    Object.entries(previous.features)
      .filter(([, value]) => value === true)
      .map(([key]) => key),
  );
  const nextKeys = new Set(
    Object.entries(next.features)
      .filter(([, value]) => value === true)
      .map(([key]) => key),
  );

  const enabledFeatures = Array.from(nextKeys).filter((key) => !previousKeys.has(key));
  const disabledFeatures = Array.from(previousKeys).filter((key) => !nextKeys.has(key));

  return {
    planChanged: previous.basePlan !== next.basePlan,
    addOnChanged: previous.addOn !== next.addOn,
    enabledFeatures: enabledFeatures.sort(),
    disabledFeatures: disabledFeatures.sort(),
  };
}

export function getPrimaryAiAddOn(value: unknown): CommercialAddOn | null {
  if (!Array.isArray(value)) return null;
  const first = value.find((item): item is string => typeof item === "string");
  return isCommercialAddOn(first) ? first : null;
}

export function getBasePlanFromFeatures(value: unknown): CommercialBasePlan {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const basePlan = (value as Record<string, unknown>)["subscription.basePlan"];
    if (
      basePlan === COMMERCIAL_BASE_PLANS.AGENDA ||
      basePlan === COMMERCIAL_BASE_PLANS.CLINICAL ||
      basePlan === COMMERCIAL_BASE_PLANS.INTEGRAL
    ) {
      return basePlan;
    }
  }
  return COMMERCIAL_BASE_PLANS.INTEGRAL;
}

export function getEnabledFeatureKeys(value: unknown): SubscriptionFeatureKey[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];

  return Object.entries(value as Record<string, unknown>)
    .filter(([, enabled]) => enabled === true)
    .map(([key]) => key as SubscriptionFeatureKey)
    .sort();
}
