import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import Stripe from "stripe";
import prisma from "@/lib/prisma";
import { getServerEnv } from "@/lib/env";
import { captureError, logEvent } from "@/lib/observability";
import { getStripeClient } from "@/lib/stripe";
import { resolveCommercialPlanFromSubscription } from "@/lib/subscriptionCatalog";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

type MinimalPayload = {
  data?: Record<string, unknown>;
};

async function resolveDoctorId(payload: MinimalPayload): Promise<string | null> {
  const directDoctorId = asString(payload.data?.doctorId);
  if (directDoctorId) return directDoctorId;

  const customerId = asString(payload.data?.customerId);
  const externalSubscriptionId = asString(payload.data?.subscriptionId);

  if (!customerId && !externalSubscriptionId) return null;

  const subscription = await prisma.doctorSubscription.findFirst({
    where: {
      OR: [
        ...(customerId ? [{ customerId }] : []),
        ...(externalSubscriptionId ? [{ externalSubscriptionId }] : []),
      ],
    },
    select: { doctorId: true },
  });

  return subscription?.doctorId ?? null;
}

function mapStripePayload(event: Stripe.Event): MinimalPayload {
  const object = event.data.object as unknown as Record<string, unknown>;
  const metadata = (object.metadata ?? {}) as Record<string, unknown>;
  const items = (object.items as { data?: unknown } | undefined)?.data;
  const firstItem = Array.isArray(items) ? (items[0] as Record<string, unknown>) : null;
  const firstItemPrice = firstItem?.price && typeof firstItem.price === "object" ? firstItem.price : null;

  return {
    data: {
      doctorId: metadata?.doctorId,
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
  try {
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
      return NextResponse.json({ success: true, idempotent: true, status: existing.status });
    }

    const doctorId = await resolveDoctorId(payload);

    const createdEvent = await prisma.paymentWebhookEvent.create({
      data: {
        provider,
        eventId,
        eventType,
        status: "RECEIVED",
        payload: payload as Prisma.InputJsonValue,
      },
    });

    try {
      if (doctorId) {
        const existingSubscription = await prisma.doctorSubscription.findUnique({
          where: { doctorId },
          select: { planName: true, features: true },
        });
        const normalizedPlan = resolveCommercialPlanFromSubscription({
          planName: asString(payload.data?.planName) ?? existingSubscription?.planName,
          features: existingSubscription?.features,
        });

        if (
          eventType === "invoice.paid" ||
          eventType === "checkout.session.completed" ||
          eventType === "customer.subscription.created" ||
          eventType === "customer.subscription.updated"
        ) {
          const start = asString(payload.data?.currentPeriodStart);
          const end = asString(payload.data?.currentPeriodEnd);
          await prisma.doctorSubscription.upsert({
            where: { doctorId },
            create: {
              doctorId,
              provider,
              status: "ACTIVE",
              planName: normalizedPlan.legacyPlanName,
              amount: typeof payload.data?.amount === "number" ? payload.data.amount : null,
              currency: asString(payload.data?.currency) || "MXN",
              customerId: asString(payload.data?.customerId),
              externalSubscriptionId: asString(payload.data?.subscriptionId),
              externalPriceId: asString(payload.data?.priceId),
              paymentMethodLast4: asString(payload.data?.paymentMethodLast4),
              currentPeriodStart: start ? new Date(start) : null,
              currentPeriodEnd: end ? new Date(end) : null,
              cancelAtPeriodEnd: payload.data?.cancelAtPeriodEnd === true,
              canceledAt: payload.data?.cancelAtPeriodEnd === true ? new Date() : null,
              lastPaymentAt: eventType === "invoice.paid" ? new Date() : null,
              features: normalizedPlan.features as Prisma.InputJsonValue,
            },
            update: {
              provider,
              status: "ACTIVE",
              planName: normalizedPlan.legacyPlanName,
              customerId: asString(payload.data?.customerId) || undefined,
              externalSubscriptionId: asString(payload.data?.subscriptionId) || undefined,
              externalPriceId: asString(payload.data?.priceId) || undefined,
              paymentMethodLast4: asString(payload.data?.paymentMethodLast4) || undefined,
              currentPeriodStart: start ? new Date(start) : undefined,
              currentPeriodEnd: end ? new Date(end) : undefined,
              cancelAtPeriodEnd: payload.data?.cancelAtPeriodEnd === true,
              canceledAt: payload.data?.cancelAtPeriodEnd === true ? new Date() : null,
              lastPaymentAt: eventType === "invoice.paid" ? new Date() : undefined,
              features: normalizedPlan.features as Prisma.InputJsonValue,
            },
          });
        } else if (eventType === "invoice.payment_failed") {
          await prisma.doctorSubscription.update({
            where: { doctorId },
            data: { status: "PAST_DUE" },
          });
        } else if (eventType === "customer.subscription.deleted") {
          await prisma.doctorSubscription.update({
            where: { doctorId },
            data: {
              status: "CANCELED",
              cancelAtPeriodEnd: false,
              canceledAt: new Date(),
            },
          });
        }
      }

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

    return NextResponse.json({ success: true, idempotent: false });
  } catch (error: unknown) {
    captureError("billing.webhook.error", error);
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
