ALTER TABLE "TwoFactorCredential"
ADD COLUMN "recoveryCodes" JSONB NOT NULL DEFAULT '[]';
