import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/auth'
import { captureError, logEvent } from '@/lib/observability'

const createSchema = z.object({
  severity: z.enum(['P0', 'P1', 'P2', 'P3']),
  category: z.enum([
    'SECURITY_BREACH',
    'DATA_LEAK',
    'UNAUTHORIZED_ACCESS',
    'SERVICE_OUTAGE',
    'DATA_INTEGRITY',
    'VENDOR_INCIDENT',
    'OTHER',
  ]),
  title: z.string().min(3).max(200),
  summary: z.string().min(10).max(4000),
  detectedAt: z.string().datetime(),
  affectedScope: z.unknown().optional(),
  notificationRequired: z.boolean().optional(),
  assignedToUserId: z.string().optional(),
})

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const url = new URL(request.url)
    const status = url.searchParams.get('status') ?? undefined
    const severity = url.searchParams.get('severity') ?? undefined

    const items = await prisma.securityIncident.findMany({
      where: {
        OR: [{ reportedByUserId: user.id }, { assignedToUserId: user.id }],
        ...(status ? { status: status as 'OPEN' } : {}),
        ...(severity ? { severity: severity as 'P0' } : {}),
      },
      orderBy: { detectedAt: 'desc' },
      take: 200,
    })

    return NextResponse.json({ items, count: items.length })
  } catch (error: unknown) {
    captureError('security.incidents.list.error', error)
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await request.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.issues }, { status: 400 })
    }

    const incident = await prisma.securityIncident.create({
      data: {
        reportedByUserId: user.id,
        assignedToUserId: parsed.data.assignedToUserId ?? null,
        severity: parsed.data.severity,
        category: parsed.data.category,
        title: parsed.data.title,
        summary: parsed.data.summary,
        detectedAt: new Date(parsed.data.detectedAt),
        affectedScope: (parsed.data.affectedScope ?? null) as never,
        notificationRequired: parsed.data.notificationRequired ?? false,
      },
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
