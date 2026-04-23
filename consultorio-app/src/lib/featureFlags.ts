import { getServerEnv } from './env'
import prisma from './prisma'

export type SubscriptionFeatureKey =
  | 'agenda.enabled'
  | 'agenda.reminders.whatsapp'
  | 'agenda.waitlist'
  | 'clinical.enabled'
  | 'clinical.history'
  | 'clinical.notes'
  | 'clinical.prescriptions'
  | 'clinical.signoff'
  | 'clinical.encounters.standalone'
  | 'ai.enabled'
  | 'ai.dictation'
  | 'ai.insights'
  | 'clinic.reports.aggregate'
  | 'clinic.seats.enforced'

export type SubscriptionFeaturesRecord = Record<string, unknown>

function coerceFeatures(value: unknown): SubscriptionFeaturesRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as SubscriptionFeaturesRecord
}

async function loadSubscriptionFeatures(userId: string): Promise<SubscriptionFeaturesRecord> {
  const subscription = await prisma.doctorSubscription.findUnique({
    where: { doctorId: userId },
    select: { features: true },
  })

  return coerceFeatures(subscription?.features)
}

export async function getEnabledFeatures(userId: string): Promise<SubscriptionFeaturesRecord> {
  return loadSubscriptionFeatures(userId)
}

export async function hasFeature(userId: string, flag: SubscriptionFeatureKey): Promise<boolean> {
  const features = await loadSubscriptionFeatures(userId)
  return features[flag] === true
}

export async function canUseAgenda(userId: string): Promise<boolean> {
  return hasFeature(userId, 'agenda.enabled')
}

export async function canUseClinical(userId: string): Promise<boolean> {
  const features = await loadSubscriptionFeatures(userId)
  return features['clinical.enabled'] === true || features['clinical.history'] === true
}

export async function canUseAi(userId: string): Promise<boolean> {
  const features = await loadSubscriptionFeatures(userId)
  return (
    features['ai.enabled'] === true &&
    (features['ai.dictation'] === true || features['ai.insights'] === true)
  )
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
