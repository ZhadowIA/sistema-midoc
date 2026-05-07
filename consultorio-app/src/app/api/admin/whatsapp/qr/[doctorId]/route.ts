import { NextResponse } from 'next/server'
import { requireAgendaDoctorApiAccess } from '@/lib/medicalApi'
import { buildWhatsAppProviderUrl } from '@/lib/whatsappProvider'

export async function GET(_: Request, props: { params: Promise<{ doctorId: string }> }) {
  const params = await props.params
  try {
    const access = await requireAgendaDoctorApiAccess({ allowSecretary: true })
    if (access.response) return access.response
    const doctorId = access.context.doctorId
    if (params.doctorId !== doctorId) {
      return NextResponse.json({ error: 'No autorizado para este recurso' }, { status: 403 })
    }

    const providerUrl = buildWhatsAppProviderUrl(`/qr/${doctorId}`)
    const response = await fetch(providerUrl, {
      method: 'GET',
      cache: 'no-store',
    })

    const body = await response.text()
    if (!response.ok) {
      return NextResponse.json(
        { error: body || 'No fue posible obtener el estado de WhatsApp' },
        { status: response.status }
      )
    }

    try {
      return NextResponse.json(JSON.parse(body))
    } catch {
      return NextResponse.json({ status: 'unknown', raw: body })
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
