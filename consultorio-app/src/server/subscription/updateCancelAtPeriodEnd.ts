import prisma from '@/lib/prisma'
import { getServerEnv } from '@/lib/env'
import { getStripeClient } from '@/lib/stripe'
import { resolveSubscriptionScope } from '@/server/subscription/helpers'
import { AuditLogService } from '@/services/AuditLogService'

export async function updateCancelAtPeriodEnd(
  userId: string,
  cancelAtPeriodEnd: boolean,
  context?: { actorUserId?: string | null; ipAddress?: string | null; userAgent?: string | null },
) {
  const scope = await resolveSubscriptionScope(userId)
  if (!scope) return null

  const subscription = await prisma.doctorSubscription.findUnique({
    where: { doctorId: scope.billingDoctorId },
  })
  if (!subscription) return { scope, subscription: null }

  const updated = await prisma.doctorSubscription.update({
    where: { doctorId: scope.billingDoctorId },
    data: {
      cancelAtPeriodEnd,
      canceledAt: cancelAtPeriodEnd ? new Date() : null,
    },
  })

  const env = getServerEnv()
  if (
    env.PAYMENTS_PROVIDER === 'STRIPE' &&
    updated.provider === 'STRIPE' &&
    updated.externalSubscriptionId
  ) {
    const stripe = getStripeClient()
    await stripe.subscriptions.update(updated.externalSubscriptionId, { cancel_at_period_end: cancelAtPeriodEnd })
  }

  await AuditLogService.safeLog({
    doctorId: scope.billingDoctorId,
    actorUserId: context?.actorUserId ?? userId,
    ipAddress: context?.ipAddress ?? null,
    userAgent: context?.userAgent ?? null,
    action: cancelAtPeriodEnd
      ? 'billing.subscription.cancel_scheduled'
      : 'billing.subscription.cancel_reverted',
    metadata: {
      scopeMode: scope.mode,
      cancelAtPeriodEnd,
      currentPeriodEnd: updated.currentPeriodEnd?.toISOString() ?? null,
      provider: updated.provider,
      externalSubscriptionId: updated.externalSubscriptionId,
      commercialStatus: updated.status,
    },
  })

  return { scope, subscription: updated }
}
