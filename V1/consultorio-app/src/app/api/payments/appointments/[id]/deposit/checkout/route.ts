import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getServerEnv } from '@/lib/env'
import { getStripeClient } from '@/lib/stripe'
import { captureError, logEvent } from '@/lib/observability'

type RouteContext = {
  params: Promise<{ id: string }>
}

function toStripeMinorUnits(amount: unknown): number | null {
  if (amount === null || amount === undefined) return null
  const numeric = typeof amount === 'number' ? amount : Number(amount)
  if (!Number.isFinite(numeric) || numeric <= 0) return null
  return Math.round(numeric * 100)
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    const env = getServerEnv()
    const { id: appointmentId } = await context.params

    if (env.PAYMENTS_PROVIDER !== 'STRIPE') {
      return NextResponse.json(
        { error: 'El pago en línea no está habilitado para este entorno.' },
        { status: 503 }
      )
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: {
        id: true,
        doctorId: true,
        patientId: true,
        paymentStatus: true,
        depositRequiredAmount: true,
        depositDueAt: true,
        startTime: true,
        patient: { select: { email: true } },
        doctor: { select: { name: true } },
      },
    })

    if (!appointment) {
      return NextResponse.json({ error: 'Cita no encontrada.' }, { status: 404 })
    }

    if (appointment.paymentStatus === 'DEPOSIT_PAID') {
      return NextResponse.json({ error: 'El anticipo de esta cita ya fue pagado.' }, { status: 409 })
    }

    if (appointment.paymentStatus !== 'PAYMENT_PENDING') {
      return NextResponse.json({ error: 'Esta cita no requiere anticipo.' }, { status: 409 })
    }

    if (appointment.depositDueAt && appointment.depositDueAt <= new Date()) {
      return NextResponse.json({ error: 'El tiempo para pagar el anticipo expiró.' }, { status: 409 })
    }

    const unitAmount = toStripeMinorUnits(appointment.depositRequiredAmount)
    if (!unitAmount) {
      return NextResponse.json({ error: 'El monto del anticipo no es válido.' }, { status: 409 })
    }

    const stripe = getStripeClient()
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'mxn',
            unit_amount: unitAmount,
            ...(env.STRIPE_DEPOSIT_PRODUCT_ID
              ? { product: env.STRIPE_DEPOSIT_PRODUCT_ID }
              : {
                  product_data: {
                    name: 'MiDoc - Anticipo de cita',
                    description: `Anticipo para cita con ${appointment.doctor.name}`,
                  },
                }),
          },
        },
      ],
      customer_email: appointment.patient.email ?? undefined,
      success_url: `${env.APP_BASE_URL}/confirmacion?deposit=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.APP_BASE_URL}/confirmacion?deposit=cancel`,
      metadata: {
        kind: 'appointment_deposit',
        appointmentId: appointment.id,
        doctorId: appointment.doctorId,
        patientId: appointment.patientId,
      },
      payment_intent_data: {
        metadata: {
          kind: 'appointment_deposit',
          appointmentId: appointment.id,
          doctorId: appointment.doctorId,
          patientId: appointment.patientId,
        },
      },
    })

    if (!session.url) {
      return NextResponse.json({ error: 'Stripe no devolvió URL de checkout.' }, { status: 502 })
    }

    logEvent('info', 'billing.deposit_checkout.created', {
      appointmentId: appointment.id,
      doctorId: appointment.doctorId,
      stripeCheckoutSessionId: session.id,
      amount: unitAmount / 100,
    })

    return NextResponse.json({
      success: true,
      checkoutUrl: session.url,
      checkoutSessionId: session.id,
    })
  } catch (error: unknown) {
    captureError('billing.deposit_checkout.error', error)
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
