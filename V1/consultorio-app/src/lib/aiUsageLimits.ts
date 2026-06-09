export type AIUsageLimitStatus = 'OK' | 'SOFT_WARNING' | 'HARD_LIMIT'

export type AIUsageLimitDecision = {
  status: AIUsageLimitStatus
  used: number
  limit: number
  usagePct: number
  thresholdPct?: number
}

const SOFT_WARNING_THRESHOLDS = [0.7, 0.85, 0.95] as const

export function evaluateMonthlyUsageLimit(params: {
  used: number
  limit: number
}): AIUsageLimitDecision {
  const used = Math.max(0, params.used)
  const limit = Math.max(0, params.limit)

  if (limit <= 0) {
    return { status: 'HARD_LIMIT', used, limit, usagePct: 1 }
  }

  const usagePct = used / limit
  if (usagePct >= 1) {
    return { status: 'HARD_LIMIT', used, limit, usagePct }
  }

  const thresholdPct = [...SOFT_WARNING_THRESHOLDS].reverse().find((threshold) => usagePct >= threshold)
  if (thresholdPct) {
    return { status: 'SOFT_WARNING', used, limit, usagePct, thresholdPct }
  }

  return { status: 'OK', used, limit, usagePct }
}

