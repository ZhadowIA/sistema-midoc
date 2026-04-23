import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/auth'
import { captureError, logEvent } from '@/lib/observability'

const patchSchema = z.object({
  status: z
    .enum(['OPEN', 'INVESTIGATING', 'CONTAINED', 'RESOLVED', 'POST_MORTEM', 'CLOSED'])
    .optional(),
  assignedToUserId: z.string().nullable().optional(),
  containedAt: z.string().datetime().nullable().optional(),
  resolvedAt: z.string().datetime().nullable().optional(),
  correctiveActions: z.string().max(8000).nullable().optional(),
  rootCause: z.string().max(4000).nullable().optional(),
  notificationRequired: z.boolean().optional(),
  notifiedAt: z.string().datetime().nullable().optional(),
  evidenceExportRef: z.string().max(500).nullable().optional(),
})

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await context.params
    const incident = await prisma.securityIncident.findUnique({ where: { id } })
    if (!incident) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

    const isParticipant =
      incident.reportedByUserId === user.id || incident.assignedToUserId === user.id
    if (!isParticipant) {
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
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { id } = await context.params
    const existing = await prisma.securityIncident.findUnique({ where: { id } })
    if (!existing) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

    const isParticipant =
      existing.reportedByUserId === user.id || existing.assignedToUserId === user.id
    if (!isParticipant) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.issues }, { status: 400 })
    }

    const incident = await prisma.securityIncident.update({
      where: { id },
      data: {
        ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
        ...(parsed.data.assignedToUserId !== undefined
          ? { assignedToUserId: parsed.data.assignedToUserId }
          : {}),
        ...(parsed.data.containedAt !== undefined
          ? { containedAt: parsed.data.containedAt ? new Date(parsed.data.containedAt) : null }
          : {}),
        ...(parsed.data.resolvedAt !== undefined
          ? { resolvedAt: parsed.data.resolvedAt ? new Date(parsed.data.resolvedAt) : null }
          : {}),
        ...(parsed.data.correctiveActions !== undefined
          ? { correctiveActions: parsed.data.correctiveActions }
          : {}),
        ...(parsed.data.rootCause !== undefined ? { rootCause: parsed.data.rootCause } : {}),
        ...(parsed.data.notificationRequired !== undefined
          ? { notificationRequired: parsed.data.notificationRequired }
          : {}),
        ...(parsed.data.notifiedAt !== undefined
          ? { notifiedAt: parsed.data.notifiedAt ? new Date(parsed.data.notifiedAt) : null }
          : {}),
        ...(parsed.data.evidenceExportRef !== undefined
          ? { evidenceExportRef: parsed.data.evidenceExportRef }
          : {}),
      },
    })

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
