-- Add operational metadata for governed cloud transcription billing.
-- Both columns are OPERATIVO: they hold no clinical content. `durationSeconds`
-- is the authoritative WAV duration validated by the portal; `transcriptionMode`
-- is "standard" or "diarized". Nullable so existing rows migrate cleanly.
ALTER TABLE "AiUsageLog" ADD COLUMN "durationSeconds" INTEGER;
ALTER TABLE "AiUsageLog" ADD COLUMN "transcriptionMode" TEXT;
