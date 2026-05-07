import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { requireAgendaDoctorApiAccess } from '@/lib/medicalApi'
import { z } from 'zod'

function asNullableString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const configSchema = z.object({
  baseDuration: z.coerce.number().int().min(15).max(120).optional(),
  extendedEnabled: z
    .union([z.boolean(), z.enum(['yes', 'no'])])
    .transform((value) => value === true || value === 'yes')
    .optional(),
  whatsappConnected: z.boolean().optional(),
  priceNormal: z.coerce.number().finite().nonnegative().optional(),
  priceExtended: z.coerce.number().finite().nonnegative().optional(),
  depositEnabled: z.boolean().optional(),
  depositAmount: z.coerce.number().finite().nonnegative().optional(),
  depositExpiresInMinutes: z.coerce.number().int().min(5).max(24 * 60).optional(),
  cancellationWindowHours: z.coerce.number().int().min(0).max(24 * 30).optional(),
  cancellationRefundMode: z.enum(['FULL', 'PARTIAL', 'CREDIT', 'FORFEIT']).optional(),
  cancellationPartialRefundPct: z.coerce.number().int().min(0).max(100).optional(),
  reminderLeadHours: z.string().optional(),
  reminderWindowMinutes: z.coerce.number().int().min(1).max(240).optional(),
  whatsappAutoReplyEnabled: z.boolean().optional(),
  whatsappAutoConfirmEnabled: z.boolean().optional(),
  whatsappAutoCancelEnabled: z.boolean().optional(),
  bookingMessageTemplate: z.string().max(2000).optional(),
  questionnaireTemplate: z.string().max(2000).optional(),
  reminderPendingTemplate: z.string().max(2000).optional(),
  reminderConfirmedTemplate: z.string().max(2000).optional(),
})

export async function GET() {
  try {
    const access = await requireAgendaDoctorApiAccess({ allowSecretary: true })
    if (access.response) return access.response
    const doctorId = access.context.doctorId

    const config = await prisma.doctorConfig.findUnique({
      where: { doctorId }
    })

    // --- SINCRONIZACIÓN EN TIEMPO REAL CON EL BOT ---
    let liveConnected = config?.whatsappConnected || false
    
    try {
      // Intentamos consultar al bot directamente
      const botBaseUrl = process.env.WHATSAPP_API_URL?.replace('/send', '') || 'http://localhost:3001/api/whatsapp'
      const botRes = await fetch(`${botBaseUrl}/status/${doctorId}`, { 
        signal: AbortSignal.timeout(2000) // Timeout corto para no bloquear el dashboard
      })
      
      if (botRes.ok) {
        const botData = await botRes.json()
        liveConnected = botData.status === 'connected'
      } else {
        liveConnected = false
      }
    } catch {
      // Si el bot está apagado o inalcanzable, marcamos como desconectado
      liveConnected = false
    }

    // Si el estado en la DB es diferente al real, actualizamos la DB en segundo plano
    if (config && config.whatsappConnected !== liveConnected) {
      await prisma.doctorConfig.update({
        where: { id: config.id },
        data: { whatsappConnected: liveConnected }
      })
    }

    return NextResponse.json(config ? { ...config, whatsappConnected: liveConnected } : {})
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const data = await request.json()
    const parsedData = configSchema.safeParse(data)
    if (!parsedData.success) {
      return NextResponse.json({ error: 'Datos inválidos', details: parsedData.error.issues }, { status: 400 })
    }

    const access = await requireAgendaDoctorApiAccess({ allowSecretary: true })
    if (access.response) return access.response
    const doctorId = access.context.doctorId

    const current = await prisma.doctorConfig.findUnique({
      where: { doctorId },
    })

    const baseDuration = parsedData.data.baseDuration ?? current?.consultationDurationMin ?? 30
    const extendedEnabled = parsedData.data.extendedEnabled ?? current?.extendedConsultationEnabled ?? true
    const whatsappConnected = parsedData.data.whatsappConnected ?? current?.whatsappConnected ?? false
    const depositEnabled = parsedData.data.depositEnabled ?? current?.depositEnabled ?? false
    const depositAmount = parsedData.data.depositAmount ?? current?.depositAmount ?? undefined
    const depositExpiresInMinutes =
      parsedData.data.depositExpiresInMinutes ?? current?.depositExpiresInMinutes ?? 30
    const cancellationWindowHours =
      parsedData.data.cancellationWindowHours ?? current?.cancellationWindowHours ?? 24
    const cancellationRefundMode =
      parsedData.data.cancellationRefundMode ?? current?.cancellationRefundMode ?? 'FULL'
    const cancellationPartialRefundPct =
      parsedData.data.cancellationPartialRefundPct ?? current?.cancellationPartialRefundPct ?? 50
    const reminderLeadHours =
      parsedData.data.reminderLeadHours !== undefined
        ? asNullableString(parsedData.data.reminderLeadHours)
        : current?.reminderLeadHours ?? null
    const reminderWindowMinutes =
      parsedData.data.reminderWindowMinutes ?? current?.reminderWindowMinutes ?? 15
    const whatsappAutoReplyEnabled =
      parsedData.data.whatsappAutoReplyEnabled ?? current?.whatsappAutoReplyEnabled ?? true
    const whatsappAutoConfirmEnabled =
      parsedData.data.whatsappAutoConfirmEnabled ?? current?.whatsappAutoConfirmEnabled ?? true
    const whatsappAutoCancelEnabled =
      parsedData.data.whatsappAutoCancelEnabled ?? current?.whatsappAutoCancelEnabled ?? true
    const bookingMessageTemplate =
      parsedData.data.bookingMessageTemplate !== undefined
        ? asNullableString(parsedData.data.bookingMessageTemplate)
        : current?.bookingMessageTemplate ?? null
    const questionnaireTemplate =
      parsedData.data.questionnaireTemplate !== undefined
        ? asNullableString(parsedData.data.questionnaireTemplate)
        : current?.questionnaireTemplate ?? null
    const reminderPendingTemplate =
      parsedData.data.reminderPendingTemplate !== undefined
        ? asNullableString(parsedData.data.reminderPendingTemplate)
        : current?.reminderPendingTemplate ?? null
    const reminderConfirmedTemplate =
      parsedData.data.reminderConfirmedTemplate !== undefined
        ? asNullableString(parsedData.data.reminderConfirmedTemplate)
        : current?.reminderConfirmedTemplate ?? null

    const updatedConfig = await prisma.doctorConfig.upsert({
      where: { doctorId },
      update: {
        consultationDurationMin: baseDuration,
        extendedConsultationEnabled: extendedEnabled,
        whatsappConnected,
        normalConsultationPrice: parsedData.data.priceNormal,
        extendedConsultationPrice: parsedData.data.priceExtended,
        depositEnabled,
        depositAmount,
        depositExpiresInMinutes,
        cancellationWindowHours,
        cancellationRefundMode,
        cancellationPartialRefundPct,
        reminderLeadHours,
        reminderWindowMinutes,
        whatsappAutoReplyEnabled,
        whatsappAutoConfirmEnabled,
        whatsappAutoCancelEnabled,
        bookingMessageTemplate,
        questionnaireTemplate,
        reminderPendingTemplate,
        reminderConfirmedTemplate,
      },
      create: {
        doctorId,
        consultationDurationMin: baseDuration,
        extendedConsultationEnabled: extendedEnabled,
        whatsappConnected,
        normalConsultationPrice: parsedData.data.priceNormal,
        extendedConsultationPrice: parsedData.data.priceExtended,
        depositEnabled,
        depositAmount,
        depositExpiresInMinutes,
        cancellationWindowHours,
        cancellationRefundMode,
        cancellationPartialRefundPct,
        reminderLeadHours,
        reminderWindowMinutes,
        whatsappAutoReplyEnabled,
        whatsappAutoConfirmEnabled,
        whatsappAutoCancelEnabled,
        bookingMessageTemplate,
        questionnaireTemplate,
        reminderPendingTemplate,
        reminderConfirmedTemplate,
      }
    })

    return NextResponse.json({ success: true, config: updatedConfig })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
