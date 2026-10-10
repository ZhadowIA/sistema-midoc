-- Identidad profesional del medico para la receta (regla 4.6). CONTACTO, sin datos clinicos.
ALTER TABLE "DoctorProfile" ADD COLUMN "degreeInstitution" TEXT;
ALTER TABLE "DoctorProfile" ADD COLUMN "specialtyTitle" TEXT;
ALTER TABLE "DoctorProfile" ADD COLUMN "specialtyLicenseNumber" TEXT;
