import { NextResponse } from 'next/server'
import { requireAgendaDoctorApiAccess } from '@/lib/medicalApi'
import { buildWhatsAppProviderUrl, getWhatsAppProviderAuthHeaders } from '@/lib/whatsappProvider'

export async function DELETE(_: Request, props: { params: Promise<{ doctorId: string }> }) {
  const params = await props.params
  try {
    const access = await requireAgendaDoctorApiAccess({ allowSecretary: true })
    if (access.response) return access.response
    const doctorId = access.context.doctorId
    if (params.doctorId !== doctorId) {
      return NextResponse.json({ error: 'No autorizado para este recurso' }, { status: 403 })
    }

    const providerUrl = buildWhatsAppProviderUrl(`/logout/${doctorId}`)
    const response = await fetch(providerUrl, {
      method: 'DELETE',
      cache: 'no-store',
      headers: getWhatsAppProviderAuthHeaders(),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      return NextResponse.json(
        { error: body || 'No fue posible cerrar la sesión de WhatsApp' },
        { status: response.status }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
