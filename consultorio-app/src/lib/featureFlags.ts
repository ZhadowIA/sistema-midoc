import { getServerEnv } from './env'
import prisma from './prisma'
import {
  coerceSubscriptionFeatures,
  hasAiCapability,
  hasClinicalCapability,
  isFeatureEnabled,
  SUBSCRIPTION_FEATURES,
  type SubscriptionFeatureKey,
  type SubscriptionFeaturesRecord,
} from './subscriptionFeatures'

export { SUBSCRIPTION_FEATURES, type SubscriptionFeatureKey, type SubscriptionFeaturesRecord }

async function loadSubscriptionFeatures(userId: string): Promise<SubscriptionFeaturesRecord> {
  const subscription = await prisma.doctorSubscription.findUnique({
    where: { doctorId: userId },
    select: { features: true },
  })

  return coerceSubscriptionFeatures(subscription?.features)
}

export async function getEnabledFeatures(userId: string): Promise<SubscriptionFeaturesRecord> {
  return loadSubscriptionFeatures(userId)
}

export async function hasFeature(userId: string, flag: SubscriptionFeatureKey): Promise<boolean> {
  const features = await loadSubscriptionFeatures(userId)
  return isFeatureEnabled(features, flag)
}

export async function canUseAgenda(userId: string): Promise<boolean> {
  return hasFeature(userId, SUBSCRIPTION_FEATURES.AGENDA_ENABLED)
}

export async function canUseClinical(userId: string): Promise<boolean> {
  const features = await loadSubscriptionFeatures(userId)
  return hasClinicalCapability(features)
}

export async function canUseAi(userId: string): Promise<boolean> {
  const features = await loadSubscriptionFeatures(userId)
  return hasAiCapability(features)
}

export function isClinicalHistoryEnabled(): boolean {
  return getServerEnv().CLINICAL_HISTORY_ENABLED
}

export function isAiAvailableOnServer(): boolean {
  return Boolean(getServerEnv().OPENAI_API_KEY)
}

export async function isClinicalHistoryAvailableForUser(userId: string): Promise<boolean> {
  return canUseClinical(userId)
}

export async function isAiAvailableForUser(userId: string): Promise<boolean> {
  if (!isAiAvailableOnServer()) return false
  return canUseAi(userId)
}

export function __resetFeatureFlagsCacheForTests() {
  // no-op: cache removed to avoid stale feature propagation across requests
}
