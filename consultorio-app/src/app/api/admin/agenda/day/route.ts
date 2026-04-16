import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { format } from 'date-fns'
import { getAuthenticatedDoctorId } from '@/lib/auth'
import { getDayRangeLocal } from '@/lib/dateTime'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const dateStr = searchParams.get('date')
  const showCancelled = searchParams.get('showCancelled') === 'true'

  try {
    const dayKey = dateStr ?? format(new Date(), 'yyyy-MM-dd')
    const { start, endExclusive } = getDayRangeLocal(dayKey)

    const doctorId = await getAuthenticatedDoctorId()
    if (!doctorId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

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
      include: { patient: true },
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
      patientName: apt.patient.fullName,
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
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
