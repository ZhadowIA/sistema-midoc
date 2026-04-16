import assert from 'node:assert/strict'
import { checkRateLimit } from '../../lib/rateLimitCore.ts'
import { runSuite } from '../testHarness.ts'

const GLOBAL_BUCKET_KEY = '__midocRateLimitBuckets'

function resetRateLimitBuckets() {
  ;(globalThis as typeof globalThis & { [GLOBAL_BUCKET_KEY]?: Map<string, unknown> })[
    GLOBAL_BUCKET_KEY
  ] = new Map<string, unknown>()
}

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
      run: () => {
        resetRateLimitBuckets()
        const request = buildRequest('10.0.0.1')
        const options = { key: 'test:limit', limit: 2, windowMs: 60_000 }

        const first = checkRateLimit(request, options)
        const second = checkRateLimit(request, options)
        const third = checkRateLimit(request, options)

        assert.equal(first.ok, true)
        assert.equal(second.ok, true)
        assert.equal(third.ok, false)
        assert.equal(third.remaining, 0)
      },
    },
    {
      name: 'checkRateLimit isolates identifiers within same ip',
      run: () => {
        resetRateLimitBuckets()
        const request = buildRequest('10.0.0.1')
        const optionsA = { key: 'test:identifier', limit: 1, windowMs: 60_000, identifier: 'doctorA' }
        const optionsB = { key: 'test:identifier', limit: 1, windowMs: 60_000, identifier: 'doctorB' }

        assert.equal(checkRateLimit(request, optionsA).ok, true)
        assert.equal(checkRateLimit(request, optionsA).ok, false)
        assert.equal(checkRateLimit(request, optionsB).ok, true)
      },
    },
    {
      name: 'checkRateLimit reopens bucket after window expiration',
      run: () => {
        resetRateLimitBuckets()
        const request = buildRequest('10.0.0.2')
        const options = { key: 'test:window', limit: 1, windowMs: 1_000 }
        const originalNow = Date.now

        try {
          Date.now = () => 1_000
          assert.equal(checkRateLimit(request, options).ok, true)
          assert.equal(checkRateLimit(request, options).ok, false)

          Date.now = () => 2_500
          const afterWindow = checkRateLimit(request, options)
          assert.equal(afterWindow.ok, true)
          assert.equal(afterWindow.remaining, 0)
        } finally {
          Date.now = originalNow
        }
      },
    },
  ])
}
