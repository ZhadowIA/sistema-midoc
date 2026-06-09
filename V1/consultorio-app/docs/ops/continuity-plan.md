# Plan de continuidad operativa

Objetivo: mantener la operación clínica viable ante incidentes que afecten la plataforma MiDoc.

## Servicios y dependencias

| Componente | Tipo | Criticidad | Dependencia externa |
|---|---|---|---|
| `consultorio-app` (Next.js) | Aplicación principal | P0 | Proveedor de hosting |
| Postgres + Prisma Accelerate | Persistencia | P0 | Proveedor de DB + Accelerate |
| `whatsapp-bot` (Express + whatsapp-web.js) | Notificaciones bidireccionales | P1 | WhatsApp Web (no oficial) |
| OpenAI API | IA clínica (SOAP, AIInsight) | P2 | OpenAI |
| Deepgram API | Transcripción en vivo | P2 | Deepgram |
| Google reCAPTCHA v3 | Anti-abuso en `/agendar` | P2 | Google |
| Proveedor de pagos (Stripe cuando se habilite) | Checkout + webhooks | P1 al activarse | Stripe |

## Matriz de degradación graceful

| Falla | Impacto | Comportamiento esperado |
|---|---|---|
| OpenAI caído | Sin generación SOAP ni AIInsight | UI muestra error recuperable, médico captura manual; `AIProcessingJob` queda en `FAILED` con `failureCause` |
| Deepgram caído | Sin transcripción en vivo | `DictationPanel` alterna a grabación por audio + upload (fallback ya existente) |
| reCAPTCHA caído / sin secret | Agenda pública sigue operando | `recaptcha.ts` degrada a `disabled` según diseño; se mantiene log operativo |
| WhatsApp bot caído | Sin recordatorios ni reagenda bidireccional | Notificaciones quedan `PENDING` en cola; al volver, el cron las procesa. Documentar ventana en el registro |
| Stripe caído (cuando esté) | Sin altas de suscripción ni webhooks | UI muestra error; webhooks Stripe reintentarán según su propio backoff (idempotencia garantizada por `PaymentWebhookEvent.@@unique(provider, eventId)`) |
| DB caída | Plataforma completa inoperable | Activar comunicación a médicos vía canal alterno; ejecutar playbook de restore si aplica |

## RPO / RTO objetivo

- **RTO**: ≤ 60 min para restore de DB desde último dump.
- **RPO**: ≤ 24 h (ventana máxima aceptable de pérdida de datos con el régimen de dumps diarios).

Revisar trimestralmente. Si el piloto crece, acortar RPO a 1–6 h con replicación continua.

## Procedimientos referenciados

- Backup / restore: `docs/ops/backup-restore.md`
- Migraciones staging/prod: `docs/ops/migrations-playbook.md`
- Rotación de secretos: `docs/security/secret-rotation.md`

## Comunicación de incidente

1. Detectar y clasificar severidad (P0 caída total, P1 feature crítica caída, P2 degradación).
2. Abrir registro interno con: hora de detección, servicios afectados, alcance.
3. Notificar a médicos activos (canal WhatsApp directo del owner) si P0/P1 dura > 15 min.
4. Cerrar con: causa raíz, acciones correctivas, ventana de datos afectada, requerimiento de notificación legal si aplica (Fase 10.7).

## Simulacros

- **Backup/restore**: mensual (ver `backup-restore.md`).
- **Rotación de secretos**: semestral + ante fuga.
- **Caída simulada de dependencia externa** (OpenAI/Deepgram/WhatsApp): semestral — validar que el sistema degrada sin perder datos.
