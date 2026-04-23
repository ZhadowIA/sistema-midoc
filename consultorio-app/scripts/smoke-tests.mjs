#!/usr/bin/env node
// Smoke tests post-deploy — Fase 10.4.a
// Uso:
//   SMOKE_BASE_URL=https://midoc.example.com \
//   SMOKE_EMAIL=admin@consultorio.com \
//   SMOKE_PASSWORD=admin123 \
//   node scripts/smoke-tests.mjs
//
// Exit code 0 si todos los checks pasan; 1 si alguno falla.
// Sin deps externas: usa fetch nativo de Node 20+.

const BASE_URL = (process.env.SMOKE_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
const EMAIL = process.env.SMOKE_EMAIL ?? ''
const PASSWORD = process.env.SMOKE_PASSWORD ?? ''
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 10000)

const results = []
let hadFailure = false

function stamp() {
  return new Date().toISOString()
}

function record(name, ok, detail) {
  results.push({ name, ok, detail })
  if (!ok) hadFailure = true
  const icon = ok ? 'OK' : 'FAIL'
  const line = `[${stamp()}] ${icon}  ${name}${detail ? `  ${detail}` : ''}`
  if (ok) console.log(line)
  else console.error(line)
}

async function timedFetch(path, init = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const started = Date.now()
    const res = await fetch(`${BASE_URL}${path}`, { ...init, signal: controller.signal })
    const elapsedMs = Date.now() - started
    return { res, elapsedMs }
  } finally {
    clearTimeout(timer)
  }
}

async function check(name, fn) {
  try {
    await fn()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    record(name, false, message)
  }
}

function expect(cond, message) {
  if (!cond) throw new Error(message)
}

function extractCookie(setCookieHeader, name) {
  if (!setCookieHeader) return null
  const parts = setCookieHeader.split(/,(?=[^ ;]+=)/)
  for (const part of parts) {
    const trimmed = part.trim()
    if (trimmed.startsWith(`${name}=`)) {
      return trimmed.split(';')[0]
    }
  }
  return null
}

// -----------------------------------------------------------------------------

await check('GET /api/health (liveness)', async () => {
  const { res, elapsedMs } = await timedFetch('/api/health')
  expect(res.status === 200, `status=${res.status}`)
  const body = await res.json()
  expect(body.status === 'ok', `body.status=${body.status}`)
  record('GET /api/health (liveness)', true, `${elapsedMs}ms`)
})

await check('GET /api/health/ready (DB reachable)', async () => {
  const { res, elapsedMs } = await timedFetch('/api/health/ready')
  expect(res.status === 200, `status=${res.status}`)
  const body = await res.json()
  expect(body.status === 'ready', `body.status=${body.status}`)
  expect(typeof body.dbLatencyMs === 'number', 'sin dbLatencyMs')
  record('GET /api/health/ready (DB reachable)', true, `${elapsedMs}ms · dbLatency=${body.dbLatencyMs}ms`)
})

let sessionCookie = null

if (EMAIL && PASSWORD) {
  await check('POST /api/auth/login (credenciales smoke)', async () => {
    const { res, elapsedMs } = await timedFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    })
    expect(res.status === 200, `status=${res.status}`)
    const setCookie = res.headers.get('set-cookie')
    sessionCookie = extractCookie(setCookie, 'med_token')
    expect(Boolean(sessionCookie), 'cookie med_token no recibida')
    const body = await res.json()
    expect(body.success === true, 'success != true')
    record('POST /api/auth/login (credenciales smoke)', true, `${elapsedMs}ms`)
  })

  if (sessionCookie) {
    await check('GET /api/auth/setup-status (sesión válida)', async () => {
      const { res, elapsedMs } = await timedFetch('/api/auth/setup-status', {
        headers: { cookie: sessionCookie },
      })
      expect(res.status === 200, `status=${res.status}`)
      const body = await res.json()
      expect(typeof body.nextStep === 'string', 'sin nextStep')
      record('GET /api/auth/setup-status (sesión válida)', true, `${elapsedMs}ms · nextStep=${body.nextStep}`)
    })

    await check('POST /api/auth/logout (cleanup)', async () => {
      const { res } = await timedFetch('/api/auth/logout', {
        method: 'POST',
        headers: { cookie: sessionCookie },
      })
      expect([200, 204].includes(res.status), `status=${res.status}`)
      record('POST /api/auth/logout (cleanup)', true)
    })
  }
} else {
  console.log(`[${stamp()}] SKIP   autenticación — define SMOKE_EMAIL y SMOKE_PASSWORD para cubrirla`)
}

// -----------------------------------------------------------------------------

const passed = results.filter((r) => r.ok).length
const failed = results.length - passed
console.log('\n─────────────────────────────────────────────')
console.log(`Base URL: ${BASE_URL}`)
console.log(`Total: ${results.length} · OK: ${passed} · FAIL: ${failed}`)
console.log('─────────────────────────────────────────────')

process.exit(hadFailure ? 1 : 0)
