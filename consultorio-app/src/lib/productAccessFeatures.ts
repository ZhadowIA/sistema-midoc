import {
  coerceSubscriptionFeatures,
  hasAgendaCapability,
  hasClinicalCapability,
  type SubscriptionFeaturesRecord,
} from "@/lib/subscriptionFeatures"

export function coerceFeaturesForProductAccess(value: unknown): SubscriptionFeaturesRecord {
  return coerceSubscriptionFeatures(value)
}

export function getModuleAccessFromFeatures(features: SubscriptionFeaturesRecord) {
  const agendaEnabled = hasAgendaCapability(features)
  const clinicalEnabled = hasClinicalCapability(features)

  return {
    agendaEnabled,
    clinicalEnabled,
  }
}
