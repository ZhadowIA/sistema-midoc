# Handoff para IA — contexto vivo de trabajo

> Documento de traspaso entre sesiones de IA. Se actualiza al final de cada unidad
> de trabajo. Si vas a continuar, **lee esto primero** y luego `CLAUDE.md` y
> `V2/REGLAS_DESARROLLO.md`. Mantén este archivo al día: añade lo no obvio, no
> dupliques lo que ya está en el código o en git.

Última actualización: 2026-06-11.

## Dónde estamos

- Rama activa: `v2/paso6-llaves-e2e` (a pesar del nombre, contiene también el avance del **paso 9**).
- Paso en curso: **Paso 9 — Piloto seguro** (ver `V2/10_linea_de_desarrollo.md` y `V2/docs/paso-9-piloto-seguro.md`).
- Modelo recomendado para paso 9: **Opus 4.8**, esfuerzo alto (backups, E2E, firma de instalador). Tabla completa en `10_linea_de_desarrollo.md`.

## Estado del Paso 9

Implementado y verificado:
- Portal: `GET /api/health`, `GET /api/readiness`, `POST /api/internal/maintenance/cleanup` (protegido por `NOTIFICATION_CRON_SECRET`).
- Desktop: respaldo cifrado automático al desbloquear + prueba de restauración (`cargo test db::tests::backup`).
- Firma de instalador Windows: script `V2/desktop-app/scripts/sign-windows-installer.ps1` (flujo documentado, no ejecutado en CI).
- **E2E smoke (live HTTP)** sobre `next dev`: liveness, readiness, perfil público + 404, agenda end-to-end (slots→hold→book→confirm), recuperación anti-enumeración.

Implementado también:
- **E2E de sincronización y documentos** (`pilot-sync-documents.e2e.test.ts`): inbox de sync entrega eventos y purga en ack, rechazo de dispositivo desconocido (401), y round-trip de documento del buzón (carga cifrada → descarga por dispositivo con ciphertext intacto).

Pendiente (orden sugerido):
1. Consulta clínica end-to-end en staging (atención: encounter, SOAP, firma).
2. Auto-actualización Tauri con rollback documentado.
3. Drill manual de restauración con evidencia capturada.

## Arquitectura de los tests E2E (importante)

- Stack: **Vitest** (no Playwright). Los E2E hacen HTTP real contra un `next dev`.
- Ubicación: `V2/consultorio-app/tests/e2e/*.e2e.test.ts`. Archivos actuales: `pilot-smoke` (health/readiness/perfil/agenda/recuperación) y `pilot-sync-documents` (sync + buzón).
- **Un solo servidor compartido**: `tests/e2e/global-server.ts` es el `globalSetup` que arranca un único `next dev` (puerto `E2E_PORT` o `3123`) y lo apaga al final. Los archivos de test **no** manejan el servidor; solo calculan `BASE_URL` y hacen HTTP. Para añadir un nuevo flujo E2E, crea otro `*.e2e.test.ts` con su propio seed/cleanup — reusa el server automáticamente.
- Se corren con `npm run test:e2e` (config `vitest.e2e.config.ts`, con `globalSetup` + `fileParallelism:false`). El `npm run test` normal los **excluye** (config `vitest.config.ts`).
- Carga de env: `tests/load-test-env.ts` (`loadTestEnv()`) es compartido por el setupFile (`tests/setup-env.ts`) y el globalSetup.
- Patrón: cada test **siembra** sus datos vía servicios de dominio (mismo DB que el server), ejercita los endpoints **por HTTP**, y **purga** todo en el teardown. No deben quedar datos residuales.

## Convenciones y trampas (no obvio)

- **Carga de env en tests**: `src/lib/env.ts` valida `process.env` con Zod **al importar**. Vitest no carga `.env` solo. Por eso existe `tests/setup-env.ts` (setupFile en ambas configs) que carga `.env`/`.env.local` y aplica defaults mock de proveedor (SMS/correo). Sin esto, cualquier test que importe `auth-service` (→ `env.ts`) falla.
- **`.env` local desactualizado**: el `.env`/`.env.local` del dev fueron creados antes del paso 7 y **no traen las claves `EMAIL_*`**. Los tests son herméticos (usan mocks), pero `npm run dev` directo fallaría hasta agregarlas (ver `.env.example`).
- **Archivos auto-generados por `next dev`**: al correr los E2E, Next reescribe `next-env.d.ts` y `tsconfig.json` (rutas de tipos transitorias, a veces cruft `.next/dev/dev/...`). **Revertirlos** antes de commitear: `git restore next-env.d.ts tsconfig.json`.
- **cwd de las tools**: la tool Bash a veces resetea su cwd a la raíz del repo; usa rutas absolutas o `cd "<abs>"` al inicio del comando. El cwd de PowerShell persiste por separado.
- **`index.lock` de git**: si aparece `Unable to create index.lock`, suele ser un lock obsoleto; verificar que no haya proceso git vivo y borrarlo.
- **Datos residuales preexistentes**: hay debris de corridas viejas (citas "Mario Lopez" del 2026-05-25, notificaciones huérfanas con `doctorId` null por SetNull). Los cleanups de integración no borran notificaciones/shortlinks. No es bug nuevo; candidato a tarea de higiene.

## Gates antes de commitear (DoD)

Siempre, sin importar el modelo:
- `npm run test:e2e` (los E2E que tocaste) y `npm run test` (suite default) en verde.
- `npm run lint` y `npx tsc --noEmit` limpios.
- Revertir `next-env.d.ts`/`tsconfig.json` si `next dev` los tocó.
- Commits pequeños, formato `tipo: descripcion`, con `Co-Authored-By: Claude Opus 4.8`.

## Contratos HTTP útiles (verificados)

- Agenda pública: `GET /api/public/doctors/{slug}/availability?serviceId=&dateFrom=&days=`, `POST .../holds {serviceId, slotStart(ISO Z)}`, `POST /api/public/appointments {holdToken, patient, legal}`, `POST /api/public/appointments/{token}/confirm`, `GET /api/public/appointments/{token}`.
- Recuperación: `POST /api/auth/password-recovery/request {email}` → respuesta no enumerable.
- Sync (Bearer `deviceToken`): `GET /api/sync/inbox?cursor=` → `{events, nextCursor}`, `POST /api/sync/ack {cursor}` → `{purgedClinicalEvents}`, `GET /api/sync/documents/{id}`.
- Documentos: `createUploadLink(doctorId,{patientId,maxUploads})` (servicio) → token; `GET /api/public/upload/{token}` → `{documentPublicKey, patientFirstName}`; `POST /api/public/upload/{token} {ciphertext(base64)}` → 201 `{id}`.
- Dispositivo de sync se vincula con `linkSyncDevice(doctorId, label, publicKeyBase64)` (servicio) → `{deviceToken}`. Vincular uno nuevo **revoca** el anterior.

## Bitácora de sesiones

- 2026-06-11: paso 9 portal/desktop + E2E smoke base; extendido con agenda y recuperación. Refactor a `globalSetup` (un solo server entre archivos E2E) y añadido E2E de sync + documentos. Suite E2E: 9 tests en 2 archivos, todo en verde; default 44/44; lint y tsc limpios. **Siguiente sugerido:** E2E de consulta clínica (encounter/SOAP/firma) o auto-actualización Tauri.
