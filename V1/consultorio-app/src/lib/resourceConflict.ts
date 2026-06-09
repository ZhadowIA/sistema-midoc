import prisma from '@/lib/prisma'

export async function checkResourceConflict(params: {
  resourceId: string
  startTime: Date
  endTime: Date
  excludeAppointmentId?: string
}): Promise<{ conflict: boolean; conflictingAppointmentId?: string }> {
  const { resourceId, startTime, endTime, excludeAppointmentId } = params

  const conflict = await prisma.appointment.findFirst({
    where: {
      resourceId,
      status: { notIn: ['CANCELLED', 'NO_SHOW'] },
      ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
      // overlapping: existing.start < new.end AND existing.end > new.start
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
    select: { id: true },
  })

  return conflict ? { conflict: true, conflictingAppointmentId: conflict.id } : { conflict: false }
}
