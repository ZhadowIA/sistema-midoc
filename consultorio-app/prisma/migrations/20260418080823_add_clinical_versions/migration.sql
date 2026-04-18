-- CreateTable
CREATE TABLE "ClinicalHistoryVersion" (
    "id" TEXT NOT NULL,
    "clinicalHistoryId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "completionPct" INTEGER NOT NULL,
    "status" "ClinicalDocStatus" NOT NULL,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClinicalHistoryVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncounterHistoryVersion" (
    "id" TEXT NOT NULL,
    "encounterHistoryId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "completionPct" INTEGER NOT NULL,
    "status" "ClinicalDocStatus" NOT NULL,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EncounterHistoryVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClinicalHistoryVersion_clinicalHistoryId_createdAt_idx" ON "ClinicalHistoryVersion"("clinicalHistoryId", "createdAt");

-- CreateIndex
CREATE INDEX "ClinicalHistoryVersion_patientId_createdAt_idx" ON "ClinicalHistoryVersion"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "EncounterHistoryVersion_encounterHistoryId_createdAt_idx" ON "EncounterHistoryVersion"("encounterHistoryId", "createdAt");

-- CreateIndex
CREATE INDEX "EncounterHistoryVersion_appointmentId_createdAt_idx" ON "EncounterHistoryVersion"("appointmentId", "createdAt");

-- AddForeignKey
ALTER TABLE "ClinicalHistoryVersion" ADD CONSTRAINT "ClinicalHistoryVersion_clinicalHistoryId_fkey" FOREIGN KEY ("clinicalHistoryId") REFERENCES "ClinicalHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterHistoryVersion" ADD CONSTRAINT "EncounterHistoryVersion_encounterHistoryId_fkey" FOREIGN KEY ("encounterHistoryId") REFERENCES "EncounterHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
