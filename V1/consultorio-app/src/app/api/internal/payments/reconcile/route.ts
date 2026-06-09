import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerEnv } from "@/lib/env";
import { captureError, emitMetric, logEvent } from "@/lib/observability";
import { processWebhookBusinessEvent, type MinimalPayload } from "@/server/payments/webhookProcessor";

const MAX_LIMIT = 200;

export async function POST(request: Request) {
  try {
    const env = getServerEnv();
    const expectedSecret = env.NOTIFICATION_CRON_SECRET;
    if (!expectedSecret) {
      return NextResponse.json({ error: "NOTIFICATION_CRON_SECRET no está configurado" }, { status: 503 });
    }

    const providedSecret = request.headers.get("x-notification-secret");
    if (providedSecret !== expectedSecret) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const url = new URL(request.url);
    const requested = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isFinite(requested) ? Math.min(Math.max(1, requested), MAX_LIMIT) : 50;

    const events = await prisma.paymentWebhookEvent.findMany({
      where: {
        provider: "STRIPE",
        status: { in: ["FAILED", "RECEIVED"] },
      },
      orderBy: { createdAt: "asc" },
      take: limit,
      select: {
        id: true,
        provider: true,
        eventType: true,
        payload: true,
      },
    });

    let processed = 0;
    let failed = 0;

    for (const event of events) {
      try {
        const payload = (event.payload ?? {}) as MinimalPayload;
        await processWebhookBusinessEvent({
          provider: "STRIPE",
          eventType: event.eventType,
          payload,
        });

        await prisma.paymentWebhookEvent.update({
          where: { id: event.id },
          data: {
            status: "PROCESSED",
            processedAt: new Date(),
            processingError: null,
          },
        });
        processed += 1;
      } catch (error: unknown) {
        await prisma.paymentWebhookEvent.update({
          where: { id: event.id },
          data: {
            status: "FAILED",
            processingError: error instanceof Error ? error.message.slice(0, 1000) : String(error),
          },
        });
        failed += 1;
      }
    }

    emitMetric({ domain: "agenda", metric: "payments_webhook_reconcile_run", tags: { total: events.length, processed, failed } });
    logEvent("info", "billing.webhook.reconcile.completed", { total: events.length, processed, failed, limit });

    return NextResponse.json({
      success: true,
      total: events.length,
      processed,
      failed,
      processedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    captureError("billing.webhook.reconcile.error", error);
    emitMetric({ domain: "agenda", metric: "payments_webhook_reconcile_error" });
    const message = error instanceof Error ? error.message : "Error interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
