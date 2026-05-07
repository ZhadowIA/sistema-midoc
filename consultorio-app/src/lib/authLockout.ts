import { getSecurityStateStore } from "@/lib/securityStateStore";

export type AuthLockoutStatus = {
  locked: boolean
  remainingMs: number
  failedAttempts: number
}

type AuthAttemptBucket = {
  failedAttempts: number
  firstFailedAt: number
  lockedUntil: number
}

const FAILURE_WINDOW_MS = 30 * 60 * 1000
const LOCKOUT_THRESHOLDS = [
  { attempts: 5, lockMs: 5 * 60 * 1000 },
  { attempts: 8, lockMs: 15 * 60 * 1000 },
  { attempts: 12, lockMs: 60 * 60 * 1000 },
]

function normalizeIdentity(identity: string): string {
  return identity.trim().toLowerCase() || 'anonymous'
}

function buildLockoutKey(scope: string, identity: string) {
  return `auth-lockout:${scope}:${normalizeIdentity(identity)}`
}

export async function getAuthLockoutStatus(scope: string, identity: string, nowMs = Date.now()): Promise<AuthLockoutStatus> {
  const key = buildLockoutKey(scope, identity)
  const bucket = (await getSecurityStateStore().get<AuthAttemptBucket>(key, nowMs))?.value
  if (!bucket) return { locked: false, remainingMs: 0, failedAttempts: 0 }

  if (bucket.firstFailedAt + FAILURE_WINDOW_MS <= nowMs && bucket.lockedUntil <= nowMs) {
    await getSecurityStateStore().delete(key)
    return { locked: false, remainingMs: 0, failedAttempts: 0 }
  }

  if (bucket.lockedUntil > nowMs) {
    return {
      locked: true,
      remainingMs: bucket.lockedUntil - nowMs,
      failedAttempts: bucket.failedAttempts,
    }
  }

  return { locked: false, remainingMs: 0, failedAttempts: bucket.failedAttempts }
}

export async function recordAuthFailure(scope: string, identity: string, nowMs = Date.now()): Promise<AuthLockoutStatus> {
  const key = buildLockoutKey(scope, identity)
  const store = getSecurityStateStore()
  const updated = await store.update<AuthAttemptBucket>(key, nowMs, (current) => {
    const existing = current?.value
    const bucket =
      existing && existing.firstFailedAt + FAILURE_WINDOW_MS > nowMs
        ? existing
        : { failedAttempts: 0, firstFailedAt: nowMs, lockedUntil: 0 }

    bucket.failedAttempts += 1

    const threshold = [...LOCKOUT_THRESHOLDS].reverse().find((item) => bucket.failedAttempts >= item.attempts)
    if (threshold) {
      bucket.lockedUntil = nowMs + threshold.lockMs
    }

    const expiresAt = Math.max(
      bucket.firstFailedAt + FAILURE_WINDOW_MS,
      bucket.lockedUntil || 0,
      nowMs + FAILURE_WINDOW_MS,
    )

    return {
      kind: "set",
      value: bucket,
      expiresAt,
    }
  })

  if (!updated) return { locked: false, remainingMs: 0, failedAttempts: 0 }
  return getAuthLockoutStatus(scope, identity, nowMs)
}

export async function clearAuthFailures(scope: string, identity: string): Promise<void> {
  await getSecurityStateStore().delete(buildLockoutKey(scope, identity))
}

export function authLockedResponseBody(status: AuthLockoutStatus) {
  return {
    error: 'Cuenta temporalmente bloqueada por intentos fallidos. Intenta nuevamente más tarde.',
    retryAfterSec: Math.max(Math.ceil(status.remainingMs / 1000), 1),
  }
}
