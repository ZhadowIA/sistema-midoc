# Registro de terceros / subencargados

Servicios que procesan datos personales o sensibles por cuenta de MiDoc. Debe declararse en el aviso de privacidad.

| Servicio | Propósito | Datos tratados | Ubicación | Estatus | Variable de entorno |
|---|---|---|---|---|---|
| Proveedor de DB (Postgres gestionado) | Persistencia principal | Todo el dataset clínico | Por confirmar | Activo | `DATABASE_URL` |
| Prisma Accelerate | Pooler / cache de queries | Todo el dataset clínico | Cloud del proveedor Prisma | Activo | `DATABASE_URL` con prefijo `prisma://` |
| OpenAI | Generación SOAP y AIInsight | Transcripts de consulta (datos sensibles de salud) | EE. UU. | Opcional (activo si `OPENAI_API_KEY`) | `OPENAI_API_KEY` |
| Deepgram | Transcripción de audio | Audio e interim transcripts | EE. UU. | Opcional (activo si `DEEPGRAM_API_KEY`) | `DEEPGRAM_API_KEY`, `DEEPGRAM_PROJECT_ID` |
| Google reCAPTCHA v3 | Anti-abuso en `/agendar` | IP + comportamiento de navegador | EE. UU. | Opcional (activo si `RECAPTCHA_V3_SECRET`) | `RECAPTCHA_V3_SECRET` |
| WhatsApp (vía `whatsapp-web.js`) | Notificaciones bidireccionales | Teléfono + contenido de mensaje | Meta | Activo si bot está conectado | `WHATSAPP_API_URL` |
| Stripe (planeado) | Cobro de suscripción y anticipos | Email, nombre, últimos 4 dígitos (tokenizado) | EE. UU. | No activo — Fase 5.1 pendiente | `PAYMENTS_PROVIDER=STRIPE` |
| Proveedor de email (sin decidir) | Password reset y notificaciones transaccionales | Email + contenido del mensaje | Por confirmar | No activo — bloquea Fase 10.1.e | — |
| Proveedor de hosting (Next.js) | Cómputo y edge | Tráfico HTTP, logs | Por confirmar | Activo | — |

## Política

- Antes de habilitar un nuevo subencargado: registrar aquí, actualizar aviso de privacidad y firmar DPA si aplica.
- Revisar este registro al menos **semestralmente** y ante cualquier cambio de proveedor.
- Si un subencargado trata datos fuera de MX, el aviso de privacidad debe declarar transferencia internacional.

## Datos que NO salen de MiDoc al subencargado

- OpenAI / Deepgram reciben el transcript, pero no reciben `firstName/lastNamePaternal/lastNameMaternal` del paciente por diseño; el transcript contiene solo lo dictado por el médico. Verificar por prompt que no se reenvíen identificadores directos del paciente.
- Stripe (cuando se active) recibe email del médico y monto; no recibe ningún dato clínico del paciente.

## DPA / contrato pendiente

- [ ] DPA con proveedor de DB elegido
- [ ] DPA con OpenAI (form estándar de la plataforma)
- [ ] DPA con Deepgram
- [ ] DPA con proveedor de email (cuando se defina)
- [ ] DPA con Stripe (cuando se active Fase 5.1)
