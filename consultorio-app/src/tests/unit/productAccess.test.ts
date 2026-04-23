import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildProductAccessFromFeatures,
  PRODUCT_MODULES,
  PRODUCT_PLANS,
} from '@/lib/productAccess'

test('buildProductAccessFromFeatures prioriza agenda y clinico cuando features canonicas existen', () => {
  const access = buildProductAccessFromFeatures({
    'agenda.enabled': true,
    'clinical.enabled': true,
    'ai.enabled': true,
  })

  assert.equal(access.plan, PRODUCT_PLANS.COMBINED)
  assert.deepEqual(access.enabledModules, [PRODUCT_MODULES.AGENDA, PRODUCT_MODULES.CLINICAL_RECORDS])
  assert.equal(access.features['ai.enabled'], true)
})

test('buildProductAccessFromFeatures soporta bundle solo clinico usando clinical.history', () => {
  const access = buildProductAccessFromFeatures(
    {
      'clinical.history': true,
      'clinical.notes': true,
    },
    PRODUCT_PLANS.AGENDA
  )

  assert.equal(access.plan, PRODUCT_PLANS.CLINICAL_RECORDS)
  assert.deepEqual(access.enabledModules, [PRODUCT_MODULES.CLINICAL_RECORDS])
})

test('buildProductAccessFromFeatures cae a fallback cuando no hay capacidades canonicas', () => {
  const access = buildProductAccessFromFeatures({ 'ai.enabled': true }, PRODUCT_PLANS.AGENDA)

  assert.equal(access.plan, PRODUCT_PLANS.AGENDA)
  assert.deepEqual(access.enabledModules, [PRODUCT_MODULES.AGENDA])
})
