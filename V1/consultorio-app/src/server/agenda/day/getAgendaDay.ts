import { format } from 'date-fns'
import type { PrismaClient } from '@prisma/client'
import { getDayRangeLocal } from '@/lib/dateTime'
import { toAgendaAppointmentDto, toAgendaBlockDto } from '@/lib/agendaDto'
import { resolveAgendaDoctorScope, type AgendaDoctorScope } from '@/server/agenda/shared/resolveAgendaDoctorScope'

type GetAgendaDayInput = {
  actorUserId: string
  defaultDoctorId: string
  requestedDoctorId: string | null
  dateStr: string | null
  showCancelled: boolean
}

export type AgendaDayResult = {
  consultationDurationMin: number
  appointments: ReturnType<typeof toAgendaAppointmentDto>[]
  blocks: ReturnType<typeof toAgendaBlockDto>[]
  scope: AgendaDoctorScope
}

export async function getAgendaDay(
  prisma: PrismaClient,
  input: GetAgendaDayInput,
): Promise<AgendaDayResult> {
  const dayKey = input.dateStr ?? format(new Date(), 'yyyy-MM-dd')
  const { start, endExclusive } = getDayRangeLocal(dayKey)

  const scope = await resolveAgendaDoctorScope(prisma, {
    actorUserId: input.actorUserId,
    defaultDoctorId: input.defaultDoctorId,
    requestedDoctorId: input.requestedDoctorId,
  })

  const config = await prisma.doctorConfig.findUnique({
    where: { doctorId: scope.currentDoctorId },
    select: { consultationDurationMin: true },
  })

  const appointments = await prisma.appointment.findMany({
    where: {
      doctorId: scope.currentDoctorId,
      ...(input.showCancelled ? {} : { status: { notIn: ['CANCELLED'] } }),
      startTime: { lt: endExclusive },
      endTime: { gt: start },
    },
    include: { patient: true, doctor: { select: { id: true, name: true } } },
    orderBy: { startTime: 'asc' },
  })

  const blocks = await prisma.scheduleBlock.findMany({
    where: {
      doctorId: scope.currentDoctorId,
      startTime: { gte: start, lt: endExclusive },
    },
    orderBy: { startTime: 'asc' },
  })

  return {
    consultationDurationMin: config?.consultationDurationMin ?? 30,
    appointments: appointments.map(toAgendaAppointmentDto),
    blocks: blocks.map(toAgendaBlockDto),
    scope,
  }
}
