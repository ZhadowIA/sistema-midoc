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

## E2E del portal (live HTTP)

- Suite en `tests/e2e/*.e2e.test.ts`, ejecutada con `npm run test:e2e`.
- Un `globalSetup` (`tests/e2e/global-server.ts`) arranca **un solo** `next dev` compartido por todos los archivos E2E; los tests solo hacen HTTP. Config separada (`vitest.e2e.config.ts`) para no arrancar el servidor en `npm run test`.
- `pilot-smoke.e2e.test.ts` verifica sobre HTTP real:
  - `GET /api/health` responde `200` sin exponer datos clinicos;
  - `GET /api/readiness` responde `200` con `checks.database = ok`;
  - una pagina de perfil publico sembrada renderiza nombre y servicio; un slug inexistente responde `404`;
  - **agenda end-to-end**: lista de horarios, hold, reserva (`201`, `PENDING`), confirmacion y consulta de la cita (`CONFIRMED`);
  - **recuperacion de cuenta**: la solicitud devuelve la misma respuesta no enumerable para un correo existente y uno inexistente.
- `pilot-sync-documents.e2e.test.ts` verifica el contrato local-first sobre HTTP:
  - **sync del dispositivo**: el inbox entrega `APPOINTMENT_BOOKED` y `PRECHECKIN_SUBMITTED`, el `ack` purga el contenido clinico (`purgedClinicalEvents`) y el inbox queda vacio tras el cursor; un token de dispositivo desconocido responde `401`;
  - **documentos del buzon**: el enlace de carga expone la llave publica del medico, acepta una subida cifrada (`201`) y el dispositivo la descarga por sync con el `ciphertext` intacto.
- Todo lo sembrado (medico, dispositivo, servicio, disponibilidad, cita, paciente, holds, eventos de sync, enlace de carga y documento) se purga en el teardown; no deja datos residuales.
- `tests/setup-env.ts` (via `tests/load-test-env.ts`) carga `.env`/`.env.local` y aplica defaults mock de proveedor (SMS/correo) para que la suite corra de forma hermetica; esto tambien repara los tests de integracion que importan `src/lib/env.ts`.

## Pendiente antes de piloto real

- Canal de auto-actualizacion Tauri con rollback documentado.
- Consulta clinica end-to-end en staging (el E2E ya cubre liveness/readiness, perfil publico, agenda completa, recuperacion, sincronizacion y carga/descarga de documentos).
- Drill manual de restauracion con una base de staging y evidencia capturada.
