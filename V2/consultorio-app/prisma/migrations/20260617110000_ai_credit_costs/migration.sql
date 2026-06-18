-- Add operational AI credit accounting to usage metadata.
-- This stores only the commercial credit cost per AI run, never clinical content.
ALTER TABLE "AiUsageLog"
ADD COLUMN "creditCost" INTEGER NOT NULL DEFAULT 0;
