import prisma from '../lib/prisma'
import { Prisma } from '@prisma/client'
import { SignJWT, jwtVerify } from 'jose'
import { getServerEnv } from '@/lib/env'
import { buildEmptyEncounterHistory, calculateEncounterCompletionPct } from '@/lib/clinicalFormat'
import type { EncounterHistoryPayload } from '@/lib/encounterHistorySchema'

const env = getServerEnv()
const questionnaireSecret = new TextEncoder().encode(env.QUESTIONNAIRE_TOKEN_SECRET)

type QuestionnaireTokenPayload = {
  appointmentId: string
  typ: 'questionnaire'
}

/**
 * Servicio para validación y almacenamiento de cuestionarios precita
 */
export class QuestionnaireService {
  static async generateToken(appointmentId: string): Promise<string> {
    return new SignJWT({
      appointmentId,
      typ: 'questionnaire',
    } as QuestionnaireTokenPayload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(questionnaireSecret)
  }

  static async validateTokenContext(token: string) {
    const { payload } = await jwtVerify(token, questionnaireSecret)

    const appointmentId = payload.appointmentId
    const typ = payload.typ

    if (typeof appointmentId !== 'string' || typ !== 'questionnaire') {
      throw new Error('Token inválido')
    }
    
    const appointment = await prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        status: { not: 'CANCELLED' },
      },
      include: { questionnaire: true }
    });
    
    return appointment;
  }

  static async saveQuestionnaire(appointmentId: string, data: {
    primarySymptom: string;
    responses: Prisma.InputJsonValue;
  }) {
    const questionnaire = await prisma.questionnaire.create({
      data: {
        appointmentId,
        primarySymptom: data.primarySymptom,
        responses: data.responses
      }
    });

    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { questionnaireAnswered: true }
    });

    return questionnaire;
  }

  static async buildEncounterPrefill(appointmentId: string): Promise<{
    payload: EncounterHistoryPayload
    source: 'questionnaire' | 'empty'
  }> {
    const questionnaire = await prisma.questionnaire.findUnique({
      where: { appointmentId },
    })
    const payload = buildEmptyEncounterHistory()
    if (!questionnaire) return { payload, source: 'empty' }

    const responses = (questionnaire.responses ?? {}) as Record<string, unknown>
    const readString = (key: string) =>
      typeof responses[key] === 'string' ? (responses[key] as string) : undefined
    const readObject = (key: string) =>
      responses[key] && typeof responses[key] === 'object' && !Array.isArray(responses[key])
        ? (responses[key] as Record<string, unknown>)
        : undefined
    const readStringArray = (key: string): string[] | undefined => {
      const v = responses[key]
      if (!Array.isArray(v)) return undefined
      return v.filter((x): x is string => typeof x === 'string')
    }

    payload.chiefComplaint =
      readString('chiefComplaint') ?? questionnaire.primarySymptom ?? ''

    const presentIllness = readObject('presentIllness')
    if (presentIllness) {
      payload.presentIllness = {
        ...payload.presentIllness,
        ...presentIllness,
      }
    }

    const pertinentNegatives = readStringArray('pertinentNegatives')
    if (pertinentNegatives) payload.pertinentNegatives = pertinentNegatives

    const ros = readObject('ros')
    if (ros) payload.reviewOfSystems = ros

    payload.completionPct = calculateEncounterCompletionPct(payload)
    return { payload, source: 'questionnaire' }
  }
}
