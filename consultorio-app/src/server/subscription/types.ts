export type SubscriptionScope = {
  mode: 'DOCTOR' | 'CLINIC'
  clinicId: string | null
  billingDoctorId: string
}

export type BillingStatus = {
  label: string
  severity: 'success' | 'warning' | 'danger' | 'neutral'
  message: string
  gracePeriodEndsAt: string | null
  commercialState:
    | 'ACTIVE'
    | 'ACTIVE_CANCEL_SCHEDULED'
    | 'PAST_DUE_GRACE'
    | 'PAST_DUE_SUSPENDED'
    | 'PENDING'
    | 'CANCELED'
    | 'NO_SUBSCRIPTION'
  appAccess: boolean
  aiAccess: boolean
  actionLabel: string | null
  actionHint: string | null
}
