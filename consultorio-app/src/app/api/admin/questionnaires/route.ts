import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthenticatedDoctorId } from '@/lib/auth'
import { formatQuestionnaireTag, formatQuestionnaireValue } from '@/lib/questionnaireFormatting'

export async function GET() {
  try {
    const doctorId = await getAuthenticatedDoctorId()
    if (!doctorId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

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
      const responses = (apt.questionnaire?.responses ?? {}) as Record<string, unknown>
      const dynamicAnswers = (responses.dynamicAnswers ?? {}) as Record<string, unknown>
      const rawSymptomsText =
        apt.questionnaire?.primarySymptom ||
        (typeof dynamicAnswers.desc === 'string' ? dynamicAnswers.desc : undefined)
      const symptomsText = rawSymptomsText ? formatQuestionnaireTag(rawSymptomsText) : 'No especificado'
      const symptomDuration =
        typeof responses.duration === 'string' ? formatQuestionnaireValue(responses.duration) : 'No especificado'
      const painLocation =
        typeof dynamicAnswers.location === 'string' ? formatQuestionnaireValue(dynamicAnswers.location) : 'No especificado'

      return {
        id: apt.id,
        patientName: apt.patient.fullName,
        patientPhone: apt.patient.phone,
        date: apt.startTime,
        appointmentType: apt.appointmentType,
        questionnaire: apt.questionnaire
          ? {
              symptomsText,
              symptomDuration,
              painLocation,
              answeredAt: apt.questionnaire.createdAt,
            }
          : null,
      }
    })

    return NextResponse.json(results)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
