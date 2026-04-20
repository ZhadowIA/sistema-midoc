import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { addDays, format, startOfWeek } from 'date-fns'
import { getAuthenticatedUser } from '@/lib/auth'
import { getDayRangeLocal } from '@/lib/dateTime'
import { formatPatientName } from '@/lib/patientName'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const startStr = searchParams.get('start')
  const showCancelled = searchParams.get('showCancelled') === 'true'
  const requestedDoctorId = searchParams.get('doctorId')

  try {
    const authUser = await getAuthenticatedUser()
    if (!authUser) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const actorUser = await prisma.user.findUnique({
      where: { id: authUser.id },
      select: { id: true, role: true, clinicId: true },
    })
    if (!actorUser) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    let doctorId = actorUser.id
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

    const anchorDate = startStr ? getDayRangeLocal(startStr).start : new Date()
    const weekStart = startOfWeek(anchorDate, { weekStartsOn: 1 })
    weekStart.setHours(0, 0, 0, 0)

    const weekEndExclusive = addDays(weekStart, 7)

    const config = await prisma.doctorConfig.findUnique({
      where: { doctorId },
      select: { consultationDurationMin: true },
    })

    const appointments = await prisma.appointment.findMany({
      where: {
        doctorId,
        ...(showCancelled ? {} : { status: { notIn: ['CANCELLED'] } }),
        startTime: { lt: weekEndExclusive },
        endTime: { gt: weekStart },
      },
      include: { patient: true, doctor: { select: { id: true, name: true } } },
      orderBy: { startTime: 'asc' },
    })

    const blocks = await prisma.scheduleBlock.findMany({
      where: {
        doctorId,
        startTime: { lt: weekEndExclusive },
        endTime: { gt: weekStart },
      },
      orderBy: { startTime: 'asc' },
    })

    const transformedAppointments = appointments.map((apt) => ({
      id: apt.id,
      doctorId: apt.doctorId,
      doctorName: apt.doctor.name,
      patientId: apt.patient.id,
      patientName: formatPatientName(apt.patient),
      patientPhone: apt.patient.phone,
      date: apt.date,
      dateLocal: format(apt.startTime, 'yyyy-MM-dd'),
      time: format(apt.startTime, 'HH:mm'),
      startTime: apt.startTime,
      endTime: apt.endTime,
      consultType: apt.appointmentType.toLowerCase(),
      status: apt.status.toLowerCase(),
      hasQuestionnaire: apt.questionnaireAnswered,
      origin: apt.source.toLowerCase(),
    }))

    const transformedBlocks = blocks.map((block) => ({
      id: block.id,
      type: block.type.toLowerCase(),
      reason: block.reason,
      dateLocal: format(block.startTime, 'yyyy-MM-dd'),
      startTime: block.startTime,
      endTime: block.endTime,
      time: format(block.startTime, 'HH:mm'),
    }))

    const days = Array.from({ length: 7 }, (_, index) => {
      const date = addDays(weekStart, index)
      const dateLocal = format(date, 'yyyy-MM-dd')
      return {
        dateLocal,
        appointments: transformedAppointments.filter((apt) => apt.dateLocal === dateLocal),
        blocks: transformedBlocks.filter((block) => block.dateLocal === dateLocal),
      }
    })

    return NextResponse.json({
      weekStart: format(weekStart, 'yyyy-MM-dd'),
      weekEnd: format(addDays(weekStart, 6), 'yyyy-MM-dd'),
      consultationDurationMin: config?.consultationDurationMin ?? 30,
      appointments: transformedAppointments,
      blocks: transformedBlocks,
      days,
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
