import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAgendaAccess } from '@/lib/medicalApi'
import { NotificationService } from '@/services/NotificationService'
import { SUBSCRIPTION_FEATURES } from '@/lib/subscriptionFeatures'

const bodySchema = z.object({
  notificationId: z.string().min(1).optional(),
  limit: z.number().int().positive().max(200).optional(),
})

export async function POST(request: Request) {
  try {
    const access = await requireAgendaAccess({
      allowSecretary: true,
      requiredFeature: SUBSCRIPTION_FEATURES.AGENDA_REMINDERS_WHATSAPP,
      featureForbiddenMessage: 'Los recordatorios de agenda no están incluidos en tu plan.',
    })
    if (access.response) return access.response
    const doctorId = access.context.doctorId

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
