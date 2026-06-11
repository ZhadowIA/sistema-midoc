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
- **Drill de restauracion con evidencia capturada**: `cargo test --lib restore_drill -- --nocapture` reproduce una perdida total y recupera el expediente firmado desde el respaldo. Procedimiento, evidencia y drill manual en `paso-9-drill-restauracion.md`.
- **Auto-actualizacion y rollback**: canal `tauri-plugin-updater` con firma minisign y procedimiento de rollback (hotfix hacia adelante / reinstalacion del instalador firmado previo) documentados en `paso-9-actualizacion-tauri.md`. El diseño esta listo para aplicar; falta la llave de firma real y el servidor de releases.
- **E2E de consulta clinica local-first** (`src-tauri/src/consultation_e2e.rs`, `cargo test --lib consultation_e2e`): una cita y su preconsulta llegan por `sync::apply_batch` (como las entrega el inbox del portal), el medico abre el encuentro desde la cita, documenta antecedentes y nota SOAP con plantilla de especialidad, receta, firma y verifica la integridad del hash; un segundo caso cubre una cita reagendada por sync. Cruza `sync` -> `clinical` sobre la base cifrada, sin tocar la red. Es el flujo de consulta del checklist de paso 9, cubierto donde vive lo clinico (la app de escritorio).
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
- `pilot-auth.e2e.test.ts` verifica el acceso del medico sobre HTTP:
  - **registro y sesion**: registro (`201`), login (`200`) que emite la cookie `med_token`, y la sesion usada en `GET /api/auth/session` y en una ruta protegida `GET /api/admin/profile`;
  - **rechazos**: acceso sin cookie a sesion y a `admin/profile` responde `401`, y el login con contrasena incorrecta no emite cookie.
- Todo lo sembrado (medico, dispositivo, servicio, disponibilidad, cita, paciente, holds, eventos de sync, enlace de carga y documento) se purga en el teardown; no deja datos residuales.
- `tests/setup-env.ts` (via `tests/load-test-env.ts`) carga `.env`/`.env.local` y aplica defaults mock de proveedor (SMS/correo) para que la suite corra de forma hermetica; esto tambien repara los tests de integracion que importan `src/lib/env.ts`.

## Pendiente antes de piloto real

Todo el contenido de la compuerta del paso 9 esta cubierto (healthchecks,
limpieza/purga, respaldo+restauracion probada, E2E de los flujos criticos,
firma de instalador, auto-actualizacion y rollback documentados). Lo que resta
es **ejecucion de infraestructura**, no diseño:

- Provisionar la llave de firma del updater (publica al config, privada al gestor de secretos) y el servidor de releases; luego aplicar los cambios de `paso-9-actualizacion-tauri.md`.
- Obtener el certificado de firma de codigo para distribucion externa (CA confiable).
- Ejecutar el drill de restauracion contra una base de staging real y archivar la evidencia (procedimiento en `paso-9-drill-restauracion.md`).
