import assert from 'node:assert/strict'
import {
  getDeepgramEphemeralKeyTtlSeconds,
  mintEphemeralKey,
} from '../../lib/deepgramClient.ts'
import { isDeepgramCredentialExpired } from '../../lib/deepgramCredentials.ts'
import { __resetServerEnvForTests } from '../../lib/env.ts'
import { runSuite } from '../testHarness.ts'

const REQUIRED_ENV_BASE: Record<string, string> = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  NEXTAUTH_SECRET: 'test-secret',
  APP_BASE_URL: 'http://localhost:3000',
  QUESTIONNAIRE_TOKEN_SECRET: 'test-questionnaire-secret',
  DEEPGRAM_API_KEY: 'x'.repeat(32),
  DEEPGRAM_PROJECT_ID: 'project-123',
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

export async function runDeepgramCredentialsUnitTests() {
  await runSuite('Unit: deepgramCredentials', [
    {
      name: 'TTL default es 900 segundos',
      run: async () => {
        await withEnv({ DEEPGRAM_EPHEMERAL_KEY_TTL_SECONDS: undefined }, () => {
          assert.equal(getDeepgramEphemeralKeyTtlSeconds(), 900)
        })
      },
    },
    {
      name: 'TTL inválido falla por configuración',
      run: async () => {
        await withEnv({ DEEPGRAM_EPHEMERAL_KEY_TTL_SECONDS: '60' }, () => {
          assert.throws(
            () => getDeepgramEphemeralKeyTtlSeconds(),
            /DEEPGRAM_EPHEMERAL_KEY_TTL_SECONDS debe estar entre 300 y 3600/,
          )
        })
      },
    },
    {
      name: 'mintEphemeralKey envía TTL configurado a Deepgram',
      run: async () => {
        await withEnv({ DEEPGRAM_EPHEMERAL_KEY_TTL_SECONDS: '1200' }, async () => {
          const originalFetch = globalThis.fetch
          let requestBody: Record<string, unknown> | null = null
          try {
            globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
              requestBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
              return new Response(
                JSON.stringify({
                  key: 'ephemeral-key',
                  api_key_id: 'key-id',
                  expiration_date: '2026-04-27T10:15:00.000Z',
                }),
                { status: 200 },
              )
            }) as typeof fetch

            await mintEphemeralKey({ comment: 'test-stream' })
            assert.ok(requestBody)
            assert.equal(requestBody["time_to_live_in_seconds"], 1200)
            assert.deepEqual(requestBody["scopes"], ['usage:write'])
          } finally {
            globalThis.fetch = originalFetch
          }
        })
      },
    },
    {
      name: 'detecta credencial expirada antes de abrir WebSocket',
      run: () => {
        const now = Date.parse('2026-04-27T10:00:00.000Z')
        assert.equal(isDeepgramCredentialExpired('2026-04-27T09:59:59.000Z', now), true)
        assert.equal(isDeepgramCredentialExpired('2026-04-27T10:01:00.000Z', now), false)
        assert.equal(isDeepgramCredentialExpired(undefined, now), true)
        assert.equal(isDeepgramCredentialExpired('not-a-date', now), true)
      },
    },
  ])
}
