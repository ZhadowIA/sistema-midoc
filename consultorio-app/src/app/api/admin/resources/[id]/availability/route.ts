import { z } from 'zod'
import { parseISO, isValid } from 'date-fns'
import prisma from '@/lib/prisma'
import { jsonNoStore } from '@/lib/http'
import { requireAgendaDoctorApiAccess } from '@/lib/medicalApi'

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  const access = await requireAgendaDoctorApiAccess({ allowSecretary: true })
  if (access.response) return access.response
  const doctorId = access.context.doctorId
  const { id } = await props.params

  const resource = await prisma.resource.findFirst({ where: { id, doctorId } })
  if (!resource) return jsonNoStore({ error: 'Recurso no encontrado' }, { status: 404 })

  const { searchParams } = new URL(request.url)
  const parsed = querySchema.safeParse({ date: searchParams.get('date') })
  if (!parsed.success) return jsonNoStore({ error: 'Fecha inválida' }, { status: 400 })

  const targetDate = parseISO(parsed.data.date)
  if (!isValid(targetDate)) return jsonNoStore({ error: 'Fecha inválida' }, { status: 400 })

  const dayStart = new Date(targetDate)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(targetDate)
  dayEnd.setHours(23, 59, 59, 999)

  const appointments = await prisma.appointment.findMany({
    where: {
      resourceId: id,
      startTime: { gte: dayStart, lte: dayEnd },
      status: { notIn: ['CANCELLED', 'NO_SHOW'] },
    },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      status: true,
      patient: { select: { firstName: true, lastNamePaternal: true } },
    },
    orderBy: { startTime: 'asc' },
  })

  return jsonNoStore({ resource, appointments })
}
