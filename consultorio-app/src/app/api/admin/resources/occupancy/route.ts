import { z } from 'zod'
import { startOfDay, endOfDay, parseISO, isValid } from 'date-fns'
import prisma from '@/lib/prisma'
import { jsonNoStore } from '@/lib/http'
import { requireAgendaDoctorApiAccess } from '@/lib/medicalApi'

const querySchema = z.object({
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

  const resources = await prisma.resource.findMany({
    where: { doctorId, active: true },
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
    include: {
      appointments: {
        where: {
          startTime: { gte: startOfDay(targetDate), lte: endOfDay(targetDate) },
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        },
        select: {
          id: true,
          startTime: true,
          endTime: true,
          status: true,
          appointmentType: true,
          patient: { select: { firstName: true, lastNamePaternal: true } },
        },
        orderBy: { startTime: 'asc' },
      },
    },
  })

  return jsonNoStore({
    date: targetDate.toISOString().split('T')[0],
    resources: resources.map(r => ({
      id: r.id,
      name: r.name,
      type: r.type,
      notes: r.notes,
      appointments: r.appointments.map(a => ({
        id: a.id,
        startTime: a.startTime,
        endTime: a.endTime,
        status: a.status,
        appointmentType: a.appointmentType,
        patientName: `${a.patient.firstName} ${a.patient.lastNamePaternal}`,
      })),
    })),
  })
}
