import { randomUUID } from "node:crypto";

import {
  ConsentType,
  NotificationChannel,
  NotificationKind,
  NotificationStatus,
  PhoneNotificationChannel,
  Prisma,
  type Notification
} from "@prisma/client";

import { writeAuditLog } from "../../lib/audit";
import { env } from "../../lib/env";
import { ServiceError } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { generateOpaqueToken } from "../../lib/security/token";
import { createResendEmailProvider } from "./resend-email-provider";
import { createTwilioSmsProvider, createTwilioWhatsAppProvider } from "./twilio-sms-provider";

class NotificationServiceError extends ServiceError {}

const MAX_NOTIFICATION_ATTEMPTS = 3;
const DEFAULT_BATCH_LIMIT = 25;

type PhoneNotificationChannelInput = {
  patientId?: string | null;
  preferredPhoneChannel?: PhoneNotificationChannel | null;
};

async function latestMessagingConsent(patientId: string, type: ConsentType) {
  const consent = await prisma.consent.findFirst({
    where: {
      patientId,
      type
    },
    orderBy: { grantedAt: "desc" },
    select: { granted: true }
  });

  return consent?.granted ?? null;
}

export async function phoneNotificationChannel(input?: PhoneNotificationChannelInput) {
  const wantsWhatsApp =
    input?.preferredPhoneChannel === PhoneNotificationChannel.WHATSAPP ||
    (!input?.preferredPhoneChannel && env.PHONE_NOTIFICATION_CHANNEL === "WHATSAPP");

  if (!input?.patientId) {
    return NotificationChannel.SMS;
  }

  if (wantsWhatsApp) {
    const whatsappConsent = await latestMessagingConsent(input.patientId, ConsentType.WHATSAPP_NOTIFICATIONS);
    if (whatsappConsent === true) {
      return NotificationChannel.WHATSAPP;
    }
  }

  const smsConsent = await latestMessagingConsent(input.patientId, ConsentType.SMS_NOTIFICATIONS);
  return smsConsent === false ? null : NotificationChannel.SMS;
}

function isPhoneNotificationChannel(channel: NotificationChannel) {
  return channel === NotificationChannel.SMS || channel === NotificationChannel.WHATSAPP;
}

type TemplateContext = {
  actionUrl?: string;
  doctorName?: string | null;
  patientFirstName?: string | null;
  appointmentLabel?: string | null;
  expiresAt?: Date | null;
  resetCode?: string | null;
};

type QueueNotificationInput = {
  doctorId?: string | null;
  patientId?: string | null;
  appointmentId?: string | null;
  channel: NotificationChannel;
  kind: NotificationKind;
  destination: string;
  scheduledFor?: Date | null;
  actionUrl?: string;
  shortLink?: {
    expiresAt?: Date | null;
    maxUses?: number | null;
  };
  template: TemplateContext;
  metadata?: Prisma.InputJsonValue;
};

function asRecord(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Prisma.JsonValue>)
    : {};
}

function formatDate(date: Date | null | undefined) {
  return date ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(date) : null;
}

function buildShortCode() {
  return generateOpaqueToken(4);
}

function templateMessage(kind: NotificationKind, channel: NotificationChannel, context: TemplateContext) {
  const actionUrl = context.actionUrl;
  const appointmentLabel = context.appointmentLabel ? ` ${context.appointmentLabel}` : "";
  const patientGreeting = context.patientFirstName ? `Hola ${context.patientFirstName}, ` : "";
  const expiresText = formatDate(context.expiresAt);

  switch (kind) {
    case NotificationKind.APPOINTMENT_CONFIRMATION:
      return {
        subject: channel === NotificationChannel.EMAIL ? "Confirma tu cita" : null,
        body: `${patientGreeting}tu cita${appointmentLabel} quedo registrada. Confirma o administra tu cita aqui: ${actionUrl}`
      };
    case NotificationKind.APPOINTMENT_REMINDER:
      return {
        subject: channel === NotificationChannel.EMAIL ? "Recordatorio de cita" : null,
        body: `${patientGreeting}te recordamos tu cita${appointmentLabel}. Si necesitas cancelar, entra aqui: ${actionUrl}${expiresText ? `\nEl enlace vence el ${expiresText}.` : ""}`
      };
    case NotificationKind.PRECHECKIN:
      return {
        subject: channel === NotificationChannel.EMAIL ? "Completa tu precheckin" : null,
        body: `${patientGreeting}puedes completar tu precheckin antes de la cita desde este enlace: ${actionUrl}`
      };
    case NotificationKind.DOCUMENT_UPLOAD:
      return {
        subject: channel === NotificationChannel.EMAIL ? "Sube tus estudios" : null,
        body: `${patientGreeting}usa este enlace para subir tus estudios de forma segura: ${actionUrl}${expiresText ? `\nVence: ${expiresText}.` : ""}`
      };
    case NotificationKind.PASSWORD_RESET:
      if (context.resetCode) {
        return {
          subject: channel === NotificationChannel.EMAIL ? "Codigo para recuperar tu cuenta MiDoc" : null,
          body: `Tu codigo MiDoc para restablecer la contrasena es: ${context.resetCode}${expiresText ? `\nEl codigo vence el ${expiresText}.` : ""} Si no solicitaste este cambio, ignora este mensaje.`
        };
      }

      return {
        subject: channel === NotificationChannel.EMAIL ? "Restablece tu contrasena" : null,
        body: `Para restablecer la contrasena de tu cuenta MiDoc entra a: ${actionUrl}${expiresText ? `\nEl enlace vence el ${expiresText}.` : ""} Si no solicitaste este cambio, ignora este mensaje.`
      };
    case NotificationKind.EMAIL_VERIFICATION:
      return {
        subject: channel === NotificationChannel.EMAIL ? "Verifica tu correo MiDoc" : null,
        body: `Verifica tu correo para poder publicar tu perfil medico en MiDoc: ${actionUrl}${expiresText ? `\nEl enlace vence el ${expiresText}.` : ""}`
      };
    case NotificationKind.LICENSE_UPDATES_ENDING: {
      const until = context.expiresAt
        ? new Intl.DateTimeFormat("es-MX", { dateStyle: "long" }).format(context.expiresAt)
        : null;
      return {
        subject: channel === NotificationChannel.EMAIL ? "Tus actualizaciones de MiDoc estan por terminar" : null,
        body: `Las actualizaciones incluidas en tu licencia de MiDoc terminan${until ? ` el ${until}` : " pronto"}. Tu expediente y la app siguen funcionando igual despues de esa fecha; solo dejaras de recibir versiones nuevas. Si quieres seguir recibiendolas, renueva desde tu cuenta: ${actionUrl}`
      };
    }
    case NotificationKind.GENERAL:
      return {
        subject: channel === NotificationChannel.EMAIL ? "Mensaje MiDoc" : null,
        body: actionUrl ? `Tienes un mensaje en MiDoc: ${actionUrl}` : "Tienes un mensaje en MiDoc."
      };
    default:
      return {
        subject: channel === NotificationChannel.EMAIL ? "Notificacion MiDoc" : null,
        body: actionUrl ? `Revisa esta accion en MiDoc: ${actionUrl}` : "Tienes una notificacion en MiDoc."
      };
  }
}

async function createShortLink(input: {
  doctorId?: string | null;
  patientId?: string | null;
  appointmentId?: string | null;
  destinationUrl: string;
  expiresAt?: Date | null;
  maxUses?: number | null;
}) {
  return prisma.shortLink.create({
    data: {
      doctorId: input.doctorId ?? null,
      patientId: input.patientId ?? null,
      appointmentId: input.appointmentId ?? null,
      destinationUrl: input.destinationUrl,
      code: buildShortCode(),
      expiresAt: input.expiresAt ?? null,
      maxUses: input.maxUses ?? 10
    }
  });
}

export async function queueNotification(input: QueueNotificationInput) {
  let shortLinkId: string | null = null;
  let actionUrl = input.actionUrl;

  if (isPhoneNotificationChannel(input.channel) && input.actionUrl) {
    const shortLink = await createShortLink({
      doctorId: input.doctorId,
      patientId: input.patientId,
      appointmentId: input.appointmentId,
      destinationUrl: input.actionUrl,
      expiresAt: input.shortLink?.expiresAt ?? input.template.expiresAt ?? null,
      maxUses: input.shortLink?.maxUses ?? 10
    });

    shortLinkId = shortLink.id;
    actionUrl = `${env.APP_BASE_URL}/s/${shortLink.code}`;
  }

  const rendered = templateMessage(input.kind, input.channel, {
    ...input.template,
    actionUrl
  });

  return prisma.notification.create({
    data: {
      doctorId: input.doctorId ?? null,
      patientId: input.patientId ?? null,
      appointmentId: input.appointmentId ?? null,
      shortLinkId,
      channel: input.channel,
      kind: input.kind,
      destination: input.destination,
      subject: rendered.subject,
      body: rendered.body,
      status: NotificationStatus.PENDING,
      scheduledFor: input.scheduledFor ?? null,
      metadata: {
        ...(asRecord(input.metadata as Prisma.JsonValue | null) ?? {}),
        templateKind: input.kind
      }
    }
  });
}

function getMockFailureCount(notification: Notification) {
  const metadata = asRecord(notification.metadata);
  const rawValue = metadata.mockFailTimes;
  if (typeof rawValue === "number") {
    return rawValue;
  }
  if (typeof rawValue === "string") {
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

async function deliverNotification(notification: Notification) {
  const mockFailTimes = getMockFailureCount(notification);

  if (notification.retryCount < mockFailTimes) {
    throw new NotificationServiceError("Mock provider transient failure.", 502);
  }

  if (notification.channel === NotificationChannel.SMS && env.SMS_PROVIDER.toLowerCase() === "twilio") {
    const provider = createTwilioSmsProvider({
      accountSid: env.TWILIO_ACCOUNT_SID ?? "",
      authToken: env.TWILIO_AUTH_TOKEN ?? "",
      baseUrl: env.SMS_BASE_URL,
      fromPhoneNumber: env.TWILIO_FROM_PHONE_NUMBER,
      messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID
    });

    return provider.sendSms({
      to: notification.destination,
      body: notification.body
    });
  }

  if (notification.channel === NotificationChannel.WHATSAPP && env.WHATSAPP_PROVIDER.toLowerCase() === "twilio") {
    const provider = createTwilioWhatsAppProvider({
      accountSid: env.TWILIO_ACCOUNT_SID ?? "",
      authToken: env.TWILIO_AUTH_TOKEN ?? "",
      baseUrl: env.SMS_BASE_URL,
      fromPhoneNumber: env.TWILIO_WHATSAPP_FROM_PHONE_NUMBER,
      messagingServiceSid: env.TWILIO_WHATSAPP_MESSAGING_SERVICE_SID
    });

    return provider.sendWhatsApp({
      to: notification.destination,
      body: notification.body
    });
  }

  if (notification.channel === NotificationChannel.EMAIL && env.EMAIL_PROVIDER.toLowerCase() === "resend") {
    const provider = createResendEmailProvider({
      apiKey: env.EMAIL_API_KEY,
      baseUrl: env.EMAIL_BASE_URL,
      from: env.EMAIL_FROM
    });

    return provider.sendEmail({
      to: notification.destination,
      subject: notification.subject ?? "Notificacion MiDoc",
      body: notification.body
    });
  }

  const provider = {
    [NotificationChannel.SMS]: env.SMS_PROVIDER.toUpperCase(),
    [NotificationChannel.WHATSAPP]: env.WHATSAPP_PROVIDER.toUpperCase(),
    [NotificationChannel.EMAIL]: env.EMAIL_PROVIDER.toUpperCase()
  }[notification.channel];

  return {
    provider,
    providerMessageId: `${provider.toLowerCase()}-${randomUUID()}`
  };
}

function retryDelayMs(retryCount: number) {
  return retryCount * 5 * 60_000;
}

export async function processNotificationQueue(input?: { limit?: number; now?: Date; doctorId?: string }) {
  const now = input?.now ?? new Date();
  const limit = input?.limit ?? DEFAULT_BATCH_LIMIT;

  const queue = await prisma.notification.findMany({
    where: {
      ...(input?.doctorId ? { doctorId: input.doctorId } : {}),
      status: {
        in: [NotificationStatus.PENDING, NotificationStatus.RETRIED]
      },
      OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }]
    },
    orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }],
    take: limit
  });

  const stats = {
    processed: 0,
    sent: 0,
    retried: 0,
    failed: 0
  };

  for (const notification of queue) {
    stats.processed += 1;
    const updated = await attemptDelivery(notification, now);
    if (updated.status === NotificationStatus.SENT) stats.sent += 1;
    else if (updated.status === NotificationStatus.RETRIED) stats.retried += 1;
    else stats.failed += 1;
  }

  return stats;
}

/**
 * Un intento de envio: lo marca enviado, o reintentable / fallido segun los
 * intentos. Nunca lanza por un error del proveedor; queda en `lastError`.
 */
async function attemptDelivery(notification: Notification, now: Date): Promise<Notification> {
  try {
    const delivery = await deliverNotification(notification);
    return await prisma.notification.update({
      where: { id: notification.id },
      data: {
        provider: delivery.provider,
        providerMessageId: delivery.providerMessageId,
        status: NotificationStatus.SENT,
        sentAt: now,
        failedAt: null,
        lastError: null
      }
    });
  } catch (error) {
    const nextRetryCount = notification.retryCount + 1;
    const message = error instanceof Error ? error.message : "Unknown notification error.";

    if (nextRetryCount < MAX_NOTIFICATION_ATTEMPTS) {
      return prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: NotificationStatus.RETRIED,
          retryCount: nextRetryCount,
          failedAt: now,
          lastError: message,
          scheduledFor: new Date(now.getTime() + retryDelayMs(nextRetryCount))
        }
      });
    }
    return prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: NotificationStatus.FAILED,
        retryCount: nextRetryCount,
        failedAt: now,
        lastError: message
      }
    });
  }
}

/** Avisos de la cuenta del medico: no forman parte de las notificaciones congeladas. */
const ACCOUNT_NOTIFICATION_KINDS: ReadonlySet<NotificationKind> = new Set([
  NotificationKind.EMAIL_VERIFICATION,
  NotificationKind.PASSWORD_RESET,
  NotificationKind.LICENSE_UPDATES_ENDING
]);

/**
 * Verificar correo y recuperar contrasena salen en el momento, sin esperar la
 * cola: su envio programado (`/api/internal/notifications`) esta congelado con
 * las notificaciones al paciente desde el paso 27, y un enlace de verificacion
 * que llega horas despues no sirve. Si el proveedor falla, la peticion del
 * medico no se cae: la notificacion queda para reintento con su error.
 */
export async function sendAccountNotification(input: QueueNotificationInput): Promise<Notification> {
  if (!ACCOUNT_NOTIFICATION_KINDS.has(input.kind)) {
    throw new NotificationServiceError("Solo los avisos de la cuenta salen en el momento.", 400);
  }
  const notification = await queueNotification(input);
  return attemptDelivery(notification, new Date());
}

export async function resolveShortLink(code: string, context?: { ipAddress?: string }) {
  const link = await prisma.shortLink.findUnique({
    where: { code }
  });

  if (!link) {
    throw new NotificationServiceError("Enlace no encontrado.", 404);
  }

  if (link.expiresAt && link.expiresAt <= new Date()) {
    throw new NotificationServiceError("Este enlace ya expiro.", 410);
  }

  if (link.maxUses !== null && link.useCount >= link.maxUses) {
    throw new NotificationServiceError("Este enlace ya no esta disponible.", 410);
  }

  await prisma.shortLink.update({
    where: { id: link.id },
    data: {
      useCount: { increment: 1 }
    }
  });

  await writeAuditLog({
    actorUserId: link.createdByUserId,
    entityType: "ShortLink",
    entityId: link.id,
    action: "notification.short-link-opened",
    source: "notification-service",
    metadata: { ipAddress: context?.ipAddress ?? null }
  });

  return {
    destinationUrl: link.destinationUrl
  };
}

export async function listDoctorNotifications(doctorUserId: string, limit = 100) {
  return prisma.notification.findMany({
    where: { doctorId: doctorUserId },
    orderBy: [{ createdAt: "desc" }],
    take: limit
  });
}
