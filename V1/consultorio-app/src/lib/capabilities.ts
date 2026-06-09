import { getServerEnv } from '@/lib/env'
import {
  hasAiCapability,
  hasClinicalCapability,
  isFeatureEnabled,
  SUBSCRIPTION_FEATURES,
} from '@/lib/subscriptionFeatures'

export type CapabilityReasonCode =
  | 'ENABLED'
  | 'CLINICAL_DISABLED_GLOBAL_FLAG'
  | 'CLINICAL_DISABLED_PLAN'
  | 'AI_DISABLED_NO_API_KEY'
  | 'AI_DISABLED_PLAN'
  | 'AI_DISABLED_NO_APPOINTMENT'
  | 'AI_DISABLED_CLINICAL_NOT_ENABLED'

export type CapabilityStatus = {
  enabled: boolean
  reasonCode: CapabilityReasonCode
}

export type ResolvedCapabilities = {
  clinicalUnified: CapabilityStatus
  aiConsultation: CapabilityStatus
}

type ResolveCapabilitiesInput = {
  features: Record<string, unknown>
  hasAppointmentContext: boolean
}

function hasClinicalFeature(features: Record<string, unknown>) {
  return hasClinicalCapability(features)
}

function hasAiFeature(features: Record<string, unknown>) {
  return hasAiCapability(features)
}

function hasStandaloneClinicalFeature(features: Record<string, unknown>) {
  return isFeatureEnabled(features, SUBSCRIPTION_FEATURES.CLINICAL_ENCOUNTERS_STANDALONE)
}

export function resolveCapabilities(input: ResolveCapabilitiesInput): ResolvedCapabilities {
  const env = getServerEnv()
  const clinicalFeatureEnabled = hasClinicalFeature(input.features)
  const clinicalUnified: CapabilityStatus = !env.CLINICAL_HISTORY_ENABLED
    ? { enabled: false, reasonCode: 'CLINICAL_DISABLED_GLOBAL_FLAG' }
    : clinicalFeatureEnabled
      ? { enabled: true, reasonCode: 'ENABLED' }
      : { enabled: false, reasonCode: 'CLINICAL_DISABLED_PLAN' }

  const hasSupportedClinicalContext =
    input.hasAppointmentContext || hasStandaloneClinicalFeature(input.features)

  const aiConsultation: CapabilityStatus = !clinicalUnified.enabled
    ? { enabled: false, reasonCode: 'AI_DISABLED_CLINICAL_NOT_ENABLED' }
    : !env.OPENAI_API_KEY
      ? { enabled: false, reasonCode: 'AI_DISABLED_NO_API_KEY' }
      : !hasAiFeature(input.features)
        ? { enabled: false, reasonCode: 'AI_DISABLED_PLAN' }
        : !hasSupportedClinicalContext
          ? { enabled: false, reasonCode: 'AI_DISABLED_NO_APPOINTMENT' }
          : { enabled: true, reasonCode: 'ENABLED' }

  return { clinicalUnified, aiConsultation }
}
