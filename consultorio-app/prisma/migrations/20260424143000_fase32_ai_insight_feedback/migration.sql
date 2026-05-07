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

-- CreateIndex
CREATE INDEX "AIInsightFeedback_doctorId_createdAt_idx" ON "AIInsightFeedback"("doctorId", "createdAt");

-- CreateIndex
CREATE INDEX "AIInsightFeedback_appointmentId_createdAt_idx" ON "AIInsightFeedback"("appointmentId", "createdAt");

-- CreateIndex
CREATE INDEX "AIInsightFeedback_action_createdAt_idx" ON "AIInsightFeedback"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "AIInsightFeedback" ADD CONSTRAINT "AIInsightFeedback_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIInsightFeedback" ADD CONSTRAINT "AIInsightFeedback_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIInsightFeedback" ADD CONSTRAINT "AIInsightFeedback_aiInsightId_fkey" FOREIGN KEY ("aiInsightId") REFERENCES "AIInsight"("id") ON DELETE SET NULL ON UPDATE CASCADE;

