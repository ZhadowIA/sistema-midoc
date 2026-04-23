-- Fase 10.2: índices para carga real en rutas calientes
-- Appointment: agenda del médico, agenda del paciente, filtros por estado
-- Notification: cron de procesamiento pendiente + consulta por cita

CREATE INDEX "Appointment_doctorId_date_idx" ON "Appointment"("doctorId", "date");
CREATE INDEX "Appointment_doctorId_startTime_idx" ON "Appointment"("doctorId", "startTime");
CREATE INDEX "Appointment_patientId_date_idx" ON "Appointment"("patientId", "date");
CREATE INDEX "Appointment_status_date_idx" ON "Appointment"("status", "date");

CREATE INDEX "Notification_status_createdAt_idx" ON "Notification"("status", "createdAt");
CREATE INDEX "Notification_appointmentId_idx" ON "Notification"("appointmentId");
