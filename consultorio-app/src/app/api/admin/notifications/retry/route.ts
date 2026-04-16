import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedDoctorId } from '@/lib/auth'
import { NotificationService } from '@/services/NotificationService'

const bodySchema = z.object({
  notificationId: z.string().min(1).optional(),
  limit: z.number().int().positive().max(200).optional(),
})

export async function POST(request: Request) {
  try {
    const doctorId = await getAuthenticatedDoctorId()
    if (!doctorId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Payload inválido', details: parsed.error.issues },
        { status: 400 }
      )
    }

    if (parsed.data.notificationId) {
      const single = await NotificationService.retryFailedNotificationById({
        doctorId,
        notificationId: parsed.data.notificationId,
      })

      const queue = await NotificationService.processPendingQueue({
        doctorId,
        limit: parsed.data.limit ?? 25,
      })

      return NextResponse.json({
        success: true,
        mode: 'single',
        single,
        queue,
      })
    }

    const retries = await NotificationService.retryFailedNotifications({
      doctorId,
      limit: parsed.data.limit,
    })
    const queue = await NotificationService.processPendingQueue({
      doctorId,
      limit: parsed.data.limit,
    })

    return NextResponse.json({
      success: true,
      mode: 'bulk',
      retries,
      queue,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
