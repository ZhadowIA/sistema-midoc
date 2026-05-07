import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import Stripe from "stripe";
import prisma from "@/lib/prisma";
import { getServerEnv } from "@/lib/env";
import { captureError, emitMetric, logEvent, withEndpointObservability } from "@/lib/observability";
import { getStripeClient } from "@/lib/stripe";
import { processWebhookBusinessEvent, type MinimalPayload } from "@/server/payments/webhookProcessor";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function mapStripePayload(event: Stripe.Event): MinimalPayload {
  const object = event.data.object as unknown as Record<string, unknown>;
  const metadata = (object.metadata ?? {}) as Record<string, unknown>;
  const items = (object.items as { data?: unknown } | undefined)?.data;
  const firstItem = Array.isArray(items) ? (items[0] as Record<string, unknown>) : null;
  const firstItemPrice = firstItem?.price && typeof firstItem.price === "object" ? firstItem.price : null;

  return {
    data: {
      kind: metadata?.kind,
      doctorId: metadata?.doctorId,
      appointmentId: metadata?.appointmentId,
      patientId: metadata?.patientId,
      checkoutSessionId: "id" in object && event.type === "checkout.session.completed"
        ? asString(object.id)
        : null,
      paymentIntentId: "payment_intent" in object ? asString(object.payment_intent) : null,
      customerId: "customer" in object ? asString(object.customer) : null,
      subscriptionId: "id" in object && event.type.startsWith("customer.subscription")
        ? asString(object.id)
        : "subscription" in object
          ? asString(object.subscription)
          : null,
      priceId:
        firstItemPrice && "id" in firstItemPrice ? asString(firstItemPrice.id) : null,
      amount:
        "amount_paid" in object && typeof object.amount_paid === "number"
          ? object.amount_paid / 100
          : "amount_total" in object && typeof object.amount_total === "number"
            ? object.amount_total / 100
          : "plan" in object && object.plan && typeof object.plan === "object" && "amount" in object.plan
            ? typeof object.plan.amount === "number"
              ? object.plan.amount / 100
              : null
            : null,
      currency:
        "currency" in object && typeof object.currency === "string" ? object.currency.toUpperCase() : "MXN",
      paymentMethodLast4:
        "payment_method_details" in object &&
        object.payment_method_details &&
        typeof object.payment_method_details === "object" &&
        "card" in object.payment_method_details &&
        object.payment_method_details.card &&
        typeof object.payment_method_details.card === "object" &&
        "last4" in object.payment_method_details.card
          ? asString(object.payment_method_details.card.last4)
          : null,
      currentPeriodStart:
        "current_period_start" in object && typeof object.current_period_start === "number"
          ? new Date(object.current_period_start * 1000).toISOString()
          : null,
      currentPeriodEnd:
        "current_period_end" in object && typeof object.current_period_end === "number"
          ? new Date(object.current_period_end * 1000).toISOString()
          : null,
      cancelAtPeriodEnd:
        "cancel_at_period_end" in object && typeof object.cancel_at_period_end === "boolean"
          ? object.cancel_at_period_end
          : false,
      planName:
        asString(metadata?.displayName) ??
        (firstItemPrice && "nickname" in firstItemPrice ? asString(firstItemPrice.nickname) : "Plan Integral"),
    },
  };
}

export async function POST(request: Request) {
  return withEndpointObservability({ endpoint: "api.payments.webhook", method: "POST" }, async () => {
    try {
      emitMetric({ domain: "agenda", metric: "payments_webhook_received" });
      const env = getServerEnv();
      if (env.PAYMENTS_PROVIDER !== "STRIPE") {
        return NextResponse.json({ error: "Webhook habilitado solo para STRIPE" }, { status: 400 });
      }

      if (!env.STRIPE_WEBHOOK_SECRET) {
        return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET no configurado" }, { status: 503 });
      }

    const stripe = getStripeClient();
    const signature = request.headers.get("stripe-signature");
    if (!signature) return NextResponse.json({ error: "Firma inválida" }, { status: 401 });

    const rawBody = await request.text();
    let stripeEvent: Stripe.Event;
    try {
      stripeEvent = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
    } catch (signatureError) {
      return NextResponse.json(
        { error: signatureError instanceof Error ? signatureError.message : "Firma inválida" },
        { status: 401 },
      );
    }

    const provider = "STRIPE";
    const payload = mapStripePayload(stripeEvent);
    const eventId = stripeEvent.id;
    const eventType = stripeEvent.type;

    if (!eventId) {
      return NextResponse.json({ error: "Evento sin id" }, { status: 400 });
    }

    const existing = await prisma.paymentWebhookEvent.findUnique({
      where: { provider_eventId: { provider, eventId } },
      select: { id: true, status: true },
    });

    if (existing) {
      logEvent("info", "billing.webhook.idempotent_hit", { provider, eventId, status: existing.status });
      emitMetric({ domain: "agenda", metric: "payments_webhook_idempotent_hit" });
      return NextResponse.json({ success: true, idempotent: true, status: existing.status });
    }

      const createdEvent = await prisma.paymentWebhookEvent.create({
      data: {
        provider,
        eventId,
        eventType,
        status: "RECEIVED",
        payload: payload as Prisma.InputJsonValue,
      },
    });

    let doctorId: string | null = null;
    try {
      const processing = await processWebhookBusinessEvent({ provider, eventType, payload });
      doctorId = processing.doctorId;

      await prisma.paymentWebhookEvent.update({
        where: { id: createdEvent.id },
        data: {
          status: "PROCESSED",
          processedAt: new Date(),
        },
      });
    } catch (processingError) {
      await prisma.paymentWebhookEvent.update({
        where: { id: createdEvent.id },
        data: {
          status: "FAILED",
          processingError:
            processingError instanceof Error ? processingError.message.slice(0, 1000) : String(processingError),
        },
      });
      throw processingError;
    }

      logEvent("info", "billing.webhook.processed", { provider, eventId, eventType, doctorId });
      emitMetric({ domain: "agenda", metric: "payments_webhook_processed", tags: { eventType } });

      return NextResponse.json({ success: true, idempotent: false });
    } catch (error: unknown) {
      captureError("billing.webhook.error", error);
      emitMetric({ domain: "agenda", metric: "payments_webhook_error" });
      const message = error instanceof Error ? error.message : "Error interno";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  });
}
