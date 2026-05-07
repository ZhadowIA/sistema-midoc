import { z } from 'zod'
import { startOfDay, endOfDay, parseISO, isValid } from 'date-fns'
import prisma from '@/lib/prisma'
import { jsonNoStore } from '@/lib/http'
import { requireAgendaDoctorApiAccess } from '@/lib/medicalApi'
import { formatPatientName } from '@/lib/patientName'

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

export async function GET(request: Request) {
  const access = await requireAgendaDoctorApiAccess({ allowSecretary: true })
  if (access.response) return access.response
  const authUser = access.context.user

  const { searchParams } = new URL(request.url)
  const parsed = querySchema.safeParse({ date: searchParams.get('date') })
  if (!parsed.success) return jsonNoStore({ error: 'Fecha inválida' }, { status: 400 })

  const targetDate = parsed.data.date ? parseISO(parsed.data.date) : new Date()
  if (!isValid(targetDate)) return jsonNoStore({ error: 'Fecha inválida' }, { status: 400 })

  const doctorId = authUser.id

  const appointments = await prisma.appointment.findMany({
    where: {
      doctorId,
      startTime: { gte: startOfDay(targetDate), lte: endOfDay(targetDate) },
      status: { notIn: ['CANCELLED'] },
    },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      appointmentType: true,
      status: true,
      arrivedAt: true,
      notes: true,
      patient: {
        select: { id: true, firstName: true, lastNamePaternal: true, lastNameMaternal: true, phone: true },
      },
      questionnaire: { select: { id: true } },
      clinicalNote: { select: { id: true } },
    },
    orderBy: { startTime: 'asc' },
  })

  const result = appointments.map(apt => ({
    id: apt.id,
    startTime: apt.startTime.toISOString(),
    endTime: apt.endTime.toISOString(),
    appointmentType: apt.appointmentType,
    status: apt.status,
    arrivedAt: apt.arrivedAt?.toISOString() ?? null,
    notes: apt.notes,
    patient: {
      id: apt.patient.id,
      name: formatPatientName(apt.patient),
      phone: apt.patient.phone,
    },
    hasQuestionnaire: Boolean(apt.questionnaire),
    hasClinicalNote: Boolean(apt.clinicalNote),
  }))

  return jsonNoStore({ date: targetDate.toISOString().split('T')[0], appointments: result })
}
