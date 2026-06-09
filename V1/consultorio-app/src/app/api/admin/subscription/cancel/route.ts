import { NextResponse } from 'next/server'
import { requireStaffApiAccess } from '@/lib/medicalApi'
import { captureError, logEvent } from '@/lib/observability'
import { can, PERMISSIONS } from '@/lib/permissions'
import { getRequestIp, getUserAgent } from '@/lib/requestContext'
import { updateCancelAtPeriodEnd } from '@/server/subscription'

export async function POST(request: Request) {
  try {
    const access = await requireStaffApiAccess({
      allowedRoles: ['DOCTOR', 'ADMIN', 'CLINIC_ADMIN'],
    })
    if (access.response) return access.response
    const authUser = access.user

    if (!can(authUser, PERMISSIONS.BILLING_MANAGE)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const result = await updateCancelAtPeriodEnd(authUser.id, true, {
      actorUserId: authUser.id,
      ipAddress: getRequestIp(request),
      userAgent: getUserAgent(request),
    })
    if (!result) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    if (!result.subscription) {
      return NextResponse.json({ error: 'Suscripción no encontrada' }, { status: 404 })
    }

    logEvent('info', 'billing.subscription.cancel.scheduled', {
      userId: authUser.id,
      billingDoctorId: result.scope.billingDoctorId,
      mode: result.scope.mode,
    })

    return NextResponse.json({ success: true, subscription: result.subscription })
  } catch (error: unknown) {
    captureError('billing.subscription.cancel.error', error)
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
