import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getAuthenticatedDoctorId } from '@/lib/auth'
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
  reminderLeadHours: z.string().optional(),
  reminderWindowMinutes: z.coerce.number().int().min(1).max(240).optional(),
  whatsappAutoReplyEnabled: z.boolean().optional(),
  whatsappAutoConfirmEnabled: z.boolean().optional(),
  whatsappAutoCancelEnabled: z.boolean().optional(),
  whatsappBookingMessageTemplate: z.string().max(2000).optional(),
  whatsappQuestionnaireTemplate: z.string().max(2000).optional(),
  whatsappReminderPendingTemplate: z.string().max(2000).optional(),
  whatsappReminderConfirmedTemplate: z.string().max(2000).optional(),
})

export async function GET() {
  try {
    const doctorId = await getAuthenticatedDoctorId()
    if (!doctorId) return NextResponse.json({ error: "Sin médico" }, { status: 400 })

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

    const doctorId = await getAuthenticatedDoctorId()
    if (!doctorId) return NextResponse.json({ error: "Sin médico" }, { status: 400 })

    const current = await prisma.doctorConfig.findUnique({
      where: { doctorId },
    })

    const baseDuration = parsedData.data.baseDuration ?? current?.consultationDurationMin ?? 30
    const extendedEnabled = parsedData.data.extendedEnabled ?? current?.extendedConsultationEnabled ?? true
    const whatsappConnected = parsedData.data.whatsappConnected ?? current?.whatsappConnected ?? false
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
    const whatsappBookingMessageTemplate =
      parsedData.data.whatsappBookingMessageTemplate !== undefined
        ? asNullableString(parsedData.data.whatsappBookingMessageTemplate)
        : current?.whatsappBookingMessageTemplate ?? null
    const whatsappQuestionnaireTemplate =
      parsedData.data.whatsappQuestionnaireTemplate !== undefined
        ? asNullableString(parsedData.data.whatsappQuestionnaireTemplate)
        : current?.whatsappQuestionnaireTemplate ?? null
    const whatsappReminderPendingTemplate =
      parsedData.data.whatsappReminderPendingTemplate !== undefined
        ? asNullableString(parsedData.data.whatsappReminderPendingTemplate)
        : current?.whatsappReminderPendingTemplate ?? null
    const whatsappReminderConfirmedTemplate =
      parsedData.data.whatsappReminderConfirmedTemplate !== undefined
        ? asNullableString(parsedData.data.whatsappReminderConfirmedTemplate)
        : current?.whatsappReminderConfirmedTemplate ?? null

    const updatedConfig = await prisma.doctorConfig.upsert({
      where: { doctorId },
      update: {
        consultationDurationMin: baseDuration,
        extendedConsultationEnabled: extendedEnabled,
        whatsappConnected,
        normalConsultationPrice: parsedData.data.priceNormal,
        extendedConsultationPrice: parsedData.data.priceExtended,
        reminderLeadHours,
        reminderWindowMinutes,
        whatsappAutoReplyEnabled,
        whatsappAutoConfirmEnabled,
        whatsappAutoCancelEnabled,
        whatsappBookingMessageTemplate,
        whatsappQuestionnaireTemplate,
        whatsappReminderPendingTemplate,
        whatsappReminderConfirmedTemplate,
      },
      create: {
        doctorId,
        consultationDurationMin: baseDuration,
        extendedConsultationEnabled: extendedEnabled,
        whatsappConnected,
        normalConsultationPrice: parsedData.data.priceNormal,
        extendedConsultationPrice: parsedData.data.priceExtended,
        reminderLeadHours,
        reminderWindowMinutes,
        whatsappAutoReplyEnabled,
        whatsappAutoConfirmEnabled,
        whatsappAutoCancelEnabled,
        whatsappBookingMessageTemplate,
        whatsappQuestionnaireTemplate,
        whatsappReminderPendingTemplate,
        whatsappReminderConfirmedTemplate,
      }
    })

    return NextResponse.json({ success: true, config: updatedConfig })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
