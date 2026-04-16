export type RateLimitOptions = {
  key: string
  limit: number
  windowMs: number
  identifier?: string
}

type Bucket = {
  count: number
  resetAt: number
}

export type RateLimitResult = {
  ok: boolean
  remaining: number
  retryAfterSec: number
}

const GLOBAL_BUCKET_KEY = '__midocRateLimitBuckets'
const MAX_BUCKETS = 10_000

function getBuckets(): Map<string, Bucket> {
  const globalScope = globalThis as typeof globalThis & {
    [GLOBAL_BUCKET_KEY]?: Map<string, Bucket>
  }

  if (!globalScope[GLOBAL_BUCKET_KEY]) {
    globalScope[GLOBAL_BUCKET_KEY] = new Map<string, Bucket>()
  }

  return globalScope[GLOBAL_BUCKET_KEY]
}

function pruneExpiredBuckets(buckets: Map<string, Bucket>, now: number) {
  if (buckets.size < MAX_BUCKETS) return
  for (const [bucketKey, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(bucketKey)
    }
  }
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

export function checkRateLimit(request: Request, options: RateLimitOptions): RateLimitResult {
  const now = Date.now()
  const buckets = getBuckets()
  pruneExpiredBuckets(buckets, now)

  const ip = getClientIp(request)
  const identity = options.identifier ? `${ip}:${options.identifier}` : ip
  const bucketKey = `${options.key}:${identity}`
  const current = buckets.get(bucketKey)

  if (!current || current.resetAt <= now) {
    buckets.set(bucketKey, {
      count: 1,
      resetAt: now + options.windowMs,
    })
    return {
      ok: true,
      remaining: Math.max(options.limit - 1, 0),
      retryAfterSec: Math.ceil(options.windowMs / 1000),
    }
  }

  current.count += 1
  buckets.set(bucketKey, current)

  if (current.count > options.limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSec: Math.max(Math.ceil((current.resetAt - now) / 1000), 1),
    }
  }

  return {
    ok: true,
    remaining: Math.max(options.limit - current.count, 0),
    retryAfterSec: Math.max(Math.ceil((current.resetAt - now) / 1000), 1),
  }
}

