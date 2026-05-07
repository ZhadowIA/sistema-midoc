import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getServerEnv } from '@/lib/env'
import { getStripeClient } from '@/lib/stripe'
import { requireStaffApiAccess } from '@/lib/medicalApi'
import { captureError, logEvent } from '@/lib/observability'
import { can, PERMISSIONS } from '@/lib/permissions'
import { resolveSubscriptionScope } from '@/server/subscription/helpers'

export async function POST() {
  try {
    const access = await requireStaffApiAccess({
      allowedRoles: ['DOCTOR', 'ADMIN', 'CLINIC_ADMIN'],
    })
    if (access.response) return access.response
    const authUser = access.user

    if (!can(authUser, PERMISSIONS.BILLING_MANAGE)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const env = getServerEnv()
    if (env.PAYMENTS_PROVIDER !== 'STRIPE') {
      return NextResponse.json({
        error: 'Portal de facturación disponible solo con Stripe',
      }, { status: 409 })
    }

    const scope = await resolveSubscriptionScope(authUser.id)
    if (!scope) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const subscription = await prisma.doctorSubscription.findUnique({
      where: { doctorId: scope.billingDoctorId },
      select: { customerId: true, provider: true },
    })

    if (!subscription?.customerId || subscription.provider !== 'STRIPE') {
      return NextResponse.json({
        error: 'La cuenta aún no tiene un cliente Stripe asociado',
      }, { status: 409 })
    }

    const stripe = getStripeClient()
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.customerId,
      return_url: `${env.APP_BASE_URL}/medico/suscripcion`,
    })

    logEvent('info', 'billing.portal.session.created', {
      userId: authUser.id,
      billingDoctorId: scope.billingDoctorId,
      mode: scope.mode,
    })

    return NextResponse.json({ success: true, url: session.url })
  } catch (error: unknown) {
    captureError('billing.portal.error', error)
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
