import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getEffectiveDoctorId } from '@/lib/auth'
import { captureError, logEvent } from '@/lib/observability'

const MAX_WINDOW_DAYS = 180
const DEFAULT_WINDOW_DAYS = 30

function parseDate(value: string | null): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export async function GET(request: Request) {
  try {
    const doctorId = await getEffectiveDoctorId()
    if (!doctorId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const url = new URL(request.url)
    const now = new Date()
    const fromParam = parseDate(url.searchParams.get('from'))
    const toParam = parseDate(url.searchParams.get('to'))
    const to = toParam ?? now
    const from =
      fromParam ?? new Date(to.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000)

    const windowMs = to.getTime() - from.getTime()
    if (windowMs <= 0) {
      return NextResponse.json({ error: 'Ventana inválida: from debe ser anterior a to' }, { status: 400 })
    }
    if (windowMs > MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
      return NextResponse.json(
        { error: `Ventana máxima permitida: ${MAX_WINDOW_DAYS} días` },
        { status: 400 }
      )
    }

    const where = { doctorId, createdAt: { gte: from, lte: to } }

    const [appointmentLogs, systemLogs, legalAcceptances, consentCaptures] = await Promise.all([
      prisma.appointmentAuditLog.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        take: 5000,
      }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        take: 5000,
      }),
      prisma.legalAcceptance.findMany({
        where: { user: { id: doctorId }, createdAt: { gte: from, lte: to } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.consentCapture.findMany({
        where: { doctorId, createdAt: { gte: from, lte: to } },
        orderBy: { createdAt: 'asc' },
        take: 5000,
      }),
    ])

    logEvent('info', 'privacy.audit.export', {
      doctorId,
      from: from.toISOString(),
      to: to.toISOString(),
      counts: {
        appointmentLogs: appointmentLogs.length,
        systemLogs: systemLogs.length,
        legalAcceptances: legalAcceptances.length,
        consentCaptures: consentCaptures.length,
      },
    })

    return NextResponse.json({
      doctorId,
      window: { from: from.toISOString(), to: to.toISOString() },
      counts: {
        appointmentLogs: appointmentLogs.length,
        systemLogs: systemLogs.length,
        legalAcceptances: legalAcceptances.length,
        consentCaptures: consentCaptures.length,
      },
      appointmentLogs,
      systemLogs,
      legalAcceptances,
      consentCaptures,
    })
  } catch (error: unknown) {
    captureError('privacy.audit.export.error', error)
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
