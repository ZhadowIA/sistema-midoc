export type DepositPaymentStatus =
  | 'NOT_REQUIRED'
  | 'PAYMENT_PENDING'
  | 'DEPOSIT_PAID'
  | 'PAYMENT_FAILED'

export type DepositRefundMode = 'FULL' | 'PARTIAL' | 'CREDIT' | 'FORFEIT'

type AppointmentType = 'NORMAL' | 'EXTENDED'

type DepositConfigInput = {
  depositEnabled?: boolean | null
  depositAmount?: number | null
  normalConsultationPrice?: number | null
  extendedConsultationPrice?: number | null
  depositExpiresInMinutes?: number | null
  cancellationWindowHours?: number | null
  cancellationRefundMode?: DepositRefundMode | null
  cancellationPartialRefundPct?: number | null
}

export type DepositRequirement = {
  paymentStatus: DepositPaymentStatus
  depositRequiredAmount: number | null
  depositDueAt: Date | null
  cancellationPolicySnapshot: {
    windowHours: number
    refundMode: DepositRefundMode
    partialRefundPct: number
  } | null
}

export type DepositCancellationOutcome = {
  refundMode: DepositRefundMode | null
  refundableAmount: number
  creditAmount: number
  forfeitedAmount: number
  withinWindow: boolean
}

function toMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function clampPct(value: number): number {
  if (value < 0) return 0
  if (value > 100) return 100
  return Math.round(value)
}

export function resolveDepositRequirement(
  config: DepositConfigInput,
  appointmentType: AppointmentType,
  input: {
    now?: Date
    appointmentStart: Date
  }
): DepositRequirement {
  const depositEnabled = config.depositEnabled === true
  const configuredDeposit = Number(config.depositAmount ?? 0)
  const expiresInMinutes = Math.max(5, Number(config.depositExpiresInMinutes ?? 30))
  const refundMode = config.cancellationRefundMode ?? 'FULL'
  const partialRefundPct = clampPct(Number(config.cancellationPartialRefundPct ?? 50))
  const windowHours = Math.max(0, Number(config.cancellationWindowHours ?? 24))
  const appointmentPrice =
    appointmentType === 'EXTENDED'
      ? Number(config.extendedConsultationPrice ?? config.normalConsultationPrice ?? 0)
      : Number(config.normalConsultationPrice ?? 0)

  if (!depositEnabled || !Number.isFinite(configuredDeposit) || configuredDeposit <= 0) {
    return {
      paymentStatus: 'NOT_REQUIRED',
      depositRequiredAmount: null,
      depositDueAt: null,
      cancellationPolicySnapshot: null,
    }
  }

  const normalizedPrice = Number.isFinite(appointmentPrice) && appointmentPrice > 0 ? appointmentPrice : configuredDeposit
  const normalizedDeposit = toMoney(Math.min(configuredDeposit, normalizedPrice))
  const now = input.now ?? new Date()
  const dueAtMs = Math.min(
    input.appointmentStart.getTime(),
    now.getTime() + expiresInMinutes * 60_000
  )

  return {
    paymentStatus: 'PAYMENT_PENDING',
    depositRequiredAmount: normalizedDeposit,
    depositDueAt: new Date(dueAtMs),
    cancellationPolicySnapshot: {
      windowHours,
      refundMode,
      partialRefundPct,
    },
  }
}

export function resolveDepositCancellationOutcome(input: {
  appointmentStart: Date
  cancelledAt?: Date
  depositPaidAmount?: number | null
  policySnapshot?: {
    windowHours?: number | null
    refundMode?: DepositRefundMode | null
    partialRefundPct?: number | null
  } | null
}): DepositCancellationOutcome {
  const cancelledAt = input.cancelledAt ?? new Date()
  const paidAmount = toMoney(Number(input.depositPaidAmount ?? 0))
  const refundMode = input.policySnapshot?.refundMode ?? null
  const windowHours = Math.max(0, Number(input.policySnapshot?.windowHours ?? 0))
  const partialRefundPct = clampPct(Number(input.policySnapshot?.partialRefundPct ?? 50))
  const withinWindow =
    input.appointmentStart.getTime() - cancelledAt.getTime() >= windowHours * 60 * 60 * 1000

  if (!refundMode || paidAmount <= 0) {
    return {
      refundMode,
      refundableAmount: 0,
      creditAmount: 0,
      forfeitedAmount: 0,
      withinWindow,
    }
  }

  if (withinWindow) {
    return {
      refundMode,
      refundableAmount: paidAmount,
      creditAmount: 0,
      forfeitedAmount: 0,
      withinWindow,
    }
  }

  if (refundMode === 'FULL') {
    return {
      refundMode,
      refundableAmount: paidAmount,
      creditAmount: 0,
      forfeitedAmount: 0,
      withinWindow,
    }
  }

  if (refundMode === 'PARTIAL') {
    const refundableAmount = toMoney((paidAmount * partialRefundPct) / 100)
    return {
      refundMode,
      refundableAmount,
      creditAmount: 0,
      forfeitedAmount: toMoney(paidAmount - refundableAmount),
      withinWindow,
    }
  }

  if (refundMode === 'CREDIT') {
    return {
      refundMode,
      refundableAmount: 0,
      creditAmount: paidAmount,
      forfeitedAmount: 0,
      withinWindow,
    }
  }

  return {
    refundMode,
    refundableAmount: 0,
    creditAmount: 0,
    forfeitedAmount: paidAmount,
    withinWindow,
  }
}
