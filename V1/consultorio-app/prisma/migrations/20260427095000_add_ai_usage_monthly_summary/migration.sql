-- CreateTable
CREATE TABLE "AIUsageMonthlySummary" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "clinicId" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "sourceModule" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIUsageMonthlySummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AIUsageMonthlySummary_doctorId_periodStart_sourceModule_prov_key" ON "AIUsageMonthlySummary"("doctorId", "periodStart", "sourceModule", "provider", "model");

-- CreateIndex
CREATE INDEX "AIUsageMonthlySummary_doctorId_periodStart_idx" ON "AIUsageMonthlySummary"("doctorId", "periodStart");

-- CreateIndex
CREATE INDEX "AIUsageMonthlySummary_clinicId_periodStart_idx" ON "AIUsageMonthlySummary"("clinicId", "periodStart");

-- CreateIndex
CREATE INDEX "AIUsageMonthlySummary_sourceModule_periodStart_idx" ON "AIUsageMonthlySummary"("sourceModule", "periodStart");

-- AddForeignKey
ALTER TABLE "AIUsageMonthlySummary" ADD CONSTRAINT "AIUsageMonthlySummary_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
