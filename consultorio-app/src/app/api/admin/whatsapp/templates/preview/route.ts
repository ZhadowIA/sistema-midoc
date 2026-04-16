import { NextResponse } from 'next/server'
import { z } from 'zod'
import prisma from '@/lib/prisma'
import { getAuthenticatedDoctorId } from '@/lib/auth'
import {
  resolveWhatsAppTemplate,
  WHATSAPP_TEMPLATE_VARIABLES,
  type WhatsAppTemplateType,
} from '@/lib/whatsappTemplatePreview'

const payloadSchema = z.object({
  templateType: z.enum(['booking', 'questionnaire', 'reminder_pending', 'reminder_confirmed']),
  template: z.string().max(2000).optional(),
  variables: z.record(z.string(), z.string()).optional(),
})

export async function POST(request: Request) {
  try {
    const doctorId = await getAuthenticatedDoctorId()
    if (!doctorId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

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
        whatsappBookingMessageTemplate: true,
        whatsappQuestionnaireTemplate: true,
        whatsappReminderPendingTemplate: true,
        whatsappReminderConfirmedTemplate: true,
      },
    })

    const result = resolveWhatsAppTemplate({
      templateType: parsed.data.templateType as WhatsAppTemplateType,
      configTemplates: config,
      customTemplate: parsed.data.template,
      customTemplateProvided: hasTemplateProp,
      variables: parsed.data.variables,
    })

    return NextResponse.json({
      success: true,
      templateType: parsed.data.templateType,
      source: result.source,
      effectiveTemplate: result.effectiveTemplate,
      preview: result.preview,
      variables: result.variables,
      availableVariables: WHATSAPP_TEMPLATE_VARIABLES,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
