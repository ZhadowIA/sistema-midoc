-- AlterTable
ALTER TABLE "ClinicalNote"
ADD COLUMN "signatureHash" TEXT,
ADD COLUMN "signedAt" TIMESTAMP(3),
ADD COLUMN "signedByUserId" TEXT,
ADD COLUMN "signedSnapshot" JSONB;

-- CreateIndex
CREATE INDEX "ClinicalNote_signedByUserId_idx" ON "ClinicalNote"("signedByUserId");

-- AddForeignKey
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_signedByUserId_fkey" FOREIGN KEY ("signedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
