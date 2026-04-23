# Política de retención y eliminación de datos

Mantener sincronizado con el aviso de privacidad vigente.

## Principios

- Retener solo lo necesario para el propósito declarado y las obligaciones legales.
- La historia clínica sigue el plazo legal aplicable (ver NOM-004); no es eliminable a simple solicitud.
- Todo lo que no sea historia clínica, evidencia legal o fiscal tiene un plazo de retención definido y una acción de eliminación.

## Matriz de retención por dato

| Tipo de dato | Modelo | Retención | Acción al expirar | Justificación |
|---|---|---|---|---|
| Historia clínica y versiones | `ClinicalHistory`, `ClinicalHistoryVersion`, `ClinicalNote`, `EncounterHistory`, `Prescription`, `AIInsight` | 5 años mínimo tras última consulta (NOM-004) | Conservar; NO eliminable por ARCO | Obligación regulatoria |
| Evidencia legal / consentimientos | `LegalAcceptance`, `ConsentCapture` | 5 años desde la aceptación | Conservar; eliminación controlada por incidente | Probatoria |
| Recibos | `BillingReceipt` | 5 años (plazo fiscal) | Conservar | Obligación fiscal |
| Auditoría de citas y sistema | `AppointmentAuditLog`, `AuditLog` | 24 meses | Soft delete + export forense previo | Seguridad operativa |
| WhatsApp log | `WhatsAppMessageLog` | 12 meses | Hard delete por lotes | Operativo |
| Notificaciones (status `SENT` / `DELIVERED`) | `Notification` | 90 días | Hard delete | Operativo |
| Notificaciones `FAILED` resueltas | `Notification` | 180 días | Hard delete | Diagnóstico |
| Jobs de IA | `AIProcessingJob` | 90 días payload; metadata 24 meses | Purgar `resultPayload` / `inputPayload` y conservar metadata | Diagnóstico + costo |
| Webhooks de pago | `PaymentWebhookEvent` | 24 meses | Hard delete | Diagnóstico |
| Cuestionarios respondidos | `Questionnaire` | Igual que la cita asociada | Conservar | Relación médico-paciente |
| Paciente sin citas recientes | `Patient`, `PatientContact` | Indefinido mientras mantenga relación médica activa | Revisión anual por el médico | Relación médico-paciente |
| Sesiones inactivas (JWT) | Cookie `med_token` | 15 min (maxAge) | Caducidad automática | Seguridad |

## Soft delete vs hard delete

- **Soft delete**: marcar registros con un flag o mover a tabla de archivo antes de purgar, para permitir restauración en caso de reclamo durante la ventana de retención.
- **Hard delete**: eliminación irreversible. Debe auditarse vía `AuditLog` con `action="DATA_PURGED"` incluyendo conteo y rango.

La infraestructura de soft delete a nivel de schema **aún no existe**; se agrega cuando se implemente el job de purga. Mientras tanto, la retención es conceptual y cualquier purga se hace manualmente con export previo.

## ARCO (Acceso / Rectificación / Cancelación / Oposición)

Cubierto en Fase 7.4. Mientras no exista UI, las solicitudes se tramitan manualmente:
- **Acceso**: el médico exporta auditoría con `GET /api/admin/audit/export?from=...&to=...` y el detalle del paciente desde `/medico/pacientes/[id]`.
- **Rectificación**: edición directa en el directorio.
- **Cancelación / oposición**: respuesta caso por caso respetando los plazos legales de retención de historia clínica.

## Eliminación por incidente

Ante instrucción legal o compromiso de datos:
1. Export forense previo (dump + auditoría).
2. Eliminación targeted (registro a registro) con log en `AuditLog`.
3. Notificación al titular si aplica.
