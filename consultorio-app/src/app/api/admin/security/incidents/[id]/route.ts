import { NextResponse } from 'next/server'
import { requireStaffApiAccess } from '@/lib/medicalApi'
import { captureError, logEvent } from '@/lib/observability'
import { can, PERMISSIONS } from '@/lib/permissions'
import {
  getSecurityIncidentById,
  isSecurityIncidentParticipant,
  patchSecurityIncidentSchema,
  updateSecurityIncident,
} from '@/server/security'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  try {
    const access = await requireStaffApiAccess({
      allowedRoles: ['DOCTOR', 'ADMIN', 'CLINIC_ADMIN'],
    })
    if (access.response) return access.response
    const user = access.user
    if (!can(user, PERMISSIONS.SECURITY_INCIDENT_READ)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const { id } = await context.params
    const incident = await getSecurityIncidentById(id)
    if (!incident) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

    if (!isSecurityIncidentParticipant({
      userId: user.id,
      reportedByUserId: incident.reportedByUserId,
      assignedToUserId: incident.assignedToUserId,
    })) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    return NextResponse.json({ incident })
  } catch (error: unknown) {
    captureError('security.incident.get.error', error)
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const access = await requireStaffApiAccess({
      allowedRoles: ['DOCTOR', 'ADMIN', 'CLINIC_ADMIN'],
    })
    if (access.response) return access.response
    const user = access.user
    if (!can(user, PERMISSIONS.SECURITY_INCIDENT_WRITE)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const { id } = await context.params
    const existing = await getSecurityIncidentById(id)
    if (!existing) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

    if (!isSecurityIncidentParticipant({
      userId: user.id,
      reportedByUserId: existing.reportedByUserId,
      assignedToUserId: existing.assignedToUserId,
    })) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const parsed = patchSecurityIncidentSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.issues }, { status: 400 })
    }

    const incident = await updateSecurityIncident({ id, data: parsed.data })

    logEvent('info', 'security.incident.updated', {
      id: incident.id,
      status: incident.status,
      severity: incident.severity,
      actorUserId: user.id,
    })

    return NextResponse.json({ incident })
  } catch (error: unknown) {
    captureError('security.incident.patch.error', error)
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
