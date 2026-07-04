-- CreateIndex
CREATE UNIQUE INDEX "PrecheckinSubmission_appointmentId_patientId_kind_key" ON "PrecheckinSubmission"("appointmentId", "patientId", "kind");
