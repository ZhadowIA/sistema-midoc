-- Paso 11: reporte de metadatos de uso IA desde la app local al portal.
-- Clase: OPERATIVO. Solo propiedad, idempotencia y referencias locales; nunca
-- contenido clinico, prompts ni salidas de IA.
ALTER TABLE "AiUsageLog"
  ADD COLUMN "doctorId" TEXT,
  ADD COLUMN "externalRunId" TEXT,
  ADD COLUMN "reportedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "AiUsageLog_doctorId_externalRunId_key"
  ON "AiUsageLog"("doctorId", "externalRunId");

CREATE INDEX "AiUsageLog_doctorId_createdAt_idx"
  ON "AiUsageLog"("doctorId", "createdAt");

ALTER TABLE "AiUsageLog"
  ADD CONSTRAINT "AiUsageLog_doctorId_fkey"
  FOREIGN KEY ("doctorId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
