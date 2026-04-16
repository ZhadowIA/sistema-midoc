import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { timingSafeEqual } from "crypto";
import prisma from "@/lib/prisma";
import { getServerEnv } from "@/lib/env";
import { captureError, logEvent } from "@/lib/observability";

type WebhookPayload = {
  id?: string;
  type?: string;
  createdAt?: string;
  data?: Record<string, unknown>;
};

function safeCompare(secret: string, provided: string): boolean {
  const secretBuffer = Buffer.from(secret, "utf-8");
  const providedBuffer = Buffer.from(provided, "utf-8");
  if (secretBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(secretBuffer, providedBuffer);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function resolveDoctorId(payload: WebhookPayload): Promise<string | null> {
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

export async function POST(request: Request) {
  try {
    const env = getServerEnv();
    if (!env.PAYMENTS_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "PAYMENTS_WEBHOOK_SECRET no configurado" }, { status: 503 });
    }

    const signature = request.headers.get("x-webhook-signature") || "";
    const provider = (request.headers.get("x-payments-provider") || env.PAYMENTS_PROVIDER || "MOCK").toUpperCase();

    if (!safeCompare(env.PAYMENTS_WEBHOOK_SECRET, signature)) {
      return NextResponse.json({ error: "Firma inválida" }, { status: 401 });
    }

    const payload = (await request.json()) as WebhookPayload;
    const eventId = asString(payload.id) || asString(request.headers.get("x-webhook-event-id")) || "";
    const eventType = asString(payload.type) || "unknown";

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
        if (eventType === "invoice.paid" || eventType === "subscription.active") {
          const start = asString(payload.data?.currentPeriodStart);
          const end = asString(payload.data?.currentPeriodEnd);
          await prisma.doctorSubscription.upsert({
            where: { doctorId },
            create: {
              doctorId,
              provider,
              status: "ACTIVE",
              planName: asString(payload.data?.planName) || "Plan Mensual MiDoc",
              amount: typeof payload.data?.amount === "number" ? payload.data.amount : null,
              currency: asString(payload.data?.currency) || "MXN",
              customerId: asString(payload.data?.customerId),
              externalSubscriptionId: asString(payload.data?.subscriptionId),
              externalPriceId: asString(payload.data?.priceId),
              paymentMethodLast4: asString(payload.data?.paymentMethodLast4),
              currentPeriodStart: start ? new Date(start) : null,
              currentPeriodEnd: end ? new Date(end) : null,
              cancelAtPeriodEnd: false,
              canceledAt: null,
              lastPaymentAt: new Date(),
            },
            update: {
              provider,
              status: "ACTIVE",
              customerId: asString(payload.data?.customerId) || undefined,
              externalSubscriptionId: asString(payload.data?.subscriptionId) || undefined,
              externalPriceId: asString(payload.data?.priceId) || undefined,
              paymentMethodLast4: asString(payload.data?.paymentMethodLast4) || undefined,
              currentPeriodStart: start ? new Date(start) : undefined,
              currentPeriodEnd: end ? new Date(end) : undefined,
              cancelAtPeriodEnd: false,
              canceledAt: null,
              lastPaymentAt: new Date(),
            },
          });
        } else if (eventType === "invoice.payment_failed") {
          await prisma.doctorSubscription.update({
            where: { doctorId },
            data: { status: "PAST_DUE" },
          });
        } else if (eventType === "subscription.canceled") {
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
