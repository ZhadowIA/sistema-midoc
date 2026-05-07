import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAgendaDoctorApiAccess } from '@/lib/medicalApi'
import { WhatsAppMessageLogService } from '@/services/WhatsAppMessageLogService'

const querySchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional(),
})

export async function GET(request: Request) {
  try {
    const access = await requireAgendaDoctorApiAccess({ allowSecretary: true })
    if (access.response) return access.response
    const doctorId = access.context.doctorId

    const url = new URL(request.url)
    const parsed = querySchema.safeParse({
      limit: url.searchParams.get('limit') ?? undefined,
    })

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Parámetros inválidos', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const history = await WhatsAppMessageLogService.listRecentForDoctor(
      doctorId,
      parsed.data.limit ?? 40
    )

    return NextResponse.json({
      success: true,
      history,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
