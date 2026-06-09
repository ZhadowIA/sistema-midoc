import { NextResponse } from 'next/server'
import { requireAgendaAccess } from '@/lib/medicalApi'
import { WaitlistService } from '@/services/WaitlistService'
import { can, PERMISSIONS } from '@/lib/permissions'
import { SUBSCRIPTION_FEATURES } from '@/lib/subscriptionFeatures'

export async function POST() {
  try {
    const access = await requireAgendaAccess({
      allowSecretary: false,
      requiredFeature: SUBSCRIPTION_FEATURES.AGENDA_WAITLIST,
      featureForbiddenMessage: 'La lista de espera no está incluida en tu plan.',
    })
    if (access.response) return access.response
    const authUser = access.context.user
    if (!can(authUser, PERMISSIONS.APPOINTMENT_UPDATE)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const expiredCount = await WaitlistService.expireDueOffers()
    return NextResponse.json({ success: true, expiredCount })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
