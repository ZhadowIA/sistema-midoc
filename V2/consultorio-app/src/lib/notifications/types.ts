export type NotificationChannel = "SMS" | "EMAIL" | "WHATSAPP";

export type NotificationPayload = {
  channel: NotificationChannel;
  recipient: string;
  message: string;
};
