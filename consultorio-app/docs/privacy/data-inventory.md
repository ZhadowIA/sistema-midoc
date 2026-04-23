# Inventario de datos tratados

Fuente: `prisma/schema.prisma`. Mantener sincronizado con cada cambio de schema.

## Categorías de dato

| Categoría | Modelo Prisma | Campos sensibles | Base legal |
|---|---|---|---|
| Identificación del médico | `User`, `DoctorConfig` | `email`, `phone`, `passwordHash`, `specialty`, `slug` | Contrato SaaS |
| Identificación del paciente | `Patient` | `firstName`, `lastNamePaternal`, `lastNameMaternal`, `sex`, `gender`, `dateOfBirth`, `email`, `phone` | Consentimiento al agendar |
| Contacto alterno del paciente | `PatientContact` | `firstName`, `lastNamePaternal`, `phone`, `email`, `relation` | Consentimiento al agendar |
| Historia clínica | `ClinicalHistory`, `ClinicalHistoryVersion`, `ClinicalNote`, `EncounterHistory`, `Prescription`, `AIInsight` | Datos sensibles de salud (antecedentes, diagnóstico, tratamiento, medicamentos, alertas) | Relación médico-paciente |
| Agenda | `Appointment`, `Questionnaire` | Motivos de consulta, respuestas a cuestionarios | Relación médico-paciente |
| Facturación | `BillingReceipt` | Folio, serie, datos fiscales emisor/receptor, monto | Obligación fiscal |
| Suscripción y pagos | `DoctorSubscription`, `PaymentWebhookEvent` | Proveedor, IDs externos, estado de cobro (sin PAN/CVV) | Contrato SaaS |
| Evidencia contractual / consentimientos | `LegalAcceptance`, `ConsentCapture` | `termsVersion`, `privacyVersion`, `ipAddress`, `userAgent` | Obligación legal / probatoria |
| Auditoría | `AppointmentAuditLog`, `AuditLog` | `actorUserId`, `ipAddress`, `userAgent`, metadata | Obligación legal / seguridad |
| Comunicación WhatsApp | `WhatsAppMessageLog` | Mensajes entrantes/salientes, teléfono | Relación médico-paciente |
| Notificaciones | `Notification` | Mensaje, canal, estado | Relación médico-paciente |
| IA — jobs y artefactos | `AIProcessingJob` | Transcript, metadata de input/output | Relación médico-paciente (el médico es responsable) |

## Datos que NO se almacenan

- PAN / CVV de tarjetas — diseño `CFDI-ready` y hosted checkout (D9).
- Audios de dictado completos — se procesan y descartan; solo persiste transcript y SOAP generado.
- Contraseñas en claro — solo `passwordHash` (bcrypt).

## Campos con IP / User-Agent (evidencia probatoria)

- `LegalAcceptance.ipAddress` / `userAgent`
- `ConsentCapture.ipAddress` / `userAgent`
- `AppointmentAuditLog.ipAddress` / `userAgent`
- `AuditLog.ipAddress` / `userAgent`

## Flujo transfronterizo

Si el proveedor de DB o de IA está fuera de MX, debe declararse en el aviso de privacidad y en el registro de subencargados (`data-subprocessors.md`).
