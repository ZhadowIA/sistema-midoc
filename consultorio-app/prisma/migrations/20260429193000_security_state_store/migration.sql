CREATE TABLE "SecurityState" (
    "key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityState_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "SecurityState_expiresAt_idx" ON "SecurityState"("expiresAt");
