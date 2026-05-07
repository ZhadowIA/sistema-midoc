-- TokenBlacklist: revocación de JWT post-logout
CREATE TABLE "TokenBlacklist" (
    "id"        TEXT NOT NULL,
    "jti"       TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TokenBlacklist_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TokenBlacklist_jti_key" ON "TokenBlacklist"("jti");
CREATE INDEX "TokenBlacklist_jti_idx"       ON "TokenBlacklist"("jti");
CREATE INDEX "TokenBlacklist_expiresAt_idx" ON "TokenBlacklist"("expiresAt");

-- ClinicalNoteVersion: historial de ediciones de notas SOAP
CREATE TABLE "ClinicalNoteVersion" (
    "id"             TEXT NOT NULL,
    "clinicalNoteId" TEXT NOT NULL,
    "doctorId"       TEXT NOT NULL,
    "patientId"      TEXT NOT NULL,
    "version"        INTEGER NOT NULL,
    "subjective"     TEXT,
    "objective"      TEXT,
    "assessment"     TEXT,
    "plan"           TEXT,
    "privateNotes"   TEXT,
    "soapPayload"    JSONB,
    "actorUserId"    TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClinicalNoteVersion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ClinicalNoteVersion_clinicalNoteId_createdAt_idx" ON "ClinicalNoteVersion"("clinicalNoteId", "createdAt");
CREATE INDEX "ClinicalNoteVersion_patientId_createdAt_idx"      ON "ClinicalNoteVersion"("patientId", "createdAt");
ALTER TABLE "ClinicalNoteVersion" ADD CONSTRAINT "ClinicalNoteVersion_clinicalNoteId_fkey"
    FOREIGN KEY ("clinicalNoteId") REFERENCES "ClinicalNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Notification: índice en recipientEmail + columna scheduledFor para backoff
CREATE INDEX "Notification_recipientEmail_idx" ON "Notification"("recipientEmail");
ALTER TABLE  "Notification" ADD COLUMN "scheduledFor" TIMESTAMP(3);
CREATE INDEX "Notification_scheduledFor_idx"   ON "Notification"("scheduledFor");
