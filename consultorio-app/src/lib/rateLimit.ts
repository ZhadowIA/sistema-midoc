import { NextResponse } from 'next/server'
import { checkRateLimit, type RateLimitResult } from './rateLimitCore'

export { checkRateLimit }

export function rateLimitExceededResponse(result: RateLimitResult) {
  return NextResponse.json(
    {
      error: 'Demasiadas solicitudes. Intenta nuevamente en unos segundos.',
      retryAfterSec: result.retryAfterSec,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(result.retryAfterSec),
        'X-RateLimit-Remaining': String(result.remaining),
      },
    }
  )
}
