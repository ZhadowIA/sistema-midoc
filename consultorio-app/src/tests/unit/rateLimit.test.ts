import assert from 'node:assert/strict'
import { checkRateLimit } from '../../lib/rateLimitCore.ts'
import { resetSecurityStateStore } from '../../lib/securityStateStore.ts'
import { runSuite } from '../testHarness.ts'

function buildRequest(ip: string, url = 'http://localhost/test') {
  return new Request(url, {
    headers: {
      'x-forwarded-for': ip,
    },
  })
}

export async function runRateLimitUnitTests() {
  await runSuite('Unit: rateLimit', [
    {
      name: 'checkRateLimit blocks requests after limit for same key+ip',
      run: async () => {
        await resetSecurityStateStore()
        const request = buildRequest('10.0.0.1')
        const options = { key: 'test:limit', limit: 2, windowMs: 60_000 }

        const first = await checkRateLimit(request, options)
        const second = await checkRateLimit(request, options)
        const third = await checkRateLimit(request, options)

        assert.equal(first.ok, true)
        assert.equal(second.ok, true)
        assert.equal(third.ok, false)
        assert.equal(third.remaining, 0)
      },
    },
    {
      name: 'checkRateLimit isolates identifiers within same ip',
      run: async () => {
        await resetSecurityStateStore()
        const request = buildRequest('10.0.0.1')
        const optionsA = { key: 'test:identifier', limit: 1, windowMs: 60_000, identifier: 'doctorA' }
        const optionsB = { key: 'test:identifier', limit: 1, windowMs: 60_000, identifier: 'doctorB' }

        assert.equal((await checkRateLimit(request, optionsA)).ok, true)
        assert.equal((await checkRateLimit(request, optionsA)).ok, false)
        assert.equal((await checkRateLimit(request, optionsB)).ok, true)
      },
    },
    {
      name: 'checkRateLimit reopens bucket after window expiration',
      run: async () => {
        await resetSecurityStateStore()
        const request = buildRequest('10.0.0.2')
        const options = { key: 'test:window', limit: 1, windowMs: 1_000 }
        const originalNow = Date.now

        try {
          Date.now = () => 1_000
          assert.equal((await checkRateLimit(request, options)).ok, true)
          assert.equal((await checkRateLimit(request, options)).ok, false)

          Date.now = () => 2_500
          const afterWindow = await checkRateLimit(request, options)
          assert.equal(afterWindow.ok, true)
          assert.equal(afterWindow.remaining, 0)
        } finally {
          Date.now = originalNow
        }
      },
    },
  ])
}
