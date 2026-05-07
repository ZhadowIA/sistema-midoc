import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getServerEnv } from '@/lib/env'
import { getStripeClient } from '@/lib/stripe'
import { requireStaffApiAccess } from '@/lib/medicalApi'
import { captureError } from '@/lib/observability'
import { can, PERMISSIONS } from '@/lib/permissions'
import { resolveSubscriptionScope } from '@/server/subscription/helpers'

export async function GET() {
  try {
    const access = await requireStaffApiAccess({
      allowedRoles: ['DOCTOR', 'ADMIN', 'CLINIC_ADMIN'],
    })
    if (access.response) return access.response
    const authUser = access.user

    if (!can(authUser, PERMISSIONS.BILLING_READ)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const scope = await resolveSubscriptionScope(authUser.id)
    if (!scope) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const subscription = await prisma.doctorSubscription.findUnique({
      where: { doctorId: scope.billingDoctorId },
      select: { provider: true, customerId: true },
    })

    if (!subscription) {
      return NextResponse.json({ invoices: [] })
    }

    const env = getServerEnv()
    if (env.PAYMENTS_PROVIDER === 'STRIPE' && subscription.provider === 'STRIPE') {
      if (!subscription.customerId) {
        return NextResponse.json({ invoices: [] })
      }

      const stripe = getStripeClient()
      const invoices = await stripe.invoices.list({
        customer: subscription.customerId,
        limit: 20,
      })

      return NextResponse.json({
        invoices: invoices.data.map((invoice) => ({
          id: invoice.id,
          number: invoice.number,
          status: invoice.status,
          amountPaid: invoice.amount_paid,
          amountDue: invoice.amount_due,
          currency: invoice.currency,
          hostedInvoiceUrl: invoice.hosted_invoice_url,
          invoicePdf: invoice.invoice_pdf,
          created: invoice.created,
        })),
      })
    }

    const events = await prisma.paymentWebhookEvent.findMany({
      where: {
        provider: subscription.provider,
        eventType: { in: ['invoice.paid', 'invoice.payment_failed'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        eventId: true,
        eventType: true,
        status: true,
        payload: true,
        createdAt: true,
      },
    })

    return NextResponse.json({
      invoices: events.map((event) => ({
        id: event.id,
        number: event.eventId,
        status: event.status,
        eventType: event.eventType,
        created: Math.floor(event.createdAt.getTime() / 1000),
        payload: event.payload,
      })),
    })
  } catch (error: unknown) {
    captureError('billing.invoices.error', error)
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
