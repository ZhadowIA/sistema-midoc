import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedDoctorId } from '@/lib/auth'
import { NotificationService } from '@/services/NotificationService'

const querySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional(),
  leadMinutes: z.coerce.number().int().positive().max(24 * 60).optional(),
  retryFailed: z.enum(['true', 'false']).optional(),
  maxRetryAttempts: z.coerce.number().int().positive().max(10).optional(),
})

export async function POST(request: Request) {
  try {
    const doctorId = await getAuthenticatedDoctorId()
    if (!doctorId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

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

    const automation = await NotificationService.applyAutomaticAppointmentRules({ doctorId })

    const reminders = await NotificationService.enqueueDueReminders({
      doctorId,
      leadMinutes: parsed.data.leadMinutes,
    })

    const retryFailed = parsed.data.retryFailed !== 'false'
    const retries = retryFailed
      ? await NotificationService.retryFailedNotifications({
          doctorId,
          limit: parsed.data.limit,
          maxAttempts: parsed.data.maxRetryAttempts,
        })
      : { inspected: 0, retried: 0, skippedPending: 0, skippedMaxAttempts: 0 }

    const queueResult = await NotificationService.processPendingQueue({
      doctorId,
      limit: parsed.data.limit,
    })

    return NextResponse.json({
      success: true,
      automation,
      reminders,
      retries,
      queue: queueResult,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
