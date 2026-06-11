# Paso 9 - Piloto seguro

Estado inicial implementado el 2026-06-11.

## Portal nube

- `GET /api/health`: liveness sin acceso a datos clinicos.
- `GET /api/readiness`: readiness con verificacion de base de datos.
- `POST /api/internal/maintenance/cleanup`: job interno protegido por `NOTIFICATION_CRON_SECRET`.
- Limpieza cubierta:
  - holds vencidos pasan a `EXPIRED`;
  - tokens de recuperacion vencidos pasan a `EXPIRED`;
  - enlaces de carga vencidos pasan a `EXPIRED`;
  - notificaciones pendientes con enlace corto vencido pasan a `CANCELLED`;
  - resumenes autorizados vencidos purgan `ciphertext`;
  - documentos del buzon con mas de 30 dias purgan `ciphertext`.
- Auditoria: `PilotMaintenance / pilot.cleanup-ran` registra solo conteos y parametros operativos, sin contenido clinico.

## App del medico

- Al desbloquear la base local, la app crea un respaldo cifrado automatico en `app_data/backups/`.
- La restauracion se prueba con `cargo test db::tests::backup -- --nocapture`.
- La prueba verifica llave correcta, llave incorrecta y ausencia de encabezado SQLite en claro.
- La firma de instalador Windows se hace con un PFX y `signtool.exe`; para el piloto se puede usar un certificado de desarrollo, pero para distribucion externa se necesita un certificado emitido por una CA confiable.
- Flujo operativo:
  1. Generar o importar el certificado PFX.
  2. Construir el instalador con `npm run tauri build`.
  3. Firmar el `.exe` o `.msi` resultante con `V2/desktop-app/scripts/sign-windows-installer.ps1`.
  4. Verificar la firma con `signtool verify /pa`.

## Smoke E2E del portal (live HTTP)

- Suite `tests/e2e/pilot-smoke.e2e.test.ts`, ejecutada con `npm run test:e2e`.
- Arranca `next dev` una vez en un puerto aislado y verifica sobre HTTP real:
  - `GET /api/health` responde `200` sin exponer datos clinicos;
  - `GET /api/readiness` responde `200` con `checks.database = ok`;
  - una pagina de perfil publico sembrada renderiza nombre y servicio;
  - un slug inexistente responde `404`;
  - **agenda end-to-end**: lista de horarios, hold, reserva (`201`, `PENDING`), confirmacion y consulta de la cita (`CONFIRMED`);
  - **recuperacion de cuenta**: la solicitud devuelve la misma respuesta no enumerable para un correo existente y uno inexistente.
- Todo lo sembrado (medico, servicio, disponibilidad, cita, paciente, holds y notificaciones encoladas) se purga en el teardown; no deja datos residuales.
- Config separada (`vitest.e2e.config.ts`) para no arrancar el servidor en `npm run test`.
- `tests/setup-env.ts` carga `.env`/`.env.local` y aplica defaults mock de proveedor (SMS/correo) para que la suite corra de forma hermetica; esto tambien repara los tests de integracion que importan `src/lib/env.ts`.

## Pendiente antes de piloto real

- Canal de auto-actualizacion Tauri con rollback documentado.
- E2E de staging restante: sincronizacion app-portal, consulta clinica y carga/descarga de documentos (el smoke ya cubre liveness/readiness, perfil publico, agenda completa, notificaciones encoladas y recuperacion).
- Drill manual de restauracion con una base de staging y evidencia capturada.
