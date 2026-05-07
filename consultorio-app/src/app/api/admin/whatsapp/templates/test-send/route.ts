import { NextResponse } from 'next/server'
import { z } from 'zod'
import { WhatsAppMessageAction, WhatsAppMessageDirection } from '@prisma/client'
import prisma from '@/lib/prisma'
import { requireAgendaDoctorApiAccess } from '@/lib/medicalApi'
import { getWhatsAppProviderSendUrl } from '@/lib/whatsappProvider'
import { WhatsAppMessageLogService } from '@/services/WhatsAppMessageLogService'
import {
  resolveWhatsAppTemplate,
  WHATSAPP_TEMPLATE_VARIABLES,
  type WhatsAppTemplateType,
} from '@/lib/whatsappTemplatePreview'

const payloadSchema = z.object({
  phone: z
    .string()
    .min(7)
    .max(30)
    .transform((value) => value.replace(/\D+/g, ''))
    .refine((value) => /^\d{10,15}$/.test(value), 'El teléfono debe tener entre 10 y 15 dígitos'),
  templateType: z.enum(['booking', 'questionnaire', 'reminder_pending', 'reminder_confirmed']),
  template: z.string().max(2000).optional(),
  variables: z.record(z.string(), z.string()).optional(),
})

export async function POST(request: Request) {
  try {
    const access = await requireAgendaDoctorApiAccess({ allowSecretary: true })
    if (access.response) return access.response
    const doctorId = access.context.doctorId

    const rawBody = await request.json().catch(() => ({}))
    const hasTemplateProp =
      typeof rawBody === 'object' &&
      rawBody !== null &&
      Object.prototype.hasOwnProperty.call(rawBody, 'template')
    const parsed = payloadSchema.safeParse(rawBody)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Payload inválido', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const config = await prisma.doctorConfig.findUnique({
      where: { doctorId },
      select: {
        whatsappConnected: true,
        bookingMessageTemplate: true,
        questionnaireTemplate: true,
        reminderPendingTemplate: true,
        reminderConfirmedTemplate: true,
      },
    })

    if (!config?.whatsappConnected) {
      return NextResponse.json(
        { error: 'Conecta WhatsApp antes de enviar una prueba.' },
        { status: 409 }
      )
    }

    const rendered = resolveWhatsAppTemplate({
      templateType: parsed.data.templateType as WhatsAppTemplateType,
      configTemplates: config,
      customTemplate: parsed.data.template,
      customTemplateProvided: hasTemplateProp,
      variables: parsed.data.variables,
    })

    const providerResponse = await fetch(getWhatsAppProviderSendUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        doctorId,
        to: parsed.data.phone,
        message: rendered.preview,
      }),
    })

    const providerBody = await providerResponse.text().catch(() => '')
    if (!providerResponse.ok) {
      return NextResponse.json(
        {
          error: providerBody || `El proveedor de WhatsApp respondió con ${providerResponse.status}`,
        },
        { status: 502 }
      )
    }

    await WhatsAppMessageLogService.create({
      doctorId,
      phone: parsed.data.phone,
      message: rendered.preview,
      direction: WhatsAppMessageDirection.OUTBOUND,
      action: WhatsAppMessageAction.NOTIFICATION_SENT,
    })

    return NextResponse.json({
      success: true,
      templateType: parsed.data.templateType,
      source: rendered.source,
      preview: rendered.preview,
      availableVariables: WHATSAPP_TEMPLATE_VARIABLES,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
