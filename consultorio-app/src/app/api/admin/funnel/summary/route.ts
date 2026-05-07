import { startOfDay, subDays } from 'date-fns'
import prisma from '@/lib/prisma'
import { jsonNoStore } from '@/lib/http'
import { requireAgendaDoctorApiAccess } from '@/lib/medicalApi'

const FUNNEL_STEPS = [
  'BOOKING_VISIT',
  'BOOKING_STARTED',
  'DOCTOR_SELECTED',
  'SLOT_SELECTED',
  'PATIENT_INFO_STARTED',
  'PATIENT_INFO_COMPLETED',
  'BOOKING_CONFIRMED',
] as const

export async function GET(request: Request) {
  const access = await requireAgendaDoctorApiAccess({ allowSecretary: false })
  if (access.response) return access.response
  const doctorId = access.context.doctorId

  const { searchParams } = new URL(request.url)
  const days = Math.min(Number(searchParams.get('days') || '30'), 90)
  const since = startOfDay(subDays(new Date(), days))

  const [stepCounts, appointmentsByChannel] = await Promise.all([
    prisma.bookingFunnelEvent.groupBy({
      by: ['step'],
      where: { doctorId, createdAt: { gte: since } },
      _count: { id: true },
    }),
    prisma.appointment.groupBy({
      by: ['referrerChannel'],
      where: {
        doctorId,
        createdAt: { gte: since },
        source: 'PATIENT',
      },
      _count: { id: true },
    }),
  ])

  const stepMap = Object.fromEntries(stepCounts.map(s => [s.step, s._count.id]))
  const visits = stepMap['BOOKING_VISIT'] ?? 0
  const confirmed = stepMap['BOOKING_CONFIRMED'] ?? 0

  const funnel = FUNNEL_STEPS.map(step => ({
    step,
    count: stepMap[step] ?? 0,
    conversionFromVisit: visits > 0 ? Math.round(((stepMap[step] ?? 0) / visits) * 100) : 0,
  }))

  return jsonNoStore({
    period: { days, since: since.toISOString() },
    summary: { visits, confirmed, overallConversion: visits > 0 ? Math.round((confirmed / visits) * 100) : 0 },
    funnel,
    appointmentsByChannel: appointmentsByChannel.map(a => ({
      channel: a.referrerChannel,
      count: a._count.id,
    })),
  })
}
