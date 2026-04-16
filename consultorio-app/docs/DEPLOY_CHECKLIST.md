# MiDoc - Checklist de Despliegue

Estado: Vigente  
Ultima actualizacion: 2026-04-15  
Referencia principal: `docs/SISTEMA_ACTUAL.md`

## 1) Pre-despliegue (obligatorio)
- Confirmar commit/tag exacto a desplegar.
- Confirmar respaldo reciente de base de datos (staging/prod).
- Verificar variables de entorno del ambiente destino.
- Validar entorno:
```bash
npm run env:check
```
- Ejecutar validaciones de calidad:
```bash
npm run lint
npm run test
npm run build
```

## 2) Variables de entorno criticas
### Requeridas en todos los ambientes
- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `APP_BASE_URL`
- `QUESTIONNAIRE_TOKEN_SECRET`

### Requeridas para procesos internos
- `NOTIFICATION_CRON_SECRET`
- `WHATSAPP_WEBHOOK_SECRET`

### Requeridas para pagos (si aplica)
- `PAYMENTS_PROVIDER`
- `PAYMENTS_WEBHOOK_SECRET`

### Recomendadas para operacion estable
- `OPENAI_API_KEY`
- `WHATSAPP_API_URL`
- `TERMS_VERSION`
- `PRIVACY_VERSION`

## 3) Despliegue
1. Instalar dependencias limpias:
```bash
npm ci
```
2. Aplicar migraciones:
```bash
npm run db:migrate:deploy
```
3. Generar cliente Prisma:
```bash
npm run db:generate:no-engine
```
4. Compilar:
```bash
npm run build
```
5. Reiniciar servicio (PM2/systemd/contenedor segun plataforma).

## 4) Post-despliegue (smoke tests minimos)
1. `GET /api/public/doctors` responde `200`.
2. `POST /api/auth/login` responde `200` y emite cookie `med_token`.
3. `GET /api/admin/dashboard/summary` con cookie responde `200`.
4. `GET /api/admin/agenda/day?date=YYYY-MM-DD` con cookie responde `200`.
5. `GET /api/admin/notifications/status` con cookie responde `200`.
6. Crear cita publica de prueba responde `201`.

## 5) Verificacion de procesos internos
### Cron de notificaciones
- Endpoint: `POST /api/internal/notifications/process`
- Header: `x-notification-secret: <NOTIFICATION_CRON_SECRET>`

Ejemplo:
```bash
curl -X POST "https://TU_DOMINIO/api/internal/notifications/process?retryFailed=true" \
  -H "x-notification-secret: TU_SECRET"
```

### Webhook de WhatsApp
- Endpoint: `POST /api/internal/whatsapp/incoming`
- Header: `x-whatsapp-secret: <WHATSAPP_WEBHOOK_SECRET>`
- Confirmar respuesta `200` con payload valido.

## 6) Plan de rollback
1. Revertir a la version estable anterior de la aplicacion.
2. Si hubo migracion incompatible, restaurar snapshot/backup de base de datos.
3. Repetir smoke tests minimos de API.
4. Confirmar login medico, dashboard, agenda y creacion de cita.

## 7) Criterios de salida
- Build y arranque correctos.
- Smoke tests en verde.
- Procesamiento de notificaciones sin errores criticos.
- Operacion clinica validada por el equipo.
