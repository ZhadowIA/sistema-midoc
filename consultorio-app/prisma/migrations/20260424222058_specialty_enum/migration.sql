CREATE TYPE "MedicalSpecialty" AS ENUM (
  'FAMILY_MEDICINE',
  'PEDIATRICS',
  'GYNECOLOGY_OBSTETRICS',
  'DERMATOLOGY',
  'CARDIOLOGY',
  'MENTAL_HEALTH',
  'DENTISTRY',
  'OPHTHALMOLOGY'
);

ALTER TABLE "User" ALTER COLUMN "specialty" TYPE "MedicalSpecialty" USING (
  CASE 
    WHEN "specialty" ILIKE '%pediatr%' THEN 'PEDIATRICS'::"MedicalSpecialty"
    WHEN "specialty" ILIKE '%derma%' THEN 'DERMATOLOGY'::"MedicalSpecialty"
    WHEN "specialty" ILIKE '%cardio%' THEN 'CARDIOLOGY'::"MedicalSpecialty"
    WHEN "specialty" ILIKE '%gineco%' OR "specialty" ILIKE '%obst%' THEN 'GYNECOLOGY_OBSTETRICS'::"MedicalSpecialty"
    WHEN "specialty" ILIKE '%odont%' OR "specialty" ILIKE '%dentis%' THEN 'DENTISTRY'::"MedicalSpecialty"
    WHEN "specialty" ILIKE '%oftalm%' THEN 'OPHTHALMOLOGY'::"MedicalSpecialty"
    WHEN "specialty" ILIKE '%psic%' OR "specialty" ILIKE '%psiqu%' THEN 'MENTAL_HEALTH'::"MedicalSpecialty"
    ELSE 'FAMILY_MEDICINE'::"MedicalSpecialty"
  END
);