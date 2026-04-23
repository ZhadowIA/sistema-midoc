-- Fase 5.5: evidencia contractual mínima
-- Convierte LegalAcceptance en historial append-only con IP/UA y contexto.

-- Drop unique constraint on userId to allow multiple acceptances per user
DROP INDEX IF EXISTS "LegalAcceptance_userId_key";

-- Add evidence columns
ALTER TABLE "LegalAcceptance"
  ADD COLUMN "ipAddress" TEXT,
  ADD COLUMN "userAgent" TEXT,
  ADD COLUMN "context" TEXT NOT NULL DEFAULT 'REGISTER';

-- Index for history lookup
CREATE INDEX "LegalAcceptance_userId_createdAt_idx" ON "LegalAcceptance"("userId", "createdAt");
