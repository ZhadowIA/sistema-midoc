# Smoke tests post-deploy

Script sin dependencias externas que valida que el deploy está vivo y funcional. Corre en segundos, pensado para ejecutarse inmediatamente después de promover a staging o producción.

## Cobertura

| Check | Endpoint | Validación |
|---|---|---|
| Liveness | `GET /api/health` | `status=ok` |
| Readiness | `GET /api/health/ready` | `status=ready` + `dbLatencyMs` numérico |
| Login | `POST /api/auth/login` | 200 + cookie `med_token` recibida |
| Sesión activa | `GET /api/auth/setup-status` | 200 + `nextStep` válido |
| Logout | `POST /api/auth/logout` | 200/204 |

Si no se proveen credenciales de smoke, los últimos tres checks se saltan (SKIP) pero los health siguen validándose.

## Ejecución

```bash
# Local (dev server en :3000)
npm run smoke

# Contra staging/prod
SMOKE_BASE_URL=https://staging.midoc.example.com \
SMOKE_EMAIL=smoke@midoc.example.com \
SMOKE_PASSWORD=... \
npm run smoke
```

Exit code `0` si todo pasa, `1` si al menos un check falla. Integrable como paso de un pipeline post-deploy.

## Variables de entorno

| Variable | Default | Propósito |
|---|---|---|
| `SMOKE_BASE_URL` | `http://localhost:3000` | URL base del deploy objetivo |
| `SMOKE_EMAIL` | — | Credencial de usuario dedicado a smoke (crear uno, NO usar el del médico piloto) |
| `SMOKE_PASSWORD` | — | Password del usuario de smoke |
| `SMOKE_TIMEOUT_MS` | `10000` | Timeout por request |

## Recomendaciones

1. **Crear un usuario dedicado** `smoke@midoc.internal` (o similar) con rol `DOCTOR`, suscripción activa y onboarding completo para que `setup-status` devuelva `DASHBOARD`. No usar la cuenta del owner.
2. **Ejecutar en pipeline** tras cada `npm run db:migrate:deploy` + redeploy. Abortar promoción si falla.
3. **Alertar** al owner si corre en cron y falla dos veces consecutivas (señal de degradación silenciosa).
4. **NO confiar solo en este script** — la suite E2E completa (Fase 10.4.b/c) cubrirá flujos de negocio; esto solo valida que el deploy "encendió".

## Pendiente (Fase 10.4 restante)

- 10.4.b: Suite E2E (Playwright) de flujos críticos — agenda, alta de cita, nota SOAP, receta.
- 10.4.c: Regresión documentada de pagos y notificaciones (se habilita al cerrar Fase 5.1).
