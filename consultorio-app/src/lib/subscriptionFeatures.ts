export const SUBSCRIPTION_FEATURES = {
  AGENDA_ENABLED: "agenda.enabled",
  AGENDA_REMINDERS_WHATSAPP: "agenda.reminders.whatsapp",
  AGENDA_WAITLIST: "agenda.waitlist",
  CLINICAL_ENABLED: "clinical.enabled",
  CLINICAL_HISTORY: "clinical.history",
  CLINICAL_NOTES: "clinical.notes",
  CLINICAL_PRESCRIPTIONS: "clinical.prescriptions",
  CLINICAL_SIGNOFF: "clinical.signoff",
  CLINICAL_ENCOUNTERS_STANDALONE: "clinical.encounters.standalone",
  AI_ENABLED: "ai.enabled",
  AI_DICTATION: "ai.dictation",
  AI_INSIGHTS: "ai.insights",
  AI_QUESTIONNAIRE_TEXT: "ai.questionnaire.text",
  AI_QUESTIONNAIRE_AUDIO: "ai.questionnaire.audio",
  AI_CREDITS_ENABLED: "ai.credits.enabled",
  SPECIALTY_CORE_ENABLED: "specialty.core.enabled",
  AI_SPECIALTY_ENABLED: "ai.specialty.enabled",
  CLINIC_REPORTS_AGGREGATE: "clinic.reports.aggregate",
  CLINIC_SEATS_ENFORCED: "clinic.seats.enforced",
} as const;

export type SubscriptionFeatureKey =
  (typeof SUBSCRIPTION_FEATURES)[keyof typeof SUBSCRIPTION_FEATURES];

export type SubscriptionFeaturesRecord = Partial<Record<SubscriptionFeatureKey, boolean>> &
  Record<string, unknown>;

export const AGENDA_FEATURE_KEYS = [
  SUBSCRIPTION_FEATURES.AGENDA_ENABLED,
  SUBSCRIPTION_FEATURES.AGENDA_REMINDERS_WHATSAPP,
  SUBSCRIPTION_FEATURES.AGENDA_WAITLIST,
] as const;

export const CLINICAL_FEATURE_KEYS = [
  SUBSCRIPTION_FEATURES.CLINICAL_ENABLED,
  SUBSCRIPTION_FEATURES.CLINICAL_HISTORY,
  SUBSCRIPTION_FEATURES.CLINICAL_NOTES,
  SUBSCRIPTION_FEATURES.CLINICAL_PRESCRIPTIONS,
  SUBSCRIPTION_FEATURES.CLINICAL_SIGNOFF,
  SUBSCRIPTION_FEATURES.CLINICAL_ENCOUNTERS_STANDALONE,
] as const;

export const AI_FEATURE_KEYS = [
  SUBSCRIPTION_FEATURES.AI_ENABLED,
  SUBSCRIPTION_FEATURES.AI_DICTATION,
  SUBSCRIPTION_FEATURES.AI_INSIGHTS,
  SUBSCRIPTION_FEATURES.AI_QUESTIONNAIRE_TEXT,
  SUBSCRIPTION_FEATURES.AI_QUESTIONNAIRE_AUDIO,
  SUBSCRIPTION_FEATURES.AI_CREDITS_ENABLED,
] as const;

export const SPECIALTY_FEATURE_KEYS = [
  SUBSCRIPTION_FEATURES.SPECIALTY_CORE_ENABLED,
  SUBSCRIPTION_FEATURES.AI_SPECIALTY_ENABLED,
] as const;

export function coerceSubscriptionFeatures(value: unknown): SubscriptionFeaturesRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as SubscriptionFeaturesRecord;
}

export function isFeatureEnabled(
  features: SubscriptionFeaturesRecord,
  feature: SubscriptionFeatureKey,
): boolean {
  return features[feature] === true;
}

export function hasAgendaCapability(features: SubscriptionFeaturesRecord): boolean {
  return isFeatureEnabled(features, SUBSCRIPTION_FEATURES.AGENDA_ENABLED);
}

export function hasClinicalCapability(features: SubscriptionFeaturesRecord): boolean {
  return (
    isFeatureEnabled(features, SUBSCRIPTION_FEATURES.CLINICAL_ENABLED) ||
    isFeatureEnabled(features, SUBSCRIPTION_FEATURES.CLINICAL_HISTORY)
  );
}

export function hasAiCapability(features: SubscriptionFeaturesRecord): boolean {
  return (
    isFeatureEnabled(features, SUBSCRIPTION_FEATURES.AI_ENABLED) &&
    (isFeatureEnabled(features, SUBSCRIPTION_FEATURES.AI_DICTATION) ||
      isFeatureEnabled(features, SUBSCRIPTION_FEATURES.AI_INSIGHTS) ||
      isFeatureEnabled(features, SUBSCRIPTION_FEATURES.AI_QUESTIONNAIRE_TEXT) ||
      isFeatureEnabled(features, SUBSCRIPTION_FEATURES.AI_QUESTIONNAIRE_AUDIO) ||
      isFeatureEnabled(features, SUBSCRIPTION_FEATURES.AI_SPECIALTY_ENABLED))
  );
}

export function buildFeatureRecord(featureKeys: readonly SubscriptionFeatureKey[]) {
  const features: SubscriptionFeaturesRecord = {};
  for (const key of featureKeys) {
    features[key] = true;
  }
  return features;
}
