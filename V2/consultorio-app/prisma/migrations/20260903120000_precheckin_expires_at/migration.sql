-- TTL del buzon para preconsultas (13_contrato_sincronizacion.md §2): un envio
-- que la app del medico nunca confirma con ACK se purga a los 30 dias.

-- AlterTable
ALTER TABLE "PrecheckinSubmission" ADD COLUMN "expiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "PrecheckinSubmission_expiresAt_idx" ON "PrecheckinSubmission"("expiresAt");

-- Backfill: lo ya enviado y aun no purgado hereda la retencion desde su envio
-- (o su creacion si nunca se envio).
UPDATE "PrecheckinSubmission"
SET "expiresAt" = COALESCE("submittedAt", "createdAt") + INTERVAL '30 days'
WHERE "purgedAt" IS NULL AND "expiresAt" IS NULL;
