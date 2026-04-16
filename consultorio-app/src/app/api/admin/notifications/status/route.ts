import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthenticatedDoctorId } from '@/lib/auth'
import { NotificationService } from '@/services/NotificationService'

const querySchema = z.object({
  windowDays: z.coerce.number().int().positive().max(60).optional(),
  failedLimit: z.coerce.number().int().positive().max(100).optional(),
})

export async function GET(request: Request) {
  try {
    const doctorId = await getAuthenticatedDoctorId()
    if (!doctorId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

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
