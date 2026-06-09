-- CreateEnum
CREATE TYPE "AIJobKind" AS ENUM ('SOAP_NOTE_GENERATION');

-- CreateEnum
CREATE TYPE "AIJobStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AppointmentSource" AS ENUM ('PATIENT', 'DOCTOR');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'RESCHEDULED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AppointmentType" AS ENUM ('NORMAL', 'EXTENDED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('APPOINTMENT_CREATED', 'APPOINTMENT_STATUS_CHANGED', 'APPOINTMENT_RESCHEDULED', 'APPOINTMENT_CANCELLED', 'APPOINTMENT_MARKED_OVERDUE', 'APPOINTMENT_REMINDER_ESCALATED', 'APPOINTMENT_AUTO_CLOSED_NO_SHOW', 'PATIENT_ASSIGNED_TO_APPOINTMENT', 'PATIENT_CREATED_FROM_APPOINTMENT', 'CLINICAL_NOTE_UPDATED', 'AI_NOTE_GENERATION_REQUESTED', 'AI_NOTE_GENERATION_COMPLETED', 'AI_NOTE_GENERATION_FAILED', 'CONSENT_CAPTURED', 'CLINICAL_NOTE_SIGNED', 'CLINICAL_HISTORY_UPDATED', 'ENCOUNTER_HISTORY_UPDATED');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('DOCTOR', 'PATIENT', 'SYSTEM', 'BOT');

-- CreateEnum
CREATE TYPE "AuditSource" AS ENUM ('ADMIN_PANEL', 'PUBLIC_BOOKING', 'PATIENT_PORTAL', 'WHATSAPP_BOT', 'AUTOMATION', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ClinicalDocStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'FINAL', 'SIGNED');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('BOOKING_PRIVACY_NOTICE', 'VERBAL_RECORDING_CONFIRMATION');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('WHATSAPP', 'SMS', 'EMAIL');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('CONFIRMATION', 'REMINDER', 'QUESTIONNAIRE_INVITATION');

-- CreateEnum
CREATE TYPE "ScheduleBlockType" AS ENUM ('BLOCKED', 'PRIVATE_RESERVED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('DOCTOR', 'ADMIN', 'PATIENT', 'SECRETARY');

-- CreateEnum
CREATE TYPE "WhatsAppIntent" AS ENUM ('CONFIRM', 'CANCEL', 'GREETING', 'QUESTION', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "WhatsAppMessageAction" AS ENUM ('AUTO_REPLY', 'APPOINTMENT_CONFIRMED', 'APPOINTMENT_CANCELLED', 'ALREADY_CONFIRMED', 'ALREADY_CANCELLED', 'NO_APPOINTMENT', 'NO_CHANGE', 'NOTIFICATION_SENT');

-- CreateEnum
CREATE TYPE "WhatsAppMessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateTable
CREATE TABLE "AIInsight" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "diagnoses" JSONB,
    "treatments" JSONB,
    "allowedFoods" JSONB,
    "forbiddenFoods" JSONB,
    "medicationContext" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIProcessingJob" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "kind" "AIJobKind" NOT NULL,
    "status" "AIJobStatus" NOT NULL DEFAULT 'QUEUED',
    "progressPct" INTEGER NOT NULL DEFAULT 0,
    "statusMessage" TEXT,
    "resultPayload" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AIProcessingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "appointmentType" "AppointmentType" NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "source" "AppointmentSource" NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "questionnaireAnswered" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentAuditLog" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "patientId" TEXT,
    "actorType" "AuditActorType" NOT NULL,
    "actorUserId" TEXT,
    "source" "AuditSource" NOT NULL,
    "action" "AuditAction" NOT NULL,
    "fromStatus" "AppointmentStatus",
    "toStatus" "AppointmentStatus",
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT,
    "appointmentId" TEXT,
    "patientId" TEXT,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityBlock" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvailabilityBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalHistory" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "completionPct" INTEGER NOT NULL DEFAULT 0,
    "status" "ClinicalDocStatus" NOT NULL DEFAULT 'DRAFT',
    "lastReviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClinicalNote" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "subjective" TEXT,
    "objective" TEXT,
    "assessment" TEXT,
    "plan" TEXT,
    "privateNotes" TEXT,
    "soapPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClinicalNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentCapture" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "capturedByUserId" TEXT,
    "type" "ConsentType" NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentCapture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorConfig" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "consultationDurationMin" INTEGER NOT NULL,
    "extendedConsultationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "whatsappConnected" BOOLEAN NOT NULL DEFAULT false,
    "reminderLeadHours" TEXT,
    "reminderWindowMinutes" INTEGER DEFAULT 15,
    "whatsappAutoReplyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "whatsappAutoConfirmEnabled" BOOLEAN NOT NULL DEFAULT true,
    "whatsappAutoCancelEnabled" BOOLEAN NOT NULL DEFAULT true,
    "whatsappBookingMessageTemplate" TEXT,
    "whatsappQuestionnaireTemplate" TEXT,
    "whatsappReminderPendingTemplate" TEXT,
    "whatsappReminderConfirmedTemplate" TEXT,
    "normalConsultationPrice" DECIMAL(10,2),
    "extendedConsultationPrice" DECIMAL(10,2),
    "effectiveFrom" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorOnboarding" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorOnboarding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoctorSubscription" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL DEFAULT 'MOCK',
    "planName" TEXT NOT NULL DEFAULT 'Plan Mensual',
    "amount" DECIMAL(10,2),
    "currency" TEXT NOT NULL DEFAULT 'MXN',
    "customerId" TEXT,
    "externalSubscriptionId" TEXT,
    "externalPriceId" TEXT,
    "paymentMethodLast4" TEXT,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "canceledAt" TIMESTAMP(3),
    "lastPaymentAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DoctorSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncounterHistory" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "completionPct" INTEGER NOT NULL DEFAULT 0,
    "status" "ClinicalDocStatus" NOT NULL DEFAULT 'DRAFT',
    "prefilledFromQuestionnaire" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EncounterHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalAcceptance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "privacyVersion" TEXT NOT NULL,
    "termsAcceptedAt" TIMESTAMP(3) NOT NULL,
    "privacyAcceptedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegalAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicalRecord" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "bloodType" TEXT,
    "allergies" TEXT,
    "chronicConditions" TEXT,
    "familyHistory" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "type" "NotificationType" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT NOT NULL,
    "externalId" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Patient" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "ownerDoctorId" TEXT,
    "fullName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Patient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentWebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "payload" JSONB NOT NULL,
    "processingError" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prescription" (
    "id" TEXT NOT NULL,
    "clinicalNoteId" TEXT NOT NULL,
    "medication" TEXT NOT NULL,
    "dosage" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "duration" TEXT NOT NULL,
    "instructions" TEXT,

    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Questionnaire" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "primarySymptom" TEXT,
    "responses" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Questionnaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduleBlock" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "type" "ScheduleBlockType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'DOCTOR',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "bossId" TEXT,
    "specialty" TEXT,
    "slug" TEXT,
    "bio" TEXT,
    "profileImage" TEXT,
    "professionalLicense" TEXT,
    "clinicAddress" TEXT,
    "logoImage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppMessageLog" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "patientId" TEXT,
    "phone" TEXT NOT NULL,
    "direction" "WhatsAppMessageDirection" NOT NULL,
    "intent" "WhatsAppIntent",
    "action" "WhatsAppMessageAction",
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsAppMessageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AIInsight_appointmentId_key" ON "AIInsight"("appointmentId" ASC);

-- CreateIndex
CREATE INDEX "AIProcessingJob_appointmentId_kind_createdAt_idx" ON "AIProcessingJob"("appointmentId" ASC, "kind" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "AIProcessingJob_doctorId_createdAt_idx" ON "AIProcessingJob"("doctorId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "AIProcessingJob_status_createdAt_idx" ON "AIProcessingJob"("status" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "AppointmentAuditLog_action_createdAt_idx" ON "AppointmentAuditLog"("action" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "AppointmentAuditLog_appointmentId_createdAt_idx" ON "AppointmentAuditLog"("appointmentId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "AppointmentAuditLog_doctorId_createdAt_idx" ON "AppointmentAuditLog"("doctorId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "AuditLog_appointmentId_createdAt_idx" ON "AuditLog"("appointmentId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "AuditLog_doctorId_createdAt_idx" ON "AuditLog"("doctorId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "ClinicalHistory_doctorId_idx" ON "ClinicalHistory"("doctorId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalHistory_patientId_key" ON "ClinicalHistory"("patientId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ClinicalNote_appointmentId_key" ON "ClinicalNote"("appointmentId" ASC);

-- CreateIndex
CREATE INDEX "ConsentCapture_appointmentId_type_createdAt_idx" ON "ConsentCapture"("appointmentId" ASC, "type" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "ConsentCapture_doctorId_createdAt_idx" ON "ConsentCapture"("doctorId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "ConsentCapture_patientId_createdAt_idx" ON "ConsentCapture"("patientId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "DoctorConfig_doctorId_key" ON "DoctorConfig"("doctorId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "DoctorOnboarding_doctorId_key" ON "DoctorOnboarding"("doctorId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "DoctorSubscription_doctorId_key" ON "DoctorSubscription"("doctorId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "DoctorSubscription_provider_externalSubscriptionId_key" ON "DoctorSubscription"("provider" ASC, "externalSubscriptionId" ASC);

-- CreateIndex
CREATE INDEX "DoctorSubscription_status_currentPeriodEnd_idx" ON "DoctorSubscription"("status" ASC, "currentPeriodEnd" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "EncounterHistory_appointmentId_key" ON "EncounterHistory"("appointmentId" ASC);

-- CreateIndex
CREATE INDEX "EncounterHistory_doctorId_idx" ON "EncounterHistory"("doctorId" ASC);

-- CreateIndex
CREATE INDEX "EncounterHistory_patientId_idx" ON "EncounterHistory"("patientId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "LegalAcceptance_userId_key" ON "LegalAcceptance"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "MedicalRecord_patientId_key" ON "MedicalRecord"("patientId" ASC);

-- CreateIndex
CREATE INDEX "Patient_ownerDoctorId_fullName_idx" ON "Patient"("ownerDoctorId" ASC, "fullName" ASC);

-- CreateIndex
CREATE INDEX "Patient_ownerDoctorId_idx" ON "Patient"("ownerDoctorId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentWebhookEvent_provider_eventId_key" ON "PaymentWebhookEvent"("provider" ASC, "eventId" ASC);

-- CreateIndex
CREATE INDEX "PaymentWebhookEvent_status_createdAt_idx" ON "PaymentWebhookEvent"("status" ASC, "createdAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Questionnaire_appointmentId_key" ON "Questionnaire"("appointmentId" ASC);

-- CreateIndex
CREATE INDEX "User_bossId_idx" ON "User"("bossId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_slug_key" ON "User"("slug" ASC);

-- CreateIndex
CREATE INDEX "WhatsAppMessageLog_appointmentId_idx" ON "WhatsAppMessageLog"("appointmentId" ASC);

-- CreateIndex
CREATE INDEX "WhatsAppMessageLog_doctorId_createdAt_idx" ON "WhatsAppMessageLog"("doctorId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "WhatsAppMessageLog_phone_createdAt_idx" ON "WhatsAppMessageLog"("phone" ASC, "createdAt" ASC);

-- AddForeignKey
ALTER TABLE "AIInsight" ADD CONSTRAINT "AIInsight_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIProcessingJob" ADD CONSTRAINT "AIProcessingJob_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIProcessingJob" ADD CONSTRAINT "AIProcessingJob_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentAuditLog" ADD CONSTRAINT "AppointmentAuditLog_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentAuditLog" ADD CONSTRAINT "AppointmentAuditLog_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentAuditLog" ADD CONSTRAINT "AppointmentAuditLog_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityBlock" ADD CONSTRAINT "AvailabilityBlock_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalHistory" ADD CONSTRAINT "ClinicalHistory_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClinicalNote" ADD CONSTRAINT "ClinicalNote_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentCapture" ADD CONSTRAINT "ConsentCapture_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentCapture" ADD CONSTRAINT "ConsentCapture_capturedByUserId_fkey" FOREIGN KEY ("capturedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentCapture" ADD CONSTRAINT "ConsentCapture_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentCapture" ADD CONSTRAINT "ConsentCapture_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorConfig" ADD CONSTRAINT "DoctorConfig_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorOnboarding" ADD CONSTRAINT "DoctorOnboarding_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoctorSubscription" ADD CONSTRAINT "DoctorSubscription_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncounterHistory" ADD CONSTRAINT "EncounterHistory_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalAcceptance" ADD CONSTRAINT "LegalAcceptance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicalRecord" ADD CONSTRAINT "MedicalRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_ownerDoctorId_fkey" FOREIGN KEY ("ownerDoctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Patient" ADD CONSTRAINT "Patient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prescription" ADD CONSTRAINT "Prescription_clinicalNoteId_fkey" FOREIGN KEY ("clinicalNoteId") REFERENCES "ClinicalNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Questionnaire" ADD CONSTRAINT "Questionnaire_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduleBlock" ADD CONSTRAINT "ScheduleBlock_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_bossId_fkey" FOREIGN KEY ("bossId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessageLog" ADD CONSTRAINT "WhatsAppMessageLog_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessageLog" ADD CONSTRAINT "WhatsAppMessageLog_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppMessageLog" ADD CONSTRAINT "WhatsAppMessageLog_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

