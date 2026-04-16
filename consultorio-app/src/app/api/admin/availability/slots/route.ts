import { NextResponse } from 'next/server'
import { AvailabilityService } from '@/services/AvailabilityService'
import { getAuthenticatedDoctorId } from '@/lib/auth'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')
  const type = searchParams.get('type') as 'normal' | 'extended' | null

  if (!date || !type) {
    return NextResponse.json({ error: 'Faltan parámetros (date, type)' }, { status: 400 })
  }

  try {
    const doctorId = await getAuthenticatedDoctorId()
    if (!doctorId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const availability = await AvailabilityService.getAvailability(doctorId, date, type)
    return NextResponse.json(availability)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
