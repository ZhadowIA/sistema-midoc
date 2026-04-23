import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { format } from 'date-fns'
import { getDayRangeLocal } from '@/lib/dateTime'
import { requireAgendaDoctorApiAccess } from '@/lib/medicalApi'
import { toAgendaAppointmentDto, toAgendaBlockDto } from '@/lib/agendaDto'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const dateStr = searchParams.get('date')
  const showCancelled = searchParams.get('showCancelled') === 'true'
  const requestedDoctorId = searchParams.get('doctorId')

  try {
    const dayKey = dateStr ?? format(new Date(), 'yyyy-MM-dd')
    const { start, endExclusive } = getDayRangeLocal(dayKey)

    const access = await requireAgendaDoctorApiAccess({ allowSecretary: true })
    if (access.response) return access.response

    const actorUser = await prisma.user.findUnique({
      where: { id: access.context.user.id },
      select: { id: true, role: true, clinicId: true },
    })
    if (!actorUser) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    let doctorId = access.context.doctorId
    let clinicDoctors: Array<{ id: string; name: string }> = []
    const canViewClinicAgenda = actorUser.role === 'CLINIC_ADMIN' && Boolean(actorUser.clinicId)

    if (canViewClinicAgenda && actorUser.clinicId) {
      clinicDoctors = await prisma.user.findMany({
        where: {
          clinicId: actorUser.clinicId,
          active: true,
          role: { in: ['DOCTOR', 'CLINIC_ADMIN'] },
        },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })

      if (requestedDoctorId && clinicDoctors.some((doctor) => doctor.id === requestedDoctorId)) {
        doctorId = requestedDoctorId
      }
    }

    const config = await prisma.doctorConfig.findUnique({
      where: { doctorId },
      select: { consultationDurationMin: true },
    })

    const appointments = await prisma.appointment.findMany({
      where: { 
        doctorId,
        ...(showCancelled ? {} : { status: { notIn: ['CANCELLED'] } }),
        startTime: { lt: endExclusive },
        endTime: { gt: start },
      },
      include: { patient: true, doctor: { select: { id: true, name: true } } },
      orderBy: { startTime: 'asc' }
    })

    const blocks = await prisma.scheduleBlock.findMany({
      where: {
        doctorId,
        startTime: { gte: start, lt: endExclusive },
      },
      orderBy: { startTime: 'asc' },
    })

    const transformedAppointments = appointments.map(toAgendaAppointmentDto)
    const transformedBlocks = blocks.map(toAgendaBlockDto)

    return NextResponse.json({
      consultationDurationMin: config?.consultationDurationMin ?? 30,
      appointments: transformedAppointments,
      blocks: transformedBlocks,
      scope: {
        actorDoctorId: actorUser.id,
        currentDoctorId: doctorId,
        canViewClinicAgenda,
        canEditCrossDoctor: canViewClinicAgenda,
        doctors: clinicDoctors,
      },
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
