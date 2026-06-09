DROP INDEX IF EXISTS "Notification_status_createdAt_idx";
CREATE INDEX "Notification_status_channel_createdAt_idx" ON "Notification"("status", "channel", "createdAt");
