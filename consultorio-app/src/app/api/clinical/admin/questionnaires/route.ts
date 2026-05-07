import prisma from '@/lib/prisma'
import { formatQuestionnaireTag, formatQuestionnaireValue } from '@/lib/questionnaireFormatting'
import { jsonNoStore } from '@/lib/http'
import { requireMedicalDoctorApiAccess } from '@/lib/medicalApi'
import { formatPatientName } from '@/lib/patientName'

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as JsonRecord) : {}
}

export async function GET() {
  try {
    const access = await requireMedicalDoctorApiAccess()
    if (access.response) return access.response
    const doctorId = access.context.doctorId

    // Fetch all appointments that have answered questionnaires
    const appointments = await prisma.appointment.findMany({
      where: {
        doctorId,
        questionnaireAnswered: true
      },
      include: {
        patient: true,
        questionnaire: true
      },
      orderBy: { startTime: 'desc' }
    })

    const results = appointments.map((apt) => {
      const responses = asRecord(apt.questionnaire?.responses)
      const dynamicAnswers = asRecord(responses.dynamicAnswers)
      const aiInterviewRecord = asRecord(responses.aiInterview)
      const aiInterview =
        typeof aiInterviewRecord.summary === 'string'
          ? { summary: aiInterviewRecord.summary }
          : undefined

      const rawSymptomsText =
        aiInterview?.summary ||
        apt.questionnaire?.primarySymptom ||
        (typeof dynamicAnswers.desc === 'string' ? dynamicAnswers.desc : undefined)
      
      const symptomsText = rawSymptomsText ? formatQuestionnaireTag(rawSymptomsText) : 'No especificado'
      const symptomDuration =
        aiInterview ? "Detectada por IA" :
        typeof responses.duration === 'string' ? formatQuestionnaireValue(responses.duration) : 'No especificado'
      
      const painLocation =
        typeof dynamicAnswers.location === 'string' ? formatQuestionnaireValue(dynamicAnswers.location) : 'No especificado'

      return {
        id: apt.id,
        patientName: formatPatientName(apt.patient),
        patientPhone: apt.patient.phone,
        date: apt.startTime,
        appointmentType: apt.appointmentType,
        questionnaire: apt.questionnaire
          ? {
              symptomsText,
              symptomDuration,
              painLocation,
              isAI: !!aiInterview,
              answeredAt: apt.questionnaire.createdAt,
            }
          : null,
      }
    })

    return jsonNoStore(results)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return jsonNoStore({ error: message }, { status: 500 })
  }
}
