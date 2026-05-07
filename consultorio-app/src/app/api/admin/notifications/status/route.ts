import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAgendaAccess } from '@/lib/medicalApi'
import { NotificationService } from '@/services/NotificationService'
import { SUBSCRIPTION_FEATURES } from '@/lib/subscriptionFeatures'

const querySchema = z.object({
  windowDays: z.coerce.number().int().positive().max(60).optional(),
  failedLimit: z.coerce.number().int().positive().max(100).optional(),
})

export async function GET(request: Request) {
  try {
    const access = await requireAgendaAccess({
      allowSecretary: true,
      requiredFeature: SUBSCRIPTION_FEATURES.AGENDA_REMINDERS_WHATSAPP,
      featureForbiddenMessage: 'Los recordatorios de agenda no están incluidos en tu plan.',
    })
    if (access.response) return access.response
    const doctorId = access.context.doctorId

    const url = new URL(request.url)
    const parsed = querySchema.safeParse({
      windowDays: url.searchParams.get('windowDays') ?? undefined,
      failedLimit: url.searchParams.get('failedLimit') ?? undefined,
    })

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Parámetros inválidos', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const status = await NotificationService.getDoctorNotificationStatus({
      doctorId,
      windowDays: parsed.data.windowDays,
      failedLimit: parsed.data.failedLimit,
    })

    return NextResponse.json({ success: true, ...status })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
