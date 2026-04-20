import { getServerEnv } from './env'
import prisma from './prisma'

export function isClinicalHistoryEnabled(): boolean {
  return getServerEnv().CLINICAL_HISTORY_ENABLED
}

export function isAiAvailableOnServer(): boolean {
  return Boolean(getServerEnv().OPENAI_API_KEY)
}

export type SubscriptionFeatureKey =
  | 'clinic.reports.aggregate'
  | 'clinic.seats.enforced'
  | 'ai.dictation'
  | 'ai.insights'
  | 'clinical.history'

type SubscriptionFeaturesRecord = Record<string, unknown>

const requestFeatureCache = new Map<string, SubscriptionFeaturesRecord>()

function coerceFeatures(value: unknown): SubscriptionFeaturesRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as SubscriptionFeaturesRecord
}

async function loadSubscriptionFeatures(userId: string): Promise<SubscriptionFeaturesRecord> {
  const cached = requestFeatureCache.get(userId)
  if (cached) return cached

  const subscription = await prisma.doctorSubscription.findUnique({
    where: { doctorId: userId },
    select: { features: true },
  })

  const normalized = coerceFeatures(subscription?.features)
  requestFeatureCache.set(userId, normalized)
  return normalized
}

export async function hasFeature(userId: string, flag: SubscriptionFeatureKey): Promise<boolean> {
  const features = await loadSubscriptionFeatures(userId)
  return features[flag] === true
}

export function __resetFeatureFlagsCacheForTests() {
  requestFeatureCache.clear()
}
