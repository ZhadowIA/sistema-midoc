import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { format } from 'date-fns'
import { getAuthenticatedUser } from '@/lib/auth'
import { getDayRangeLocal } from '@/lib/dateTime'
import { formatPatientName } from '@/lib/patientName'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const dateStr = searchParams.get('date')
  const showCancelled = searchParams.get('showCancelled') === 'true'
  const requestedDoctorId = searchParams.get('doctorId')

  try {
    const dayKey = dateStr ?? format(new Date(), 'yyyy-MM-dd')
    const { start, endExclusive } = getDayRangeLocal(dayKey)

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

    const config = await prisma.doctorConfig.findUnique({
      where: { doctorId },
      select: { consultationDurationMin: true },
    })

    const appointments = await prisma.appointment.findMany({
      where: { 
        doctorId,
        ...(showCancelled ? {} : { status: { notIn: ['CANCELLED'] } }),
        startTime: { gte: start, lt: endExclusive } 
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

    const transformedAppointments = appointments.map((apt) => ({
      id: apt.id,
      doctorId: apt.doctorId,
      doctorName: apt.doctor.name,
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
      origin: apt.source.toLowerCase()
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
