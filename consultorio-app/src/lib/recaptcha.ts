import { getServerEnv } from './env'

export type RecaptchaVerificationResult =
  | { ok: true; score: number | null; reason: 'verified' | 'disabled' }
  | { ok: false; score: number | null; reason: 'missing-token' | 'low-score' | 'invalid' | 'network-error' }

export interface VerifyRecaptchaOptions {
  expectedAction?: string
  fetchImpl?: typeof fetch
  nowMs?: number
}

interface GoogleRecaptchaResponse {
  success: boolean
  score?: number
  action?: string
  challenge_ts?: string
  hostname?: string
  'error-codes'?: string[]
}

const GOOGLE_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify'

export async function verifyRecaptchaToken(
  token: string | null | undefined,
  options: VerifyRecaptchaOptions = {}
): Promise<RecaptchaVerificationResult> {
  const env = getServerEnv()
  const secret = env.RECAPTCHA_V3_SECRET

  if (!secret) {
    return { ok: true, score: null, reason: 'disabled' }
  }

  if (!token || token.trim().length === 0) {
    return { ok: false, score: null, reason: 'missing-token' }
  }

  const fetchImpl = options.fetchImpl ?? fetch
  let response: Response
  try {
    response = await fetchImpl(GOOGLE_VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }).toString(),
    })
  } catch {
    return { ok: false, score: null, reason: 'network-error' }
  }

  if (!response.ok) {
    return { ok: false, score: null, reason: 'network-error' }
  }

  let payload: GoogleRecaptchaResponse
  try {
    payload = (await response.json()) as GoogleRecaptchaResponse
  } catch {
    return { ok: false, score: null, reason: 'invalid' }
  }

  if (!payload.success) {
    return { ok: false, score: payload.score ?? null, reason: 'invalid' }
  }

  if (options.expectedAction && payload.action && payload.action !== options.expectedAction) {
    return { ok: false, score: payload.score ?? null, reason: 'invalid' }
  }

  const score = typeof payload.score === 'number' ? payload.score : null
  if (score !== null && score < env.RECAPTCHA_V3_MIN_SCORE) {
    return { ok: false, score, reason: 'low-score' }
  }

  return { ok: true, score, reason: 'verified' }
}
