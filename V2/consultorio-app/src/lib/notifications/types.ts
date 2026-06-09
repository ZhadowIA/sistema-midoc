export type NotificationChannel = "SMS" | "EMAIL";

export type NotificationPayload = {
  channel: NotificationChannel;
  recipient: string;
  message: string;
};
