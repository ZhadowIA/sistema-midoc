-- Operational metadata for duration-priced cloud transcription.
-- Never stores audio, transcript text, diarized segments, or speaker labels.
ALTER TABLE "AiUsageLog"
ADD COLUMN "durationSeconds" INTEGER,
ADD COLUMN "transcriptionMode" TEXT;
