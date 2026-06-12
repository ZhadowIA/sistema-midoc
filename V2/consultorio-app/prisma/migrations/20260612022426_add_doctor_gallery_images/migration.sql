-- CreateTable
CREATE TABLE "DoctorGalleryImage" (
    "id" TEXT NOT NULL,
    "doctorProfileId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoctorGalleryImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DoctorGalleryImage_doctorProfileId_displayOrder_idx" ON "DoctorGalleryImage"("doctorProfileId", "displayOrder");

-- AddForeignKey
ALTER TABLE "DoctorGalleryImage" ADD CONSTRAINT "DoctorGalleryImage_doctorProfileId_fkey" FOREIGN KEY ("doctorProfileId") REFERENCES "DoctorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
