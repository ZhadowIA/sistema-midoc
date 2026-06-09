-- CreateEnum
CREATE TYPE "BookingChannel" AS ENUM ('INSTAGRAM', 'WHATSAPP', 'GOOGLE_BUSINESS', 'WEBSITE', 'CAMPAIGN', 'MANUAL', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "BookingFunnelStep" AS ENUM ('BOOKING_VISIT', 'BOOKING_STARTED', 'DOCTOR_SELECTED', 'SLOT_SELECTED', 'PATIENT_INFO_STARTED', 'PATIENT_INFO_COMPLETED', 'BOOKING_CONFIRMED', 'PAYMENT_STARTED', 'PAYMENT_COMPLETED', 'APPOINTMENT_COMPLETED');

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "referrerChannel" "BookingChannel" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "utmCampaign" TEXT,
ADD COLUMN     "utmContent" TEXT,
ADD COLUMN     "utmMedium" TEXT,
ADD COLUMN     "utmSource" TEXT;

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

-- CreateTable
CREATE TABLE "AIInsightFeedback" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "aiInsightId" TEXT,
    "kind" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "originalText" TEXT NOT NULL,
    "editedText" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIInsightFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingFunnelEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "doctorId" TEXT,
    "appointmentId" TEXT,
    "step" "BookingFunnelStep" NOT NULL,
    "channel" "BookingChannel" NOT NULL DEFAULT 'UNKNOWN',
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "referrer" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingFunnelEvent_pkey" PRIMARY KEY ("id")
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

-- CreateIndex
CREATE INDEX "AIInsightFeedback_doctorId_createdAt_idx" ON "AIInsightFeedback"("doctorId", "createdAt");

-- CreateIndex
CREATE INDEX "AIInsightFeedback_appointmentId_createdAt_idx" ON "AIInsightFeedback"("appointmentId", "createdAt");

-- CreateIndex
CREATE INDEX "AIInsightFeedback_action_createdAt_idx" ON "AIInsightFeedback"("action", "createdAt");

-- CreateIndex
CREATE INDEX "BookingFunnelEvent_sessionId_idx" ON "BookingFunnelEvent"("sessionId");

-- CreateIndex
CREATE INDEX "BookingFunnelEvent_doctorId_step_idx" ON "BookingFunnelEvent"("doctorId", "step");

-- CreateIndex
CREATE INDEX "BookingFunnelEvent_channel_step_idx" ON "BookingFunnelEvent"("channel", "step");

-- CreateIndex
CREATE INDEX "BookingFunnelEvent_createdAt_idx" ON "BookingFunnelEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "AIUsageEvent" ADD CONSTRAINT "AIUsageEvent_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIUsageEvent" ADD CONSTRAINT "AIUsageEvent_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIInsightFeedback" ADD CONSTRAINT "AIInsightFeedback_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIInsightFeedback" ADD CONSTRAINT "AIInsightFeedback_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIInsightFeedback" ADD CONSTRAINT "AIInsightFeedback_aiInsightId_fkey" FOREIGN KEY ("aiInsightId") REFERENCES "AIInsight"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingFunnelEvent" ADD CONSTRAINT "BookingFunnelEvent_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingFunnelEvent" ADD CONSTRAINT "BookingFunnelEvent_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
