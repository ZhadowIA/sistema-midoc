-- CreateTable
CREATE TABLE "AIUsageEvent" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "clinicId" TEXT,
    "appointmentId" TEXT,
    "jobId" TEXT,
    "sourceModule" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "durationMs" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "errorCode" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AIUsageEvent_doctorId_createdAt_idx" ON "AIUsageEvent"("doctorId", "createdAt");

-- CreateIndex
CREATE INDEX "AIUsageEvent_clinicId_createdAt_idx" ON "AIUsageEvent"("clinicId", "createdAt");

-- CreateIndex
CREATE INDEX "AIUsageEvent_sourceModule_createdAt_idx" ON "AIUsageEvent"("sourceModule", "createdAt");

-- CreateIndex
CREATE INDEX "AIUsageEvent_model_createdAt_idx" ON "AIUsageEvent"("model", "createdAt");

-- CreateIndex
CREATE INDEX "AIUsageEvent_status_createdAt_idx" ON "AIUsageEvent"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "AIUsageEvent" ADD CONSTRAINT "AIUsageEvent_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIUsageEvent" ADD CONSTRAINT "AIUsageEvent_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

