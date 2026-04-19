import assert from 'node:assert/strict'
import { verifyRecaptchaToken } from '../../lib/recaptcha.ts'
import { __resetServerEnvForTests } from '../../lib/env.ts'
import { runSuite } from '../testHarness.ts'

const REQUIRED_ENV_BASE: Record<string, string> = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  NEXTAUTH_SECRET: 'test-secret',
  APP_BASE_URL: 'http://localhost:3000',
  QUESTIONNAIRE_TOKEN_SECRET: 'test-questionnaire-secret',
}

async function withEnv<T>(overrides: Record<string, string | undefined>, run: () => Promise<T> | T): Promise<T> {
  const applied = { ...REQUIRED_ENV_BASE, ...overrides }
  const trackedKeys = Array.from(new Set([...Object.keys(applied), ...Object.keys(overrides)]))
  const original: Record<string, string | undefined> = {}
  for (const key of trackedKeys) {
    original[key] = process.env[key]
    const nextValue = applied[key]
    if (nextValue === undefined) delete process.env[key]
    else process.env[key] = nextValue
  }
  __resetServerEnvForTests()
  try {
    return await Promise.resolve(run())
  } finally {
    for (const key of trackedKeys) {
      if (original[key] === undefined) delete process.env[key]
      else process.env[key] = original[key]
    }
    __resetServerEnvForTests()
  }
}

export async function runRecaptchaUnitTests() {
  await runSuite('Unit: recaptcha', [
    {
      name: 'returns disabled when RECAPTCHA_V3_SECRET is not set',
      run: async () => {
        await withEnv({ RECAPTCHA_V3_SECRET: undefined }, async () => {
          const result = await verifyRecaptchaToken('any-token')
          assert.equal(result.ok, true)
          if (result.ok) assert.equal(result.reason, 'disabled')
        })
      },
    },
    {
      name: 'returns missing-token when secret configured but token empty',
      run: async () => {
        await withEnv({ RECAPTCHA_V3_SECRET: 'test-secret' }, async () => {
          const result = await verifyRecaptchaToken('')
          assert.equal(result.ok, false)
          if (!result.ok) assert.equal(result.reason, 'missing-token')
        })
      },
    },
    {
      name: 'returns verified when Google responds success with passing score',
      run: async () => {
        await withEnv({ RECAPTCHA_V3_SECRET: 'test-secret', RECAPTCHA_V3_MIN_SCORE: '0.5' }, async () => {
          const fakeFetch: typeof fetch = async () =>
            new Response(JSON.stringify({ success: true, score: 0.9, action: 'booking' }), { status: 200 })
          const result = await verifyRecaptchaToken('good-token', { fetchImpl: fakeFetch, expectedAction: 'booking' })
          assert.equal(result.ok, true)
          if (result.ok) {
            assert.equal(result.reason, 'verified')
            assert.equal(result.score, 0.9)
          }
        })
      },
    },
    {
      name: 'returns low-score when Google score is below threshold',
      run: async () => {
        await withEnv({ RECAPTCHA_V3_SECRET: 'test-secret', RECAPTCHA_V3_MIN_SCORE: '0.7' }, async () => {
          const fakeFetch: typeof fetch = async () =>
            new Response(JSON.stringify({ success: true, score: 0.3 }), { status: 200 })
          const result = await verifyRecaptchaToken('weak-token', { fetchImpl: fakeFetch })
          assert.equal(result.ok, false)
          if (!result.ok) {
            assert.equal(result.reason, 'low-score')
            assert.equal(result.score, 0.3)
          }
        })
      },
    },
    {
      name: 'returns invalid when Google reports success=false',
      run: async () => {
        await withEnv({ RECAPTCHA_V3_SECRET: 'test-secret' }, async () => {
          const fakeFetch: typeof fetch = async () =>
            new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), { status: 200 })
          const result = await verifyRecaptchaToken('bad-token', { fetchImpl: fakeFetch })
          assert.equal(result.ok, false)
          if (!result.ok) assert.equal(result.reason, 'invalid')
        })
      },
    },
    {
      name: 'returns invalid when action mismatch',
      run: async () => {
        await withEnv({ RECAPTCHA_V3_SECRET: 'test-secret' }, async () => {
          const fakeFetch: typeof fetch = async () =>
            new Response(JSON.stringify({ success: true, score: 0.9, action: 'other' }), { status: 200 })
          const result = await verifyRecaptchaToken('ok-token', { fetchImpl: fakeFetch, expectedAction: 'booking' })
          assert.equal(result.ok, false)
          if (!result.ok) assert.equal(result.reason, 'invalid')
        })
      },
    },
    {
      name: 'returns network-error when fetch throws',
      run: async () => {
        await withEnv({ RECAPTCHA_V3_SECRET: 'test-secret' }, async () => {
          const fakeFetch: typeof fetch = async () => {
            throw new Error('boom')
          }
          const result = await verifyRecaptchaToken('x', { fetchImpl: fakeFetch })
          assert.equal(result.ok, false)
          if (!result.ok) assert.equal(result.reason, 'network-error')
        })
      },
    },
  ])
}
