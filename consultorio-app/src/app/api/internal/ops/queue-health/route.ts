import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getServerEnv } from '@/lib/env'
import { captureError, logEvent } from '@/lib/observability'

const PENDING_AGE_WARN_MIN = 15
const PENDING_AGE_CRIT_MIN = 60
const FAILED_WARN_COUNT = 10
const WEBHOOK_ERROR_WARN_COUNT = 5

export async function GET(request: Request) {
  try {
    const env = getServerEnv()
    const expectedSecret = env.NOTIFICATION_CRON_SECRET
    if (!expectedSecret) {
      return NextResponse.json(
        { error: 'NOTIFICATION_CRON_SECRET no está configurado' },
        { status: 503 }
      )
    }
    const providedSecret = request.headers.get('x-notification-secret')
    if (providedSecret !== expectedSecret) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const now = Date.now()

    const [pendingCount, failedCount, oldestPending, webhookErrors, webhookReceivedPending, overdueDeposits] = await Promise.all([
      prisma.notification.count({ where: { status: 'PENDING' } }),
      prisma.notification.count({ where: { status: 'FAILED' } }),
      prisma.notification.findFirst({
        where: { status: 'PENDING' },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      prisma.paymentWebhookEvent.count({
        where: { status: { not: 'PROCESSED' }, processingError: { not: null } },
      }),
      prisma.paymentWebhookEvent.count({
        where: { status: 'RECEIVED' },
      }),
      prisma.appointment.count({
        where: {
          paymentStatus: 'PAYMENT_PENDING',
          depositDueAt: { lte: new Date() },
          status: { not: 'CANCELLED' },
        },
      }),
    ])

    const oldestPendingAgeMin = oldestPending
      ? Math.floor((now - oldestPending.createdAt.getTime()) / 60000)
      : 0

    const signals: Array<{ level: 'warn' | 'critical'; signal: string; detail: unknown }> = []
    if (oldestPendingAgeMin >= PENDING_AGE_CRIT_MIN) {
      signals.push({ level: 'critical', signal: 'notifications.pending_backlog', detail: { oldestPendingAgeMin } })
    } else if (oldestPendingAgeMin >= PENDING_AGE_WARN_MIN) {
      signals.push({ level: 'warn', signal: 'notifications.pending_slow', detail: { oldestPendingAgeMin } })
    }
    if (failedCount >= FAILED_WARN_COUNT) {
      signals.push({ level: 'warn', signal: 'notifications.failed_high', detail: { failedCount } })
    }
    if (webhookErrors >= WEBHOOK_ERROR_WARN_COUNT) {
      signals.push({ level: 'warn', signal: 'payments.webhook_errors', detail: { webhookErrors } })
    }
    if (webhookReceivedPending > 0) {
      signals.push({ level: 'warn', signal: 'payments.webhook_received_pending', detail: { webhookReceivedPending } })
    }
    if (overdueDeposits > 0) {
      signals.push({ level: 'warn', signal: 'payments.deposit_overdue', detail: { overdueDeposits } })
    }

    for (const s of signals) {
      logEvent(s.level === 'critical' ? 'error' : 'warn', `ops.queue_health.${s.signal}`, s.detail as Record<string, unknown>)
    }

    const status = signals.some((s) => s.level === 'critical')
      ? 'critical'
      : signals.length
      ? 'warn'
      : 'ok'

    return NextResponse.json({
      status,
      timestamp: new Date().toISOString(),
      notifications: {
        pending: pendingCount,
        failed: failedCount,
        oldestPendingAgeMin,
      },
      payments: {
        webhookErrors,
        webhookReceivedPending,
        overdueDeposits,
      },
      signals,
      thresholds: {
        pendingAgeWarnMin: PENDING_AGE_WARN_MIN,
        pendingAgeCritMin: PENDING_AGE_CRIT_MIN,
        failedWarnCount: FAILED_WARN_COUNT,
        webhookErrorWarnCount: WEBHOOK_ERROR_WARN_COUNT,
      },
    })
  } catch (error: unknown) {
    captureError('ops.queue_health.error', error)
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
