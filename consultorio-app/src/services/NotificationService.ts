import {
  AppointmentStatus,
  AuditAction,
  NotificationChannel,
  NotificationStatus,
  NotificationType,
  Prisma,
  WhatsAppMessageAction,
  WhatsAppMessageDirection,
} from '@prisma/client'
import { addHours, addMinutes, format, subHours, subMinutes } from 'date-fns'
import prisma from '../lib/prisma'
import { WhatsAppMessageLogService } from './WhatsAppMessageLogService'
import { getWhatsAppProviderSendUrl } from '@/lib/whatsappProvider'
import { AppointmentAuditService } from './AppointmentAuditService'
import { formatPatientName } from '@/lib/patientName'
import { sendSms } from '@/lib/smsProvider'
import { sendEmail, EmailAction } from '@/lib/emailProvider'
import {
  signAppointmentActionToken,
  buildActionMarker,
  extractActionToken,
  stripActionMarker,
  buildCitaUrl,
} from '@/lib/appointmentActionToken'
import { createShortLink, buildShortUrl } from '@/lib/shortLink'

type QueueNotificationInput = {
  appointmentId: string
  type: NotificationType
  message: string
}

type QueueNotificationResult = {
  id: string
  created: boolean
}

type ProcessQueueOptions = {
  doctorId?: string
  appointmentId?: string
  limit?: number
}

type ProcessQueueResult = {
  processed: number
  sent: number
  failed: number
}

type RetryFailedOptions = {
  doctorId?: string
  appointmentId?: string
  limit?: number
  maxAttempts?: number
  windowHours?: number
}

type RetryFailedResult = {
  inspected: number
  retried: number
  skippedPending: number
  skippedMaxAttempts: number
}

type NotificationStatusOverviewOptions = {
  doctorId: string
  windowDays?: number
  failedLimit?: number
}

type NotificationStatusOverview = {
  windowDays: number
  summary: {
    total: number
    pending: number
    sent: number
    failed: number
    byType: Record<NotificationType, { total: number; pending: number; sent: number; failed: number }>
  }
  retryStats: {
    retriesCreated: number
  }
  pendingOldestAt: string | null
  failedRecent: Array<{
    id: string
    appointmentId: string
    type: NotificationType
    createdAt: string
    reason: string | null
    patientName: string
    appointmentStartTime: string
  }>
}

type EnqueueReminderOptions = {
  doctorId?: string
  leadMinutes?: number
  leadMinutesList?: number[]
  windowMinutes?: number
}

type ApplyAutomaticRulesOptions = {
  doctorId?: string
  now?: Date
}

type ApplyAutomaticRulesResult = {
  scanned: number
  markedOverdue: number
  escalatedReminders: number
  autoClosedNoShow: number
}

type AutomaticRulesConfig = {
  pendingEscalationMinutes: number
  pendingOverdueMinutes: number
  pendingAutoCloseHours: number
}

type DoctorReminderRules = {
  leadMinutesList: number[]
  windowMinutes: number
}

type DoctorMessageTemplates = {
  bookingMessageTemplate: string | null
  questionnaireTemplate: string | null
  reminderPendingTemplate: string | null
  reminderConfirmedTemplate: string | null
}

const DEFAULT_PROCESS_LIMIT = 50
const DEFAULT_REMINDER_LEAD_MINUTES = 60
const DEFAULT_REMINDER_WINDOW_MINUTES = 15
const DEFAULT_RETRY_LIMIT = 50
const DEFAULT_RETRY_MAX_ATTEMPTS = 3
const DEFAULT_RETRY_WINDOW_HOURS = 24
const DEFAULT_PENDING_ESCALATION_MINUTES = 120
const DEFAULT_PENDING_OVERDUE_MINUTES = 0
const DEFAULT_PENDING_AUTO_CLOSE_HOURS = 24
const AUTO_ESCALATION_NOTIFICATION_MARKER = 'AUTO_ESCALATION_PENDING'
const AUTO_CLOSE_NOTIFICATION_MARKER = 'AUTO_NO_SHOW_CLOSE'
const DEFAULT_STATUS_WINDOW_DAYS = 7
const DEFAULT_FAILED_LIST_LIMIT = 10
const DEFAULT_BOOKING_TEMPLATE =
  'Hola {paciente}, tu cita ({tipo_cita}) quedó agendada para el {fecha_hora}. ' +
  'Usa el enlace para confirmar o cancelar tu asistencia.'
const DEFAULT_QUESTIONNAIRE_TEMPLATE =
  'Hola {paciente}, puedes responder este cuestionario preconsulta antes de tu cita: {link_cuestionario}'
const DEFAULT_REMINDER_PENDING_TEMPLATE =
  'Hola {paciente}, te recordamos tu cita el {fecha_hora}. ' +
  'Faltan aproximadamente {tiempo_restante}. Usa el enlace para confirmar o cancelar.'
const DEFAULT_REMINDER_CONFIRMED_TEMPLATE =
  'Hola {paciente}, recordatorio de tu cita el {fecha_hora}. ' +
  'Si necesitas cancelarla, usa el enlace que te enviamos.'

type PendingNotification = Prisma.NotificationGetPayload<{
  include: {
    appointment: {
      include: {
        patient: true
        doctor: {
          include: { doctorConfig: true }
        }
      }
    }
  }
}>

export class NotificationService {
  private static getProviderUrl() {
    return getWhatsAppProviderSendUrl()
  }

  private static getReminderLeadMinutes() {
    const parsed = Number(process.env.NOTIFICATION_REMINDER_LEAD_MINUTES)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
    return DEFAULT_REMINDER_LEAD_MINUTES
  }

  private static getReminderLeadMinutesList() {
    const rawHours = process.env.NOTIFICATION_REMINDER_LEAD_HOURS
    if (rawHours?.trim()) {
      const parsed = rawHours
        .split(',')
        .map((token) => Number(token.trim()))
        .filter((value) => Number.isFinite(value) && value > 0)
        .map((hours) => Math.round(hours * 60))
      if (parsed.length > 0) {
        return Array.from(new Set(parsed)).sort((a, b) => b - a)
      }
    }
    return [this.getReminderLeadMinutes()]
  }

  private static parseLeadHoursList(raw: string | null | undefined): number[] {
    if (!raw?.trim()) return []

    const parsed = raw
      .split(',')
      .map((token) => Number(token.trim()))
      .filter((value) => Number.isFinite(value) && value > 0)
      .map((hours) => Math.round(hours * 60))

    return Array.from(new Set(parsed)).sort((a, b) => b - a)
  }

  private static getReminderWindowMinutes() {
    const parsed = Number(process.env.NOTIFICATION_REMINDER_WINDOW_MINUTES)
    if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed)
    return DEFAULT_REMINDER_WINDOW_MINUTES
  }

  private static sanitizeLeadMinutesList(values: number[]): number[] {
    const clean = values
      .map((value) => Math.round(value))
      .filter((value) => Number.isFinite(value) && value > 0)
    return Array.from(new Set(clean)).sort((a, b) => b - a)
  }

  private static getBaseReminderRules(): DoctorReminderRules {
    return {
      leadMinutesList: this.getReminderLeadMinutesList(),
      windowMinutes: this.getReminderWindowMinutes(),
    }
  }

  private static async getDoctorReminderRules(doctorId: string): Promise<DoctorReminderRules> {
    const defaults = this.getBaseReminderRules()

    try {
      const rows = await prisma.$queryRaw<Array<{
        reminderLeadHours: string | null
        reminderWindowMinutes: number | null
      }>>`
        SELECT "reminderLeadHours", "reminderWindowMinutes"
        FROM "DoctorConfig"
        WHERE "doctorId" = ${doctorId}
        LIMIT 1
      `

      const row = rows[0]
      if (!row) return defaults

      const leadFromConfig = this.parseLeadHoursList(row.reminderLeadHours)
      const windowFromConfig =
        typeof row.reminderWindowMinutes === 'number' && Number.isFinite(row.reminderWindowMinutes) && row.reminderWindowMinutes > 0
          ? Math.round(row.reminderWindowMinutes)
          : defaults.windowMinutes

      return {
        leadMinutesList: leadFromConfig.length > 0 ? leadFromConfig : defaults.leadMinutesList,
        windowMinutes: windowFromConfig,
      }
    } catch {
      return defaults
    }
  }

  private static async getDoctorMessageTemplates(doctorId: string): Promise<DoctorMessageTemplates> {
    const defaults: DoctorMessageTemplates = {
      bookingMessageTemplate: null,
      questionnaireTemplate: null,
      reminderPendingTemplate: null,
      reminderConfirmedTemplate: null,
    }

    try {
      const rows = await prisma.$queryRaw<Array<{
        bookingMessageTemplate: string | null
        questionnaireTemplate: string | null
        reminderPendingTemplate: string | null
        reminderConfirmedTemplate: string | null
      }>>`
        SELECT
          "bookingMessageTemplate",
          "questionnaireTemplate",
          "reminderPendingTemplate",
          "reminderConfirmedTemplate"
        FROM "DoctorConfig"
        WHERE "doctorId" = ${doctorId}
        LIMIT 1
      `

      const row = rows[0]
      if (!row) return defaults

      return {
        bookingMessageTemplate: row.bookingMessageTemplate,
        questionnaireTemplate: row.questionnaireTemplate,
        reminderPendingTemplate: row.reminderPendingTemplate,
        reminderConfirmedTemplate: row.reminderConfirmedTemplate,
      }
    } catch {
      return defaults
    }
  }

  private static getRetryMaxAttempts() {
    const parsed = Number(process.env.NOTIFICATION_MAX_RETRY_ATTEMPTS)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
    return DEFAULT_RETRY_MAX_ATTEMPTS
  }

  private static getRetryWindowHours() {
    const parsed = Number(process.env.NOTIFICATION_RETRY_WINDOW_HOURS)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
    return DEFAULT_RETRY_WINDOW_HOURS
  }

  private static parseEnvInteger(options: {
    name: string
    fallback: number
    min: number
    max: number
  }) {
    const raw = process.env[options.name]
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) return options.fallback
    const normalized = Math.round(parsed)
    if (normalized < options.min || normalized > options.max) return options.fallback
    return normalized
  }

  static getAutomaticRulesConfig(): AutomaticRulesConfig {
    return {
      pendingEscalationMinutes: this.parseEnvInteger({
        name: 'NOTIFICATION_PENDING_ESCALATION_MINUTES',
        fallback: DEFAULT_PENDING_ESCALATION_MINUTES,
        min: 1,
        max: 24 * 60,
      }),
      pendingOverdueMinutes: this.parseEnvInteger({
        name: 'NOTIFICATION_PENDING_OVERDUE_MINUTES',
        fallback: DEFAULT_PENDING_OVERDUE_MINUTES,
        min: 0,
        max: 7 * 24 * 60,
      }),
      pendingAutoCloseHours: this.parseEnvInteger({
        name: 'NOTIFICATION_PENDING_AUTO_CLOSE_HOURS',
        fallback: DEFAULT_PENDING_AUTO_CLOSE_HOURS,
        min: 1,
        max: 30 * 24,
      }),
    }
  }

  private static normalizeErrorReason(error: unknown): string {
    if (error instanceof Error) {
      const message = error.message.replace(/\s+/g, ' ').trim()
      return message.slice(0, 160) || 'Error de entrega desconocido'
    }
    return 'Error de entrega desconocido'
  }

  private static failureExternalId(reason: string) {
    return `FAILED:${reason.slice(0, 150)}`
  }

  private static extractFailureReason(externalId: string | null): string | null {
    if (!externalId) return null
    if (!externalId.startsWith('FAILED:')) return null
    return externalId.slice('FAILED:'.length) || null
  }

  private static formatDateTime(date: Date) {
    return format(date, 'dd/MM/yyyy HH:mm')
  }

  private static formatLeadTime(leadMinutes: number) {
    if (leadMinutes % 60 === 0) {
      const hours = leadMinutes / 60
      return hours === 1 ? '1 hora' : `${hours} horas`
    }
    return leadMinutes === 1 ? '1 minuto' : `${leadMinutes} minutos`
  }

  private static formatAppointmentType(type: 'NORMAL' | 'EXTENDED') {
    return type === 'EXTENDED' ? 'extendida' : 'normal'
  }

  private static applyTemplate(template: string | null | undefined, variables: Record<string, string>) {
    if (!template?.trim()) return null

    return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_, key: string) => {
      const value = variables[key]
      return value ?? ''
    })
  }

  private static async queueNotification(input: QueueNotificationInput): Promise<QueueNotificationResult> {
    const channels = [NotificationChannel.SMS, NotificationChannel.EMAIL]
    let firstId: string | null = null
    let anyCreated = false

    for (const channel of channels) {
      const existing = await prisma.notification.findFirst({
        where: {
          appointmentId: input.appointmentId,
          channel,
          type: input.type,
          status: { in: [NotificationStatus.PENDING, NotificationStatus.SENT] },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      })

      if (existing) {
        firstId ??= existing.id
        continue
      }

      const created = await prisma.notification.create({
        data: {
          appointmentId: input.appointmentId,
          channel,
          type: input.type,
          status: NotificationStatus.PENDING,
          message: input.message,
        },
        select: { id: true },
      })

      firstId ??= created.id
      anyCreated = true
    }

    return { id: firstId ?? '', created: anyCreated }
  }

  private static async markFailed(notificationId: string, reason: string) {
    await prisma.notification.update({
      where: { id: notificationId },
      data: {
        status: NotificationStatus.FAILED,
        externalId: this.failureExternalId(reason),
      },
    })
  }

  private static async dispatchPendingNotification(notification: PendingNotification): Promise<boolean> {
    switch (notification.channel) {
      case NotificationChannel.WHATSAPP:
        return this.dispatchWhatsAppNotification(notification)
      case NotificationChannel.SMS:
        return this.dispatchSmsNotification(notification)
      case NotificationChannel.EMAIL:
        return this.dispatchEmailNotification(notification)
      default:
        await this.markFailed(notification.id, `Canal no soportado: ${notification.channel}`)
        return false
    }
  }

  private static async dispatchWhatsAppNotification(notification: PendingNotification): Promise<boolean> {
    const appointment = notification.appointment
    const patientPhone = appointment.patient.phone?.trim()
    if (!patientPhone) {
      await this.markFailed(notification.id, 'El paciente no tiene teléfono registrado.')
      return false
    }

    if (!appointment.doctor.doctorConfig?.whatsappConnected) {
      await this.markFailed(notification.id, 'El WhatsApp del médico no está conectado.')
      return false
    }

    try {
      const response = await fetch(this.getProviderUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorId: appointment.doctorId,
          to: patientPhone,
          message: notification.message,
          notificationId: notification.id,
          type: notification.type,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => '')
        throw new Error(errorText || `Proveedor WhatsApp respondió con estado ${response.status}`)
      }

      const payload = await response.json().catch(() => null) as { id?: string; messageId?: string } | null
      const externalId = payload?.messageId || payload?.id

      await prisma.notification.update({
        where: { id: notification.id },
        data: { status: NotificationStatus.SENT, sentAt: new Date(), externalId: externalId || null },
      })

      await WhatsAppMessageLogService.create({
        doctorId: appointment.doctorId,
        appointmentId: appointment.id,
        patientId: appointment.patient.id,
        phone: patientPhone,
        message: notification.message,
        direction: WhatsAppMessageDirection.OUTBOUND,
        action: WhatsAppMessageAction.NOTIFICATION_SENT,
      })

      return true
    } catch (error: unknown) {
      const reason = this.normalizeErrorReason(error)
      console.error(`[NotificationService] WhatsApp fallo ${notification.id}: ${reason}`, error)
      await this.markFailed(notification.id, reason)
      return false
    }
  }

  private static async dispatchSmsNotification(notification: PendingNotification): Promise<boolean> {
    const patient = notification.appointment.patient
    const phone = patient.phone?.trim()
    if (!phone) {
      await this.markFailed(notification.id, 'El paciente no tiene teléfono registrado.')
      return false
    }

    const actionToken = extractActionToken(notification.message)
    let body = stripActionMarker(notification.message)
    if (actionToken) {
      const baseUrl = process.env.APP_BASE_URL ?? ''
      const citaUrl = buildCitaUrl(baseUrl, actionToken)
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      const code = await createShortLink(citaUrl, expiresAt)
      body += `\nGestiona tu cita: ${buildShortUrl(baseUrl, code)}`
    }

    try {
      const { sid } = await sendSms(phone, body)
      await prisma.notification.update({
        where: { id: notification.id },
        data: { status: NotificationStatus.SENT, sentAt: new Date(), externalId: sid },
      })
      return true
    } catch (error: unknown) {
      const reason = this.normalizeErrorReason(error)
      console.error(`[NotificationService] SMS fallo ${notification.id}: ${reason}`, error)
      await this.markFailed(notification.id, reason)
      return false
    }
  }

  private static async dispatchEmailNotification(notification: PendingNotification): Promise<boolean> {
    const isDoctorAlert = notification.message.startsWith('[DOCTOR] ')
    const recipientEmail = notification.recipientEmail?.trim()
      ?? (!isDoctorAlert ? notification.appointment.patient.email?.trim() : undefined)

    if (!recipientEmail) {
      await this.markFailed(notification.id, isDoctorAlert
        ? 'Sin email de destino para alerta al médico.'
        : 'El paciente no tiene correo electrónico registrado.')
      return false
    }

    const rawMessage = isDoctorAlert
      ? notification.message.slice('[DOCTOR] '.length)
      : notification.message

    const subject = isDoctorAlert ? 'Aviso de MiDoc' : this.resolveEmailSubject(notification.type)
    const actionToken = isDoctorAlert ? null : extractActionToken(rawMessage)
    const text = isDoctorAlert ? rawMessage : stripActionMarker(rawMessage)
    const email = recipientEmail

    let actions: EmailAction[] | undefined
    if (actionToken) {
      const baseUrl = process.env.APP_BASE_URL ?? ''
      const citaUrl = buildCitaUrl(baseUrl, actionToken)
      actions = [
        { label: 'Confirmar asistencia', url: `${citaUrl}?accion=confirmar`, variant: 'primary' },
        { label: 'Cancelar cita', url: `${citaUrl}?accion=cancelar`, variant: 'danger' },
      ]
    }

    try {
      const { id } = await sendEmail({ to: email, subject, text, actions })
      await prisma.notification.update({
        where: { id: notification.id },
        data: { status: NotificationStatus.SENT, sentAt: new Date(), externalId: id },
      })
      return true
    } catch (error: unknown) {
      const reason = this.normalizeErrorReason(error)
      console.error(`[NotificationService] Email fallo ${notification.id}: ${reason}`, error)
      await this.markFailed(notification.id, reason)
      return false
    }
  }

  private static resolveEmailSubject(type: NotificationType): string {
    switch (type) {
      case NotificationType.CONFIRMATION: return 'Confirmación de tu cita médica'
      case NotificationType.REMINDER: return 'Recordatorio de tu cita médica'
      case NotificationType.QUESTIONNAIRE_INVITATION: return 'Cuestionario preconsulta'
      default: return 'Notificación de MiDoc'
    }
  }

  static async enqueueConfirmation(appointmentId: string): Promise<QueueNotificationResult | null> {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { patient: true },
    })
    if (!appointment) return null

    const templates = await this.getDoctorMessageTemplates(appointment.doctorId)
    const templateVars = {
      paciente: formatPatientName(appointment.patient),
      fecha_hora: this.formatDateTime(appointment.startTime),
      fecha: format(appointment.startTime, 'dd/MM/yyyy'),
      hora: format(appointment.startTime, 'HH:mm'),
      tipo_cita: this.formatAppointmentType(appointment.appointmentType),
      estado_cita: appointment.status,
    }

    const baseMsg =
      this.applyTemplate(templates.bookingMessageTemplate, templateVars) ??
      this.applyTemplate(DEFAULT_BOOKING_TEMPLATE, templateVars)!

    const actionToken = await signAppointmentActionToken(appointmentId)
    const msg = `${baseMsg}\n${buildActionMarker(actionToken)}`

    return this.queueNotification({
      appointmentId,
      type: NotificationType.CONFIRMATION,
      message: msg,
    })
  }

  static async enqueueQuestionnaireInvitation(
    appointmentId: string,
    tokenUrl: string
  ): Promise<QueueNotificationResult | null> {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { patient: true },
    })
    if (!appointment) return null

    const templates = await this.getDoctorMessageTemplates(appointment.doctorId)
    const templateVars = {
      paciente: formatPatientName(appointment.patient),
      fecha_hora: this.formatDateTime(appointment.startTime),
      fecha: format(appointment.startTime, 'dd/MM/yyyy'),
      hora: format(appointment.startTime, 'HH:mm'),
      tipo_cita: this.formatAppointmentType(appointment.appointmentType),
      estado_cita: appointment.status,
      link_cuestionario: tokenUrl,
    }

    const msg =
      this.applyTemplate(templates.questionnaireTemplate, templateVars) ??
      this.applyTemplate(DEFAULT_QUESTIONNAIRE_TEMPLATE, templateVars)!

    return this.queueNotification({
      appointmentId,
      type: NotificationType.QUESTIONNAIRE_INVITATION,
      message: msg,
    })
  }

  static async applyAutomaticAppointmentRules(
    options: ApplyAutomaticRulesOptions = {}
  ): Promise<ApplyAutomaticRulesResult> {
    const now = options.now ?? new Date()
    const config = this.getAutomaticRulesConfig()

    const candidates = await prisma.appointment.findMany({
      where: {
        ...(options.doctorId ? { doctorId: options.doctorId } : {}),
        status: AppointmentStatus.PENDING,
        startTime: { lte: addMinutes(now, config.pendingEscalationMinutes) },
      },
      include: {
        patient: true,
        doctor: {
          include: {
            doctorConfig: true,
          },
        },
      },
      orderBy: { startTime: 'asc' },
    })

    if (candidates.length === 0) {
      return {
        scanned: 0,
        markedOverdue: 0,
        escalatedReminders: 0,
        autoClosedNoShow: 0,
      }
    }

    const appointmentIds = candidates.map((appointment) => appointment.id)
    const trackedActions = [
      AuditAction.APPOINTMENT_MARKED_OVERDUE,
      AuditAction.APPOINTMENT_REMINDER_ESCALATED,
      AuditAction.APPOINTMENT_AUTO_CLOSED_NO_SHOW,
    ]

    const [previousAudits, escalationNotifications, closeNotifications] = await Promise.all([
      prisma.appointmentAuditLog.findMany({
        where: {
          appointmentId: { in: appointmentIds },
          action: { in: trackedActions },
        },
        select: {
          appointmentId: true,
          action: true,
        },
      }),
      prisma.notification.findMany({
        where: {
          appointmentId: { in: appointmentIds },
          type: NotificationType.REMINDER,
          externalId: AUTO_ESCALATION_NOTIFICATION_MARKER,
          status: { in: [NotificationStatus.PENDING, NotificationStatus.SENT, NotificationStatus.FAILED] },
        },
        select: { appointmentId: true },
      }),
      prisma.notification.findMany({
        where: {
          appointmentId: { in: appointmentIds },
          type: NotificationType.REMINDER,
          externalId: AUTO_CLOSE_NOTIFICATION_MARKER,
          status: { in: [NotificationStatus.PENDING, NotificationStatus.SENT, NotificationStatus.FAILED] },
        },
        select: { appointmentId: true },
      }),
    ])

    const actionSetByAppointment = new Map<string, Set<AuditAction>>()
    for (const record of previousAudits) {
      if (!record.appointmentId) continue
      const current = actionSetByAppointment.get(record.appointmentId) ?? new Set<AuditAction>()
      current.add(record.action)
      actionSetByAppointment.set(record.appointmentId, current)
    }

    const escalationNotificationSet = new Set(escalationNotifications.map((record) => record.appointmentId))
    const closeNotificationSet = new Set(closeNotifications.map((record) => record.appointmentId))

    let markedOverdue = 0
    let escalatedReminders = 0
    let autoClosedNoShow = 0

    const pendingAuditLogs: Parameters<typeof AppointmentAuditService.safeBatchLog>[0] = []
    const pendingNotifications: Array<{
      appointmentId: string
      channel: NotificationChannel
      type: NotificationType
      status: NotificationStatus
      externalId: string
      message: string
    }> = []
    const doctorAlertsToSend: Parameters<typeof NotificationService.notifyDoctorAppointmentAutoClosedNoShow>[0][] = []

    for (const appointment of candidates) {
      const appointmentActions = actionSetByAppointment.get(appointment.id) ?? new Set<AuditAction>()
      const overdueAt = addMinutes(appointment.endTime, config.pendingOverdueMinutes)
      const autoCloseAt = addHours(overdueAt, config.pendingAutoCloseHours)
      const escalationAt = subMinutes(appointment.startTime, config.pendingEscalationMinutes)

      const isOverdue = now >= overdueAt
      const canEscalate = now >= escalationAt && now < autoCloseAt
      const shouldAutoClose = now >= autoCloseAt

      if (isOverdue && !appointmentActions.has(AuditAction.APPOINTMENT_MARKED_OVERDUE)) {
        pendingAuditLogs.push({
          doctorId: appointment.doctorId,
          appointmentId: appointment.id,
          patientId: appointment.patient.id,
          actorType: 'SYSTEM',
          source: 'AUTOMATION',
          action: 'APPOINTMENT_MARKED_OVERDUE',
          fromStatus: AppointmentStatus.PENDING,
          toStatus: AppointmentStatus.PENDING,
          metadata: {
            overdueAt: overdueAt.toISOString(),
            pendingOverdueMinutes: config.pendingOverdueMinutes,
          },
        })
        appointmentActions.add(AuditAction.APPOINTMENT_MARKED_OVERDUE)
        markedOverdue += 1
      }

      if (
        canEscalate &&
        !appointmentActions.has(AuditAction.APPOINTMENT_REMINDER_ESCALATED) &&
        !escalationNotificationSet.has(appointment.id)
      ) {
        const patientDisplay = formatPatientName(appointment.patient)
        const baseEscalationMessage = isOverdue
          ? `Hola ${patientDisplay}, tu cita del ${this.formatDateTime(appointment.startTime)} está marcada como vencida por falta de confirmación. Usa el enlace para confirmar o cancelar.`
          : `Hola ${patientDisplay}, tu cita del ${this.formatDateTime(appointment.startTime)} sigue pendiente de confirmación. Usa el enlace para confirmar o cancelar.`

        const escalationToken = await signAppointmentActionToken(appointment.id)
        const message = `${baseEscalationMessage}\n${buildActionMarker(escalationToken)}`

        for (const channel of [NotificationChannel.SMS, NotificationChannel.EMAIL]) {
          pendingNotifications.push({
            appointmentId: appointment.id,
            channel,
            type: NotificationType.REMINDER,
            status: NotificationStatus.PENDING,
            externalId: AUTO_ESCALATION_NOTIFICATION_MARKER,
            message,
          })
        }

        pendingAuditLogs.push({
          doctorId: appointment.doctorId,
          appointmentId: appointment.id,
          patientId: appointment.patient.id,
          actorType: 'SYSTEM',
          source: 'AUTOMATION',
          action: 'APPOINTMENT_REMINDER_ESCALATED',
          fromStatus: AppointmentStatus.PENDING,
          toStatus: AppointmentStatus.PENDING,
          metadata: {
            escalationAt: escalationAt.toISOString(),
            pendingEscalationMinutes: config.pendingEscalationMinutes,
            overdue: isOverdue,
          },
        })

        appointmentActions.add(AuditAction.APPOINTMENT_REMINDER_ESCALATED)
        escalationNotificationSet.add(appointment.id)
        escalatedReminders += 1
      }

      if (shouldAutoClose && !appointmentActions.has(AuditAction.APPOINTMENT_AUTO_CLOSED_NO_SHOW)) {
        // Status update must stay per-appointment to guard against concurrent changes
        const updateResult = await prisma.appointment.updateMany({
          where: { id: appointment.id, status: AppointmentStatus.PENDING },
          data: { status: AppointmentStatus.CANCELLED },
        })

        if (updateResult.count > 0) {
          pendingAuditLogs.push({
            doctorId: appointment.doctorId,
            appointmentId: appointment.id,
            patientId: appointment.patient.id,
            actorType: 'SYSTEM',
            source: 'AUTOMATION',
            action: 'APPOINTMENT_AUTO_CLOSED_NO_SHOW',
            fromStatus: AppointmentStatus.PENDING,
            toStatus: AppointmentStatus.CANCELLED,
            metadata: {
              autoCloseAt: autoCloseAt.toISOString(),
              pendingAutoCloseHours: config.pendingAutoCloseHours,
            },
          })

          if (!closeNotificationSet.has(appointment.id)) {
            const closeMessage =
              `Hola ${formatPatientName(appointment.patient)}, tu cita del ${this.formatDateTime(appointment.startTime)} ` +
              'se canceló automáticamente por falta de confirmación. Contáctanos si deseas reagendar.'

            for (const channel of [NotificationChannel.SMS, NotificationChannel.EMAIL]) {
              pendingNotifications.push({
                appointmentId: appointment.id,
                channel,
                type: NotificationType.REMINDER,
                status: NotificationStatus.PENDING,
                externalId: AUTO_CLOSE_NOTIFICATION_MARKER,
                message: closeMessage,
              })
            }

            closeNotificationSet.add(appointment.id)
            doctorAlertsToSend.push(appointment)
          }

          appointmentActions.add(AuditAction.APPOINTMENT_AUTO_CLOSED_NO_SHOW)
          autoClosedNoShow += 1
        }
      }
    }

    // Flush accumulated writes in parallel
    await Promise.all([
      pendingNotifications.length > 0
        ? prisma.notification.createMany({ data: pendingNotifications })
        : Promise.resolve(),
      AppointmentAuditService.safeBatchLog(pendingAuditLogs),
      ...doctorAlertsToSend.map((a) => this.notifyDoctorAppointmentAutoClosedNoShow(a)),
    ])

    return {
      scanned: candidates.length,
      markedOverdue,
      escalatedReminders,
      autoClosedNoShow,
    }
  }

  private static async notifyDoctorAppointmentAutoClosedNoShow(appointment: {
    id: string
    startTime: Date
    doctor: { email: string; name: string }
    patient: { firstName: string; lastNamePaternal: string }
  }) {
    const doctorEmail = appointment.doctor.email
    if (!doctorEmail) return
    const patientName = `${appointment.patient.firstName} ${appointment.patient.lastNamePaternal}`.trim()
    const dateStr = format(appointment.startTime, 'dd/MM/yyyy HH:mm')
    await prisma.notification.create({
      data: {
        appointmentId: appointment.id,
        channel: NotificationChannel.EMAIL,
        type: NotificationType.REMINDER,
        status: NotificationStatus.PENDING,
        recipientEmail: doctorEmail,
        message: `[DOCTOR] La cita del paciente ${patientName} del ${dateStr} fue cancelada automáticamente por falta de confirmación. El slot ha quedado disponible.`,
      },
    })
  }

  static async enqueueDoctorAlert(appointmentId: string, doctorEmail: string, message: string) {
    await prisma.notification.create({
      data: {
        appointmentId,
        channel: NotificationChannel.EMAIL,
        type: NotificationType.REMINDER,
        status: NotificationStatus.PENDING,
        recipientEmail: doctorEmail,
        message: `[DOCTOR] ${message}`,
      },
    })
  }

  static async enqueueDueReminders(options: EnqueueReminderOptions = {}) {
    const hasManualLeadOverride = Boolean(options.leadMinutesList?.length || options.leadMinutes)
    const baseRules = this.getBaseReminderRules()
    const overrideLeadMinutesList = this.sanitizeLeadMinutesList(
      options.leadMinutesList?.length
        ? options.leadMinutesList
        : options.leadMinutes
          ? [options.leadMinutes]
          : []
    )

    const effectiveLeadMinutesList = hasManualLeadOverride ? overrideLeadMinutesList : baseRules.leadMinutesList
    if (effectiveLeadMinutesList.length === 0) {
      return { scanned: 0, queued: 0 }
    }

    const effectiveWindowMinutes = options.windowMinutes ?? baseRules.windowMinutes
    const now = new Date()

    let maxLeadMinutes = Math.max(...effectiveLeadMinutesList)

    const doctorRuleMap = new Map<string, DoctorReminderRules>()
    if (!hasManualLeadOverride) {
      if (options.doctorId) {
        const rules = await this.getDoctorReminderRules(options.doctorId)
        doctorRuleMap.set(options.doctorId, rules)
        maxLeadMinutes = Math.max(...rules.leadMinutesList)
      } else {
        const configs = await prisma.doctorConfig.findMany({
          select: { doctorId: true },
        })

        const ruleEntries = await Promise.all(
          configs.map(async (config) => {
            const rules = await this.getDoctorReminderRules(config.doctorId)
            return [config.doctorId, rules] as const
          })
        )

        for (const [doctorId, rules] of ruleEntries) {
          doctorRuleMap.set(doctorId, rules)
          maxLeadMinutes = Math.max(maxLeadMinutes, ...rules.leadMinutesList)
        }
      }
    }

    const reminderWindowEnd = addMinutes(now, maxLeadMinutes + effectiveWindowMinutes)

    const appointments = await prisma.appointment.findMany({
      where: {
        ...(options.doctorId ? { doctorId: options.doctorId } : {}),
        status: { in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED] },
        startTime: { gt: now, lte: reminderWindowEnd },
      },
      include: {
        patient: true,
        doctor: {
          include: {
            doctorConfig: true,
          },
        },
      },
      orderBy: { startTime: 'asc' },
    })

    if (appointments.length === 0) {
      return { scanned: 0, queued: 0 }
    }

    const existingReminders = await prisma.notification.findMany({
      where: {
        appointmentId: { in: appointments.map((appointment) => appointment.id) },
        type: NotificationType.REMINDER,
        channel: { in: [NotificationChannel.SMS, NotificationChannel.EMAIL] },
        status: { in: [NotificationStatus.PENDING, NotificationStatus.SENT, NotificationStatus.FAILED] },
      },
      select: { appointmentId: true, message: true, channel: true },
    })

    // Key includes channel so SMS and EMAIL are tracked independently
    const existingReminderKeys = new Set(
      existingReminders.map((n) => `${n.appointmentId}|${n.message}|${n.channel}`)
    )
    const toCreate: Array<{
      appointmentId: string
      channel: NotificationChannel
      type: NotificationType
      status: NotificationStatus
      message: string
    }> = []

    for (const appointment of appointments) {
      const doctorRules = hasManualLeadOverride
        ? {
            leadMinutesList: effectiveLeadMinutesList,
            windowMinutes: effectiveWindowMinutes,
          }
        : (doctorRuleMap.get(appointment.doctorId) ?? baseRules)

      for (const leadMinutes of doctorRules.leadMinutesList) {
        const reminderStart = subMinutes(appointment.startTime, leadMinutes)
        const reminderEnd = addMinutes(reminderStart, doctorRules.windowMinutes)
        if (now < reminderStart || now > reminderEnd) continue

        const leadLabel = this.formatLeadTime(leadMinutes)
        const templateVars = {
          paciente: formatPatientName(appointment.patient),
          fecha_hora: this.formatDateTime(appointment.startTime),
          fecha: format(appointment.startTime, 'dd/MM/yyyy'),
          hora: format(appointment.startTime, 'HH:mm'),
          tipo_cita: this.formatAppointmentType(appointment.appointmentType),
          estado_cita: appointment.status,
          tiempo_restante: leadLabel,
        }

        const customPendingTemplate = appointment.doctor.doctorConfig?.reminderPendingTemplate ?? null
        const customConfirmedTemplate = appointment.doctor.doctorConfig?.reminderConfirmedTemplate ?? null

        const message =
          appointment.status === AppointmentStatus.PENDING
            ? (
                this.applyTemplate(customPendingTemplate, templateVars) ??
                this.applyTemplate(DEFAULT_REMINDER_PENDING_TEMPLATE, templateVars)!
              )
            : (
                this.applyTemplate(customConfirmedTemplate, templateVars) ??
                this.applyTemplate(DEFAULT_REMINDER_CONFIRMED_TEMPLATE, templateVars)!
              )
        const actionToken = await signAppointmentActionToken(appointment.id)
        const messageWithMarker = `${message}\n${buildActionMarker(actionToken)}`

        for (const channel of [NotificationChannel.SMS, NotificationChannel.EMAIL]) {
          const key = `${appointment.id}|${message}|${channel}`
          if (existingReminderKeys.has(key)) continue
          existingReminderKeys.add(key)
          toCreate.push({
            appointmentId: appointment.id,
            channel,
            type: NotificationType.REMINDER,
            status: NotificationStatus.PENDING,
            message: messageWithMarker,
          })
        }
      }
    }

    if (toCreate.length > 0) {
      await prisma.notification.createMany({ data: toCreate })
    }

    return { scanned: appointments.length, queued: toCreate.length }
  }

  static async processPendingQueue(options: ProcessQueueOptions = {}): Promise<ProcessQueueResult> {
    const limit = options.limit ?? DEFAULT_PROCESS_LIMIT

    const now = new Date()
    const pendingNotifications = await prisma.notification.findMany({
      where: {
        status: NotificationStatus.PENDING,
        OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }],
        ...(options.appointmentId ? { appointmentId: options.appointmentId } : {}),
        ...(options.doctorId ? { appointment: { is: { doctorId: options.doctorId } } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      include: {
        appointment: {
          include: {
            patient: true,
            doctor: {
              include: { doctorConfig: true },
            },
          },
        },
      },
    })

    let sent = 0
    let failed = 0
    for (const notification of pendingNotifications) {
      const wasSent = await this.dispatchPendingNotification(notification)
      if (wasSent) {
        sent += 1
      } else {
        failed += 1
      }
    }

    return {
      processed: pendingNotifications.length,
      sent,
      failed,
    }
  }

  static async retryFailedNotifications(options: RetryFailedOptions = {}): Promise<RetryFailedResult> {
    const limit = options.limit ?? DEFAULT_RETRY_LIMIT
    const maxAttempts = options.maxAttempts ?? this.getRetryMaxAttempts()
    const windowHours = options.windowHours ?? this.getRetryWindowHours()
    const windowStart = subHours(new Date(), windowHours)

    const failedNotifications = await prisma.notification.findMany({
      where: {
        status: NotificationStatus.FAILED,
        createdAt: { gte: windowStart },
        ...(options.appointmentId ? { appointmentId: options.appointmentId } : {}),
        ...(options.doctorId ? { appointment: { is: { doctorId: options.doctorId } } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: {
        id: true,
        appointmentId: true,
        channel: true,
        type: true,
        message: true,
      },
    })

    let retried = 0
    let skippedPending = 0
    let skippedMaxAttempts = 0

    for (const failed of failedNotifications) {
      const pendingAlreadyExists = await prisma.notification.findFirst({
        where: {
          appointmentId: failed.appointmentId,
          type: failed.type,
          message: failed.message,
          channel: failed.channel,
          status: NotificationStatus.PENDING,
        },
        select: { id: true },
      })
      if (pendingAlreadyExists) {
        skippedPending += 1
        continue
      }

      const attempts = await prisma.notification.count({
        where: {
          appointmentId: failed.appointmentId,
          type: failed.type,
          message: failed.message,
          channel: failed.channel,
          createdAt: { gte: windowStart },
        },
      })
      if (attempts >= maxAttempts) {
        skippedMaxAttempts += 1
        continue
      }

      const retryAttemptNumber = attempts // attempts already counted above (1 = first retry)
      const backoffMs = Math.min(Math.pow(2, retryAttemptNumber - 1) * 60_000, 30 * 60_000)
      const scheduledFor = new Date(Date.now() + backoffMs)

      await prisma.notification.create({
        data: {
          appointmentId: failed.appointmentId,
          channel: failed.channel,
          type: failed.type,
          status: NotificationStatus.PENDING,
          message: failed.message,
          externalId: `RETRY_OF:${failed.id}`,
          scheduledFor,
        },
      })
      retried += 1
    }

    return {
      inspected: failedNotifications.length,
      retried,
      skippedPending,
      skippedMaxAttempts,
    }
  }

  static async retryFailedNotificationById(options: {
    doctorId: string
    notificationId: string
    maxAttempts?: number
    windowHours?: number
  }): Promise<{
    created: boolean
    reason?: 'NOT_FOUND' | 'ALREADY_PENDING' | 'MAX_ATTEMPTS_REACHED'
  }> {
    const maxAttempts = options.maxAttempts ?? this.getRetryMaxAttempts()
    const windowHours = options.windowHours ?? this.getRetryWindowHours()
    const windowStart = subHours(new Date(), windowHours)

    const failed = await prisma.notification.findFirst({
      where: {
        id: options.notificationId,
        status: NotificationStatus.FAILED,
        appointment: { is: { doctorId: options.doctorId } },
      },
      select: {
        id: true,
        appointmentId: true,
        channel: true,
        type: true,
        message: true,
      },
    })

    if (!failed) {
      return { created: false, reason: 'NOT_FOUND' }
    }

    const pendingAlreadyExists = await prisma.notification.findFirst({
      where: {
        appointmentId: failed.appointmentId,
        type: failed.type,
        message: failed.message,
        channel: failed.channel,
        status: NotificationStatus.PENDING,
      },
      select: { id: true },
    })

    if (pendingAlreadyExists) {
      return { created: false, reason: 'ALREADY_PENDING' }
    }

    const attempts = await prisma.notification.count({
      where: {
        appointmentId: failed.appointmentId,
        type: failed.type,
        message: failed.message,
        channel: failed.channel,
        createdAt: { gte: windowStart },
      },
    })

    if (attempts >= maxAttempts) {
      return { created: false, reason: 'MAX_ATTEMPTS_REACHED' }
    }

    await prisma.notification.create({
      data: {
        appointmentId: failed.appointmentId,
        channel: failed.channel,
        type: failed.type,
        status: NotificationStatus.PENDING,
        message: failed.message,
        externalId: `RETRY_OF:${failed.id}`,
      },
    })

    return { created: true }
  }

  static async getDoctorNotificationStatus(
    options: NotificationStatusOverviewOptions
  ): Promise<NotificationStatusOverview> {
    const windowDays = options.windowDays ?? DEFAULT_STATUS_WINDOW_DAYS
    const failedLimit = options.failedLimit ?? DEFAULT_FAILED_LIST_LIMIT
    const windowStart = subHours(new Date(), windowDays * 24)

    const records = await prisma.notification.findMany({
      where: {
        createdAt: { gte: windowStart },
        appointment: { is: { doctorId: options.doctorId } },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        appointment: {
          select: {
            id: true,
            startTime: true,
            patient: {
              select: { firstName: true, lastNamePaternal: true, lastNameMaternal: true },
            },
          },
        },
      },
    })

    const byType: Record<NotificationType, { total: number; pending: number; sent: number; failed: number }> = {
      [NotificationType.CONFIRMATION]: { total: 0, pending: 0, sent: 0, failed: 0 },
      [NotificationType.REMINDER]: { total: 0, pending: 0, sent: 0, failed: 0 },
      [NotificationType.QUESTIONNAIRE_INVITATION]: { total: 0, pending: 0, sent: 0, failed: 0 },
    }

    const summary = {
      total: 0,
      pending: 0,
      sent: 0,
      failed: 0,
      byType,
    }

    let pendingOldest: Date | null = null
    let retriesCreated = 0
    const failedRecent: NotificationStatusOverview['failedRecent'] = []

    for (const record of records) {
      summary.total += 1
      byType[record.type].total += 1

      if (record.status === NotificationStatus.PENDING) {
        summary.pending += 1
        byType[record.type].pending += 1
        if (!pendingOldest || record.createdAt < pendingOldest) {
          pendingOldest = record.createdAt
        }
      }

      if (record.status === NotificationStatus.SENT) {
        summary.sent += 1
        byType[record.type].sent += 1
      }

      if (record.status === NotificationStatus.FAILED) {
        summary.failed += 1
        byType[record.type].failed += 1
        if (failedRecent.length < failedLimit) {
          failedRecent.push({
            id: record.id,
            appointmentId: record.appointmentId,
            type: record.type,
            createdAt: record.createdAt.toISOString(),
            reason: this.extractFailureReason(record.externalId),
            patientName: formatPatientName(record.appointment.patient),
            appointmentStartTime: record.appointment.startTime.toISOString(),
          })
        }
      }

      if (record.externalId?.startsWith('RETRY_OF:')) {
        retriesCreated += 1
      }
    }

    return {
      windowDays,
      summary,
      retryStats: {
        retriesCreated,
      },
      pendingOldestAt: pendingOldest ? pendingOldest.toISOString() : null,
      failedRecent,
    }
  }
}
