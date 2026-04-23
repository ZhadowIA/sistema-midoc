# Runbook — Rotación de secretos

Documento operativo. Aplica a `consultorio-app` y `whatsapp-bot`.

## Inventario de secretos

| Secreto | Dónde vive | Impacto al rotar | Frecuencia mínima |
|---|---|---|---|
| `NEXTAUTH_SECRET` | env servidor Next | Invalida TODAS las sesiones JWT activas (med_token) | 90 días o tras incidente |
| `QUESTIONNAIRE_TOKEN_SECRET` | env servidor Next | Invalida tokens de cuestionario en vuelo | 90 días |
| `NOTIFICATION_CRON_SECRET` | env servidor Next + cron runner | Cron pierde acceso hasta actualizar runner | 180 días |
| `WHATSAPP_WEBHOOK_SECRET` | env Next + env bot (`APP_WEBHOOK_SECRET`) | Bot deja de poder postear al webhook hasta actualizar ambos lados | 180 días |
| `PAYMENTS_WEBHOOK_SECRET` | env Next + dashboard del proveedor (Stripe) | Webhooks del proveedor fallarán hasta actualizar firma esperada | 90 días o tras incidente |
| `DATABASE_URL` (password embebido) | env Next | Corte total hasta actualizar | Ante incidente / salida de personal |
| `OPENAI_API_KEY` | env Next | IA desactivada hasta actualizar | 180 días / ante fuga |
| `DEEPGRAM_API_KEY` | env Next | Transcripción live desactivada | 180 días / ante fuga |
| `RECAPTCHA_V3_SECRET` | env Next | Endpoint público degrada a `disabled` hasta actualizar | Ante cambio de site key |

## Procedimiento estándar

1. **Anunciar ventana**: la rotación de `NEXTAUTH_SECRET` expulsa usuarios; programar fuera de horario clínico pico.
2. **Generar nuevo valor**:
   - Secretos opacos (NEXTAUTH, QUESTIONNAIRE, WEBHOOK, CRON): `openssl rand -base64 48`
   - API keys de terceros: regenerar desde el panel del proveedor.
3. **Actualizar almacén de secretos** del ambiente objetivo (staging primero, prod después).
4. **Desplegar** reiniciando el servicio para que `getServerEnv()` recargue.
5. **Para secretos compartidos con `whatsapp-bot`**: actualizar y redesplegar el bot en la misma ventana.
6. **Para `PAYMENTS_WEBHOOK_SECRET`**: actualizar simultáneamente en el dashboard del proveedor (Stripe → Webhooks → rotate signing secret).
7. **Verificación post-rotación**:
   - Login de médico y de paciente (valida `NEXTAUTH_SECRET` nuevo firma/verifica).
   - Envío de cuestionario (valida `QUESTIONNAIRE_TOKEN_SECRET`).
   - Cron de notificaciones ejecutando sin 401.
   - Webhook entrante de WhatsApp aceptado.
   - Evento de prueba desde el panel del proveedor de pagos.

## Compromiso / fuga

1. Marcar incidente en el registro (Fase 10.7 cuando exista; mientras tanto: asunto interno).
2. Rotar inmediatamente el secreto comprometido **y todos los que comparten superficie** (si se filtró `.env` completo, rotar todo).
3. Revocar sesiones: basta con rotar `NEXTAUTH_SECRET`; todos los `med_token` quedan inválidos.
4. Revisar `AppointmentAuditLog` y logs de `auth.login.failed`/`rate_limited` en la ventana sospechosa.
5. Si se comprometió `DATABASE_URL`, exigir cambio de password de DB y revisar queries anómalas.

## Checklist express

- [ ] Inventario de secretos actualizado (este documento)
- [ ] Último valor conocido registrado en gestor de secretos (1Password/Doppler/Vault)
- [ ] Fecha de última rotación anotada por secreto
- [ ] Post-rotación: smoke tests ejecutados y adjuntados al registro
