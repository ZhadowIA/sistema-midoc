import assert from 'node:assert/strict'
import { resolveCapabilities } from '../../lib/capabilities.ts'
import { __resetServerEnvForTests } from '../../lib/env.ts'
import { runSuite } from '../testHarness.ts'

const BASE_ENV = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  NEXTAUTH_SECRET: 'test-secret-123456789',
  APP_BASE_URL: 'http://localhost:3000',
  APP_TIMEZONE: 'America/Chihuahua',
  QUESTIONNAIRE_TOKEN_SECRET: 'test-questionnaire-secret-123456',
  TERMS_VERSION: 'v1',
  PRIVACY_VERSION: 'v1',
}

async function withEnv(overrides: Record<string, string | undefined>, run: () => Promise<void> | void) {
  const previous: Record<string, string | undefined> = {}
  Object.keys({ ...BASE_ENV, ...overrides }).forEach((key) => {
    previous[key] = process.env[key]
  })

  Object.entries(BASE_ENV).forEach(([key, value]) => {
    process.env[key] = value
  })
  Object.entries(overrides).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  })
  __resetServerEnvForTests()

  try {
    await Promise.resolve(run())
  } finally {
    Object.entries(previous).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    })
    __resetServerEnvForTests()
  }
}

export async function runCapabilitiesUnitTests() {
  await runSuite('Unit: capabilities', [
    {
      name: 'returns clinical disabled when global flag is off',
      run: async () => {
        await withEnv({ CLINICAL_HISTORY_ENABLED: 'false', OPENAI_API_KEY: 'x'.repeat(25) }, () => {
          const capabilities = resolveCapabilities({
            features: { 'clinical.enabled': true, 'ai.enabled': true, 'ai.insights': true },
            hasAppointmentContext: true,
          })
          assert.equal(capabilities.clinicalUnified.enabled, false)
          assert.equal(capabilities.clinicalUnified.reasonCode, 'CLINICAL_DISABLED_GLOBAL_FLAG')
        })
      },
    },
    {
      name: 'returns ai disabled by plan when feature missing',
      run: async () => {
        await withEnv({ CLINICAL_HISTORY_ENABLED: 'true', OPENAI_API_KEY: 'x'.repeat(25) }, () => {
          const capabilities = resolveCapabilities({
            features: { 'clinical.enabled': true, 'ai.enabled': false },
            hasAppointmentContext: true,
          })
          assert.equal(capabilities.aiConsultation.enabled, false)
          assert.equal(capabilities.aiConsultation.reasonCode, 'AI_DISABLED_PLAN')
        })
      },
    },
    {
      name: 'returns ai disabled without appointment context',
      run: async () => {
        await withEnv({ CLINICAL_HISTORY_ENABLED: 'true', OPENAI_API_KEY: 'x'.repeat(25) }, () => {
          const capabilities = resolveCapabilities({
            features: {
              'clinical.enabled': true,
              'ai.enabled': true,
              'ai.dictation': true,
            },
            hasAppointmentContext: false,
          })
          assert.equal(capabilities.aiConsultation.enabled, false)
          assert.equal(capabilities.aiConsultation.reasonCode, 'AI_DISABLED_NO_APPOINTMENT')
        })
      },
    },
    {
      name: 'enables ai without appointment when standalone clinical is enabled',
      run: async () => {
        await withEnv({ CLINICAL_HISTORY_ENABLED: 'true', OPENAI_API_KEY: 'x'.repeat(25) }, () => {
          const capabilities = resolveCapabilities({
            features: {
              'clinical.enabled': true,
              'clinical.encounters.standalone': true,
              'ai.enabled': true,
              'ai.dictation': true,
            },
            hasAppointmentContext: false,
          })
          assert.equal(capabilities.aiConsultation.enabled, true)
          assert.equal(capabilities.aiConsultation.reasonCode, 'ENABLED')
        })
      },
    },
  ])
}
