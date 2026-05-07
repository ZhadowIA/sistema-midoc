import { NextResponse } from 'next/server'
import { requireAgendaDoctorApiAccess } from '@/lib/medicalApi'
import { AvailabilityInputError, getAvailabilitySlots } from '@/server/agenda'
import { withEndpointObservability } from '@/lib/observability'

export async function GET(request: Request) {
  return withEndpointObservability({ endpoint: 'api.agenda.availability.slots', method: 'GET' }, async () => {
    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date')
    const type = searchParams.get('type') as 'normal' | 'extended' | null

    try {
      const access = await requireAgendaDoctorApiAccess({ allowSecretary: true })
      if (access.response) return access.response
      const doctorId = access.context.doctorId

      const availability = await getAvailabilitySlots({ doctorId, date, type })
      return NextResponse.json(availability)
    } catch (error: unknown) {
      if (error instanceof AvailabilityInputError) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
      const message = error instanceof Error ? error.message : 'Error interno'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  })
}
