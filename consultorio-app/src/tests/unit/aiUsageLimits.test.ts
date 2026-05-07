import assert from 'node:assert/strict'
import { evaluateMonthlyUsageLimit } from '../../lib/aiUsageLimits.ts'
import { runSuite } from '../testHarness.ts'

export async function runAiUsageLimitsUnitTests() {
  await runSuite('Unit: aiUsageLimits', [
    {
      name: 'retorna OK debajo del primer umbral blando',
      run: async () => {
        const decision = evaluateMonthlyUsageLimit({ used: 69, limit: 100 })
        assert.equal(decision.status, 'OK')
      },
    },
    {
      name: 'retorna SOFT_WARNING en umbrales 70/85/95',
      run: async () => {
        assert.equal(evaluateMonthlyUsageLimit({ used: 70, limit: 100 }).thresholdPct, 0.7)
        assert.equal(evaluateMonthlyUsageLimit({ used: 85, limit: 100 }).thresholdPct, 0.85)
        assert.equal(evaluateMonthlyUsageLimit({ used: 95, limit: 100 }).thresholdPct, 0.95)
      },
    },
    {
      name: 'retorna HARD_LIMIT al llegar o superar el cupo',
      run: async () => {
        assert.equal(evaluateMonthlyUsageLimit({ used: 100, limit: 100 }).status, 'HARD_LIMIT')
        assert.equal(evaluateMonthlyUsageLimit({ used: 1, limit: 0 }).status, 'HARD_LIMIT')
      },
    },
  ])
}

