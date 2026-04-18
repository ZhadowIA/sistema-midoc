import prisma from '../lib/prisma'
import { Prisma } from '@prisma/client'
import { SignJWT, jwtVerify } from 'jose'
import { getServerEnv } from '@/lib/env'

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
}
