import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAgendaDoctorApiAccess } from '@/lib/medicalApi'
import { AgendaActorNotFoundError, getAgendaDay } from '@/server/agenda'
import { withEndpointObservability } from '@/lib/observability'

export async function GET(request: Request) {
  return withEndpointObservability({ endpoint: 'api.agenda.day', method: 'GET' }, async () => {
    const { searchParams } = new URL(request.url)
    const dateStr = searchParams.get('date')
    const showCancelled = searchParams.get('showCancelled') === 'true'
    const requestedDoctorId = searchParams.get('doctorId')

    try {
      const access = await requireAgendaDoctorApiAccess({ allowSecretary: true })
      if (access.response) return access.response

      const agendaDay = await getAgendaDay(prisma, {
        actorUserId: access.context.user.id,
        defaultDoctorId: access.context.doctorId,
        requestedDoctorId,
        dateStr,
        showCancelled,
      })

      return NextResponse.json(agendaDay)
    } catch (error: unknown) {
      if (error instanceof AgendaActorNotFoundError) {
        return NextResponse.json({ error: error.message }, { status: 401 })
      }
      const message = error instanceof Error ? error.message : 'Error interno'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  })
}
