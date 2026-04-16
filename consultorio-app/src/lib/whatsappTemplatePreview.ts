export type WhatsAppTemplateType =
  | 'booking'
  | 'questionnaire'
  | 'reminder_pending'
  | 'reminder_confirmed'

export const WHATSAPP_TEMPLATE_VARIABLES = [
  '{paciente}',
  '{fecha_hora}',
  '{fecha}',
  '{hora}',
  '{tipo_cita}',
  '{tiempo_restante}',
  '{link_cuestionario}',
  '{estado_cita}',
] as const

export const WHATSAPP_DEFAULT_TEMPLATES: Record<WhatsAppTemplateType, string> = {
  booking:
    'Hola {paciente}, tu cita ({tipo_cita}) quedó agendada para el {fecha_hora}. ' +
    'Para confirmar tu asistencia responde "CONFIRMO".',
  questionnaire:
    'Hola {paciente}, puedes responder este cuestionario preconsulta antes de tu cita: {link_cuestionario}',
  reminder_pending:
    'Hola {paciente}, te recordamos tu cita el {fecha_hora}. ' +
    'Faltan aproximadamente {tiempo_restante}. Responde "CONFIRMO" para confirmar tu asistencia.',
  reminder_confirmed:
    'Hola {paciente}, recordatorio de tu cita el {fecha_hora}. ' +
    'Si necesitas cancelarla, responde "CANCELAR".',
}

export type WhatsAppTemplateConfigSource = {
  whatsappBookingMessageTemplate?: string | null
  whatsappQuestionnaireTemplate?: string | null
  whatsappReminderPendingTemplate?: string | null
  whatsappReminderConfirmedTemplate?: string | null
}

type TemplateSource = 'custom_input' | 'doctor_config' | 'default'

const TYPE_TO_FIELD: Record<WhatsAppTemplateType, keyof WhatsAppTemplateConfigSource> = {
  booking: 'whatsappBookingMessageTemplate',
  questionnaire: 'whatsappQuestionnaireTemplate',
  reminder_pending: 'whatsappReminderPendingTemplate',
  reminder_confirmed: 'whatsappReminderConfirmedTemplate',
}

function normalizeString(value: string | null | undefined) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function buildWhatsAppTemplateVariables(overrides?: Partial<Record<string, string>>) {
  return {
    paciente: 'Paciente de prueba',
    fecha_hora: '22/04/2026 09:00',
    fecha: '22/04/2026',
    hora: '09:00',
    tipo_cita: 'normal',
    tiempo_restante: '24 horas',
    link_cuestionario: 'https://midoc.app/cuestionario/demo',
    estado_cita: 'PENDING',
    ...(overrides ?? {}),
  }
}

export function applyWhatsAppTemplate(template: string, variables: Record<string, string>) {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => {
    const value = variables[key]
    return value ?? ''
  })
}

export function resolveWhatsAppTemplate(options: {
  templateType: WhatsAppTemplateType
  configTemplates?: WhatsAppTemplateConfigSource | null
  customTemplate?: string | null
  customTemplateProvided?: boolean
  variables?: Partial<Record<string, string>>
}) {
  const { templateType, configTemplates, customTemplate, customTemplateProvided, variables } = options
  const custom = normalizeString(customTemplate)
  const configValue = normalizeString(configTemplates?.[TYPE_TO_FIELD[templateType]] ?? null)
  const fallback = WHATSAPP_DEFAULT_TEMPLATES[templateType]

  let effectiveTemplate = fallback
  let source: TemplateSource = 'default'

  if (configValue) {
    effectiveTemplate = configValue
    source = 'doctor_config'
  }
  if (customTemplateProvided) {
    effectiveTemplate = custom ?? fallback
    source = 'custom_input'
  } else if (custom) {
    effectiveTemplate = custom
    source = 'custom_input'
  }

  const mergedVariables = buildWhatsAppTemplateVariables(variables)
  const preview = applyWhatsAppTemplate(effectiveTemplate, mergedVariables)

  return {
    source,
    effectiveTemplate,
    variables: mergedVariables,
    preview,
  }
}
