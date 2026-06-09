import { getSecurityStateStore } from "@/lib/securityStateStore";

export type RateLimitOptions = {
  key: string
  limit: number
  windowMs: number
  identifier?: string
}

export type RateLimitBucket = {
  count: number
  resetAt: number
}

export type RateLimitResult = {
  ok: boolean
  remaining: number
  retryAfterSec: number
}

function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const firstIp = forwarded.split(',')[0]?.trim()
    if (firstIp) return firstIp
  }

  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp.trim()

  return 'unknown'
}

export async function checkRateLimit(request: Request, options: RateLimitOptions): Promise<RateLimitResult> {
  const now = Date.now()
  const store = getSecurityStateStore()

  const ip = getClientIp(request)
  const identity = options.identifier ? `${ip}:${options.identifier}` : ip
  const bucketKey = `${options.key}:${identity}`
  const updated = await store.update<RateLimitBucket>(bucketKey, now, (current) => {
    const bucket = current?.value;
    if (!bucket || bucket.resetAt <= now) {
      return {
        kind: "set",
        value: { count: 1, resetAt: now + options.windowMs },
        expiresAt: now + options.windowMs,
      };
    }

    return {
      kind: "set",
      value: { ...bucket, count: bucket.count + 1 },
      expiresAt: bucket.resetAt,
    };
  });

  const current = updated?.value;
  if (!current) {
    return {
      ok: true,
      remaining: Math.max(options.limit - 1, 0),
      retryAfterSec: Math.ceil(options.windowMs / 1000),
    };
  }

  if (current.count > options.limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSec: Math.max(Math.ceil((current.resetAt - now) / 1000), 1),
    };
  }

  return {
    ok: true,
    remaining: Math.max(options.limit - current.count, 0),
    retryAfterSec: Math.max(Math.ceil((current.resetAt - now) / 1000), 1),
  }
}

