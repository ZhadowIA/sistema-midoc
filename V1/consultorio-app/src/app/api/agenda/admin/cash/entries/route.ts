import { z } from 'zod'
import { startOfDay, endOfDay, parseISO, isValid } from 'date-fns'
import prisma from '@/lib/prisma'
import { jsonNoStore } from '@/lib/http'
import { requireAgendaDoctorApiAccess } from '@/lib/medicalApi'

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

const createSchema = z.object({
  concept: z.string().trim().min(1).max(200),
  amount: z.number().positive().max(999_999),
  method: z.enum(['CASH', 'CARD', 'TRANSFER', 'OTHER']),
  appointmentId: z.string().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
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

  const entries = await prisma.dailyCashEntry.findMany({
    where: { doctorId, date: { gte: startOfDay(targetDate), lte: endOfDay(targetDate) } },
    include: {
      appointment: { select: { id: true, startTime: true, patient: { select: { firstName: true, lastNamePaternal: true } } } },
      actor: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  const totals = entries.reduce(
    (acc, e) => {
      const amt = Number(e.amount)
      acc.total += amt
      acc[e.method as keyof typeof acc] = (acc[e.method as keyof typeof acc] as number) + amt
      return acc
    },
    { total: 0, CASH: 0, CARD: 0, TRANSFER: 0, OTHER: 0 }
  )

  return jsonNoStore({ date: targetDate.toISOString().split('T')[0], entries, totals })
}

export async function POST(request: Request) {
  const access = await requireAgendaDoctorApiAccess({ allowSecretary: true })
  if (access.response) return access.response
  const authUser = access.context.user

  const body = await request.json().catch(() => ({}))
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return jsonNoStore({ error: 'Datos inválidos', details: parsed.error.issues }, { status: 400 })
  }

  const { concept, amount, method, appointmentId, notes, date } = parsed.data
  const entryDate = date ? parseISO(date) : new Date()

  const entry = await prisma.dailyCashEntry.create({
    data: {
      doctorId: authUser.id,
      actorUserId: authUser.id,
      concept,
      amount,
      method,
      appointmentId: appointmentId ?? null,
      notes: notes ?? null,
      date: entryDate,
    },
  })

  return jsonNoStore(entry, { status: 201 })
}
