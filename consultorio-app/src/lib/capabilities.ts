import { getServerEnv } from '@/lib/env'

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
  return features['clinical.enabled'] === true || features['clinical.history'] === true
}

function hasAiFeature(features: Record<string, unknown>) {
  return (
    features['ai.enabled'] === true &&
    (features['ai.dictation'] === true || features['ai.insights'] === true)
  )
}

function hasStandaloneClinicalFeature(features: Record<string, unknown>) {
  return features['clinical.encounters.standalone'] === true
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
