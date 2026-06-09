import { NextResponse } from 'next/server'
import { z } from 'zod'
import { NotificationService } from '@/services/NotificationService'
import { WaitlistService } from '@/services/WaitlistService'
import { getServerEnv } from '@/lib/env'
import { captureError, emitMetric } from '@/lib/observability'

const querySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).optional(),
  leadMinutes: z.coerce.number().int().positive().max(24 * 60).optional(),
  retryFailed: z.enum(['true', 'false']).optional(),
  maxRetryAttempts: z.coerce.number().int().positive().max(10).optional(),
})

export async function POST(request: Request) {
  try {
    emitMetric({ domain: 'whatsapp', metric: 'notification_cron_run' })
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

    const url = new URL(request.url)
    const parsed = querySchema.safeParse({
      limit: url.searchParams.get('limit') ?? undefined,
      leadMinutes: url.searchParams.get('leadMinutes') ?? undefined,
      retryFailed: url.searchParams.get('retryFailed') ?? undefined,
      maxRetryAttempts: url.searchParams.get('maxRetryAttempts') ?? undefined,
    })

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Parámetros inválidos', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const automation = await NotificationService.applyAutomaticAppointmentRules()
    const unconfirmedWaitlist = await WaitlistService.processUnconfirmedVacancies()

    const reminders = await NotificationService.enqueueDueReminders({
      leadMinutes: parsed.data.leadMinutes,
    })

    const retryFailed = parsed.data.retryFailed !== 'false'
    const retries = retryFailed
      ? await NotificationService.retryFailedNotifications({
          limit: parsed.data.limit,
          maxAttempts: parsed.data.maxRetryAttempts,
        })
      : { inspected: 0, retried: 0, skippedPending: 0, skippedMaxAttempts: 0 }

    const queueResult = await NotificationService.processPendingQueue({
      limit: parsed.data.limit,
    })

    return NextResponse.json({
      success: true,
      automation,
      unconfirmedWaitlist,
      reminders,
      retries,
      queue: queueResult,
      processedAt: new Date().toISOString(),
    })
  } catch (error: unknown) {
    captureError('notifications.process.error', error)
    emitMetric({ domain: 'whatsapp', metric: 'notification_cron_error' })
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
