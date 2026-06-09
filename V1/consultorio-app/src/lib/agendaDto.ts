import { formatPatientName } from '@/lib/patientName'
import { formatDateKeyInAppTimeZone, formatTimeInAppTimeZone } from '@/lib/timezone'

type AgendaAppointmentInput = {
  id: string
  doctorId: string
  appointmentType: string
  status: string
  questionnaireAnswered: boolean
  source: string
  date: Date
  startTime: Date
  endTime: Date
  patient: {
    id: string
    phone: string
    firstName?: string | null
    lastNamePaternal?: string | null
    lastNameMaternal?: string | null
  }
  doctor: {
    name: string
  }
}

type AgendaBlockInput = {
  id: string
  type: string
  reason: string | null
  startTime: Date
  endTime: Date
}

export function toAgendaAppointmentDto(apt: AgendaAppointmentInput) {
  return {
    id: apt.id,
    doctorId: apt.doctorId,
    doctorName: apt.doctor.name,
    patientId: apt.patient.id,
    patientName: formatPatientName(apt.patient),
    patientPhone: apt.patient.phone,
    date: apt.date,
    dateLocal: formatDateKeyInAppTimeZone(apt.startTime),
    time: formatTimeInAppTimeZone(apt.startTime),
    startTime: apt.startTime,
    endTime: apt.endTime,
    consultType: apt.appointmentType.toLowerCase(),
    status: apt.status.toLowerCase(),
    hasQuestionnaire: apt.questionnaireAnswered,
    origin: apt.source.toLowerCase(),
  }
}

export function toAgendaBlockDto(block: AgendaBlockInput) {
  return {
    id: block.id,
    type: block.type.toLowerCase(),
    reason: block.reason,
    dateLocal: formatDateKeyInAppTimeZone(block.startTime),
    startTime: block.startTime,
    endTime: block.endTime,
    time: formatTimeInAppTimeZone(block.startTime),
  }
}

