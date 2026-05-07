import { z } from 'zod'
import { startOfDay, endOfDay, parseISO, isValid } from 'date-fns'
import prisma from '@/lib/prisma'
import { jsonNoStore } from '@/lib/http'
import { requireAgendaDoctorApiAccess } from '@/lib/medicalApi'

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

const postSchema = z.object({
  date:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().max(500).optional().nullable(),
})

export async function GET(request: Request) {
  const access = await requireAgendaDoctorApiAccess({ allowSecretary: true })
  if (access.response) return access.response
  const doctorId = access.context.doctorId

  const { searchParams } = new URL(request.url)
  const parsed = querySchema.safeParse({ date: searchParams.get('date') })
  if (!parsed.success) return jsonNoStore({ error: 'Fecha inválida' }, { status: 400 })

  const targetDate = parsed.data.date ? parseISO(parsed.data.date) : new Date()
  if (!isValid(targetDate)) return jsonNoStore({ error: 'Fecha inválida' }, { status: 400 })

  const [cashEntries, appointments, closure] = await Promise.all([
    prisma.dailyCashEntry.findMany({
      where: { doctorId, date: { gte: startOfDay(targetDate), lte: endOfDay(targetDate) } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.appointment.findMany({
      where: {
        doctorId,
        startTime: { gte: startOfDay(targetDate), lte: endOfDay(targetDate) },
      },
      select: { id: true, status: true },
    }),
    prisma.dayClosure.findUnique({
      where: { doctorId_date: { doctorId, date: startOfDay(targetDate) } },
      include: { closedBy: { select: { id: true, name: true } } },
    }),
  ])

  const statusCounts = appointments.reduce(
    (acc, a) => { acc[a.status] = (acc[a.status] ?? 0) + 1; return acc },
    {} as Record<string, number>
  )

  const methodTotals = cashEntries.reduce(
    (acc, e) => {
      const amt = Number(e.amount)
      acc.total += amt
      acc[e.method] = (acc[e.method] ?? 0) + amt
      return acc
    },
    { total: 0, CASH: 0, CARD: 0, TRANSFER: 0, OTHER: 0 } as Record<string, number>
  )

  return jsonNoStore({
    date: targetDate.toISOString().split('T')[0],
    appointments: { total: appointments.length, byStatus: statusCounts },
    cash: { entries: cashEntries.length, ...methodTotals },
    closure: closure
      ? {
          id: closure.id,
          closedAt: closure.closedAt,
          closedBy: closure.closedBy,
          notes: closure.notes,
          totals: {
            total:    Number(closure.totalAmount),
            CASH:     Number(closure.totalCash),
            CARD:     Number(closure.totalCard),
            TRANSFER: Number(closure.totalTransfer),
            OTHER:    Number(closure.totalOther),
            entries:  closure.entryCount,
          },
        }
      : null,
  })
}

export async function POST(request: Request) {
  const access = await requireAgendaDoctorApiAccess({ allowSecretary: true })
  if (access.response) return access.response
  const authUser = access.context.user
  const doctorId = access.context.doctorId

  const body = await request.json().catch(() => ({}))
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) return jsonNoStore({ error: 'Datos inválidos', details: parsed.error.issues }, { status: 400 })

  const targetDate = parseISO(parsed.data.date)
  if (!isValid(targetDate)) return jsonNoStore({ error: 'Fecha inválida' }, { status: 400 })

  const entries = await prisma.dailyCashEntry.findMany({
    where: { doctorId, date: { gte: startOfDay(targetDate), lte: endOfDay(targetDate) } },
  })

  const totals = entries.reduce(
    (acc, e) => {
      const amt = Number(e.amount)
      acc.total += amt
      acc[e.method] = (acc[e.method] ?? 0) + amt
      return acc
    },
    { total: 0, CASH: 0, CARD: 0, TRANSFER: 0, OTHER: 0 } as Record<string, number>
  )

  const closure = await prisma.dayClosure.upsert({
    where: { doctorId_date: { doctorId, date: startOfDay(targetDate) } },
    create: {
      doctorId,
      date:            startOfDay(targetDate),
      closedByUserId:  authUser.id,
      totalAmount:     totals.total,
      totalCash:       totals.CASH,
      totalCard:       totals.CARD,
      totalTransfer:   totals.TRANSFER,
      totalOther:      totals.OTHER,
      entryCount:      entries.length,
      notes:           parsed.data.notes ?? null,
    },
    update: {
      closedByUserId:  authUser.id,
      closedAt:        new Date(),
      totalAmount:     totals.total,
      totalCash:       totals.CASH,
      totalCard:       totals.CARD,
      totalTransfer:   totals.TRANSFER,
      totalOther:      totals.OTHER,
      entryCount:      entries.length,
      notes:           parsed.data.notes ?? null,
    },
    include: { closedBy: { select: { id: true, name: true } } },
  })

  return jsonNoStore({
    ok: true,
    closure: {
      id:       closure.id,
      closedAt: closure.closedAt,
      closedBy: closure.closedBy,
      totals: {
        total:    Number(closure.totalAmount),
        CASH:     Number(closure.totalCash),
        CARD:     Number(closure.totalCard),
        TRANSFER: Number(closure.totalTransfer),
        OTHER:    Number(closure.totalOther),
        entries:  closure.entryCount,
      },
    },
  }, { status: 200 })
}
