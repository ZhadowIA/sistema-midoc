import {
  WhatsAppIntent,
  WhatsAppMessageAction,
  WhatsAppMessageDirection,
} from '@prisma/client'
import prisma from '@/lib/prisma'
import { captureError } from '@/lib/observability'

type LogMessageInput = {
  doctorId: string
  phone: string
  message: string
  direction: WhatsAppMessageDirection
  intent?: WhatsAppIntent | null
  action?: WhatsAppMessageAction | null
  appointmentId?: string | null
  patientId?: string | null
}

export class WhatsAppMessageLogService {
  static async create(input: LogMessageInput) {
    try {
      if (!input.doctorId || !input.phone || !input.message.trim()) return

      await prisma.whatsAppMessageLog.create({
        data: {
          doctorId: input.doctorId,
          phone: input.phone,
          message: input.message.trim(),
          direction: input.direction,
          intent: input.intent ?? undefined,
          action: input.action ?? undefined,
          appointmentId: input.appointmentId ?? undefined,
          patientId: input.patientId ?? undefined,
        },
      })
    } catch (error: unknown) {
      captureError('whatsapp.log.create.error', error, {
        doctorId: input.doctorId,
      })
    }
  }

  static async listRecentForDoctor(doctorId: string, limit = 40) {
    return prisma.whatsAppMessageLog.findMany({
      where: { doctorId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        appointment: {
          select: {
            id: true,
            startTime: true,
            status: true,
          },
        },
        patient: {
          select: {
            id: true,
            fullName: true,
          },
        },
      },
    })
  }
}
