-- Add branding and legal fields for doctor profile
ALTER TABLE "User"
ADD COLUMN "professionalLicense" TEXT,
ADD COLUMN "clinicAddress" TEXT,
ADD COLUMN "logoImage" TEXT;
