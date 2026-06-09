import { NextResponse } from 'next/server'
import { requireStaffApiAccess } from '@/lib/medicalApi'
import { captureError, logEvent } from '@/lib/observability'
import { can, PERMISSIONS } from '@/lib/permissions'
import {
  createSecurityIncident,
  createSecurityIncidentSchema,
  listSecurityIncidents,
} from '@/server/security'

export async function GET(request: Request) {
  try {
    const access = await requireStaffApiAccess({
      allowedRoles: ['DOCTOR', 'ADMIN', 'CLINIC_ADMIN'],
    })
    if (access.response) return access.response
    const user = access.user
    if (!can(user, PERMISSIONS.SECURITY_INCIDENT_READ)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const url = new URL(request.url)
    const status = url.searchParams.get('status') ?? undefined
    const severity = url.searchParams.get('severity') ?? undefined

    return NextResponse.json(
      await listSecurityIncidents({
        userId: user.id,
        ...(status ? { status: status as 'OPEN' } : {}),
        ...(severity ? { severity: severity as 'P0' } : {}),
      }),
    )
  } catch (error: unknown) {
    captureError('security.incidents.list.error', error)
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const access = await requireStaffApiAccess({
      allowedRoles: ['DOCTOR', 'ADMIN', 'CLINIC_ADMIN'],
    })
    if (access.response) return access.response
    const user = access.user
    if (!can(user, PERMISSIONS.SECURITY_INCIDENT_WRITE)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const parsed = createSecurityIncidentSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.issues }, { status: 400 })
    }

    const incident = await createSecurityIncident({
      userId: user.id,
      data: parsed.data,
    })

    logEvent('warn', 'security.incident.opened', {
      id: incident.id,
      severity: incident.severity,
      category: incident.category,
      reportedByUserId: user.id,
    })

    return NextResponse.json({ incident }, { status: 201 })
  } catch (error: unknown) {
    captureError('security.incidents.create.error', error)
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
