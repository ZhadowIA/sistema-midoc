CREATE TABLE "ShortLink" (
    "id"        TEXT NOT NULL,
    "code"      TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShortLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShortLink_code_key" ON "ShortLink"("code");
CREATE INDEX "ShortLink_code_idx" ON "ShortLink"("code");
CREATE INDEX "ShortLink_expiresAt_idx" ON "ShortLink"("expiresAt");
