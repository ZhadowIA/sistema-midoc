-- CreateTable
CREATE TABLE "DayClosure" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedByUserId" TEXT NOT NULL,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "totalCash" DECIMAL(10,2) NOT NULL,
    "totalCard" DECIMAL(10,2) NOT NULL,
    "totalTransfer" DECIMAL(10,2) NOT NULL,
    "totalOther" DECIMAL(10,2) NOT NULL,
    "entryCount" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "DayClosure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DayClosure_doctorId_date_idx" ON "DayClosure"("doctorId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "DayClosure_doctorId_date_key" ON "DayClosure"("doctorId", "date");

-- AddForeignKey
ALTER TABLE "DayClosure" ADD CONSTRAINT "DayClosure_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayClosure" ADD CONSTRAINT "DayClosure_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
