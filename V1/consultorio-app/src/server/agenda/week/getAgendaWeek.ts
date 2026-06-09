import { addDays, format, startOfWeek } from 'date-fns'
import type { PrismaClient } from '@prisma/client'
import { getDayRangeLocal } from '@/lib/dateTime'
import { toAgendaAppointmentDto, toAgendaBlockDto } from '@/lib/agendaDto'
import { resolveAgendaDoctorScope, type AgendaDoctorScope } from '@/server/agenda/shared/resolveAgendaDoctorScope'

type GetAgendaWeekInput = {
  actorUserId: string
  defaultDoctorId: string
  requestedDoctorId: string | null
  startStr: string | null
  showCancelled: boolean
}

export type AgendaWeekResult = {
  weekStart: string
  weekEnd: string
  consultationDurationMin: number
  appointments: ReturnType<typeof toAgendaAppointmentDto>[]
  blocks: ReturnType<typeof toAgendaBlockDto>[]
  days: Array<{
    dateLocal: string
    appointments: ReturnType<typeof toAgendaAppointmentDto>[]
    blocks: ReturnType<typeof toAgendaBlockDto>[]
  }>
  scope: AgendaDoctorScope
}

export async function getAgendaWeek(
  prisma: PrismaClient,
  input: GetAgendaWeekInput,
): Promise<AgendaWeekResult> {
  const scope = await resolveAgendaDoctorScope(prisma, {
    actorUserId: input.actorUserId,
    defaultDoctorId: input.defaultDoctorId,
    requestedDoctorId: input.requestedDoctorId,
  })

  const anchorDate = input.startStr ? getDayRangeLocal(input.startStr).start : new Date()
  const weekStart = startOfWeek(anchorDate, { weekStartsOn: 1 })
  weekStart.setHours(0, 0, 0, 0)
  const weekEndExclusive = addDays(weekStart, 7)

  const config = await prisma.doctorConfig.findUnique({
    where: { doctorId: scope.currentDoctorId },
    select: { consultationDurationMin: true },
  })

  const appointments = await prisma.appointment.findMany({
    where: {
      doctorId: scope.currentDoctorId,
      ...(input.showCancelled ? {} : { status: { notIn: ['CANCELLED'] } }),
      startTime: { lt: weekEndExclusive },
      endTime: { gt: weekStart },
    },
    include: { patient: true, doctor: { select: { id: true, name: true } } },
    orderBy: { startTime: 'asc' },
  })

  const blocks = await prisma.scheduleBlock.findMany({
    where: {
      doctorId: scope.currentDoctorId,
      startTime: { lt: weekEndExclusive },
      endTime: { gt: weekStart },
    },
    orderBy: { startTime: 'asc' },
  })

  const transformedAppointments = appointments.map(toAgendaAppointmentDto)
  const transformedBlocks = blocks.map(toAgendaBlockDto)

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index)
    const dateLocal = format(date, 'yyyy-MM-dd')
    return {
      dateLocal,
      appointments: transformedAppointments.filter((apt) => apt.dateLocal === dateLocal),
      blocks: transformedBlocks.filter((block) => block.dateLocal === dateLocal),
    }
  })

  return {
    weekStart: format(weekStart, 'yyyy-MM-dd'),
    weekEnd: format(addDays(weekStart, 6), 'yyyy-MM-dd'),
    consultationDurationMin: config?.consultationDurationMin ?? 30,
    appointments: transformedAppointments,
    blocks: transformedBlocks,
    days,
    scope,
  }
}
