import prisma from '@/lib/prisma'
import { getCommercialCatalog, resolveCommercialPlanFromSubscription } from '@/lib/subscriptionCatalog'
import { asString, buildBillingStatus, buildSeatSummary, readPayloadData, resolveSubscriptionScope } from '@/server/subscription/helpers'

export async function getSubscriptionOverview(userId: string) {
  const scope = await resolveSubscriptionScope(userId)
  if (!scope) return null

  const subscription = await prisma.doctorSubscription.findUnique({
    where: { doctorId: scope.billingDoctorId },
  })
  const seats = await buildSeatSummary(scope)
  const commercialPlan = subscription
    ? resolveCommercialPlanFromSubscription({
      planName: subscription.planName,
      features: subscription.features,
    })
    : null

  const billingEvents = subscription
    ? await prisma.paymentWebhookEvent.findMany({
      where: {
        provider: subscription.provider,
        eventType: {
          in: [
            'checkout.session.completed',
            'invoice.paid',
            'invoice.payment_failed',
            'customer.subscription.created',
            'customer.subscription.updated',
            'customer.subscription.deleted',
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        eventId: true,
        eventType: true,
        status: true,
        payload: true,
        processingError: true,
        processedAt: true,
        createdAt: true,
      },
    })
    : []

  const paymentHistory = billingEvents
    .map((event) => {
      const data = readPayloadData(event.payload)
      return {
        id: event.id,
        eventId: event.eventId,
        eventType: event.eventType,
        status: event.status,
        amount: typeof data.amount === 'number' ? data.amount : null,
        currency: asString(data.currency) ?? subscription?.currency ?? 'MXN',
        customerId: asString(data.customerId),
        subscriptionId: asString(data.subscriptionId),
        priceId: asString(data.priceId),
        paymentMethodLast4: asString(data.paymentMethodLast4),
        processedAt: event.processedAt?.toISOString() ?? null,
        createdAt: event.createdAt.toISOString(),
        processingError: event.processingError,
      }
    })
    .filter((event) => {
      if (!subscription) return false
      return Boolean(
        (subscription.customerId && event.customerId === subscription.customerId) ||
        (subscription.externalSubscriptionId && event.subscriptionId === subscription.externalSubscriptionId) ||
        (subscription.externalPriceId && event.priceId === subscription.externalPriceId),
      )
    })
    .slice(0, 10)

  return {
    subscription,
    scope,
    seats,
    commercialPlan,
    billingStatus: buildBillingStatus(subscription),
    paymentHistory,
    catalog: getCommercialCatalog(),
  }
}

