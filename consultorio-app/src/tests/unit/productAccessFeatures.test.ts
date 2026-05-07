import { getModuleAccessFromFeatures } from '@/lib/productAccessFeatures'
import {
  hasAiCapability,
  SUBSCRIPTION_FEATURES,
} from '@/lib/subscriptionFeatures'
import assert from 'node:assert/strict'

export async function runProductAccessFeaturesUnitTests() {
  const { test } = await import('node:test')

  test('getModuleAccessFromFeatures detects agenda capability from canonical feature', () => {
    const access = getModuleAccessFromFeatures({
      'agenda.enabled': true,
    })

    assert.equal(access.agendaEnabled, true)
    assert.equal(access.clinicalEnabled, false)
  })

  test('getModuleAccessFromFeatures accepts clinical.enabled or clinical.history', () => {
    const access = getModuleAccessFromFeatures({
      'clinical.history': true,
    })

    assert.equal(access.agendaEnabled, false)
    assert.equal(access.clinicalEnabled, true)
  })

  test('hasAiCapability accepts future questionnaire and specialty capabilities', () => {
    assert.equal(
      hasAiCapability({
        [SUBSCRIPTION_FEATURES.AI_ENABLED]: true,
        [SUBSCRIPTION_FEATURES.AI_QUESTIONNAIRE_TEXT]: true,
      }),
      true,
    )
    assert.equal(
      hasAiCapability({
        [SUBSCRIPTION_FEATURES.AI_ENABLED]: true,
        [SUBSCRIPTION_FEATURES.AI_SPECIALTY_ENABLED]: true,
      }),
      true,
    )
  })
}
