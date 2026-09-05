# Handoff para IA — contexto vivo de trabajo

> **Archivado.** Retrato del proyecto al 2026-06-11 (cierre del diseño del paso 9). Se conserva por su bitácora y sus detalles de implementación; para trabajar hoy, usa `docs/HANDOFF.md`.

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
- **E2E de auth del médico** (`pilot-auth.e2e.test.ts`): registro → login (cookie `med_token`) → sesión usada en ruta protegida `admin/profile`; rechazos sin cookie (401) y login con contraseña incorrecta.

- **E2E de consulta clínica local-first** (`desktop-app/src-tauri/src/consultation_e2e.rs`, `cargo test --lib consultation_e2e`): cita + preconsulta llegan por `sync::apply_batch` → abrir encuentro → antecedentes → SOAP con plantilla → receta → firma → verificación de integridad; segundo caso con cita reagendada. Cruza `sync` → `clinical` sobre SQLite cifrado. Se hizo en la app de escritorio (donde vive lo clínico), no en el portal.

Cobertura E2E del checklist de paso 9: registro ✓, agenda ✓, sincronización ✓, consulta ✓, documentos ✓, notificaciones (encoladas) ✓, recuperación ✓. **Checklist E2E completo.**

- **Drill de restauración con evidencia** (`desktop-app/src-tauri/src/restore_drill.rs`, `cargo test --lib restore_drill -- --nocapture`): siembra expediente firmado → respaldo → pérdida → restauración, imprime evidencia. Doc + evidencia capturada en `V2/docs/paso-9-drill-restauracion.md`.
- **Auto-actualización Tauri + rollback documentado** en `V2/docs/paso-9-actualizacion-tauri.md`: diseño listo para aplicar (cambios exactos a Cargo.toml/lib.rs/capabilities/tauri.conf.json), manejo de llave minisign, flujo de release y rollback (hotfix-forward / reinstalar instalador firmado previo). **No se activó en el repo** porque una `pubkey` inválida rompe `tauri build` y la llave privada no se commitea.

**Diseño del paso 9 completo.** Lo que resta es ejecución de infra (llave de firma updater, servidor de releases, certificado CA, correr el drill contra staging real) — no diseño.

## Tests de la app de escritorio (Rust)

- `cargo` no está en PATH de PowerShell; usar `& "$env:USERPROFILE\.cargo\bin\cargo.exe"`. Desde `V2/desktop-app/src-tauri`.
- Correr: `cargo test --lib` (26 tests). Clippy: `cargo clippy --lib --tests` (limpio).
- **`cargo fmt` NO es gate**: todo el código existente (clinical.rs, sync.rs, db.rs…) difiere de rustfmt-default. El estilo del repo usa one-liners largos en tests; sigue ese estilo, no corras rustfmt suelto (haría tu archivo divergir de los vecinos).
- Los tests `db::tests::rejects_wrong_key` imprimen `ERROR ... hmac check failed` — es **esperado** (prueban llave incorrecta), el test pasa.
- Módulos `clinical`/`sync` son privados del crate (`mod`, no `pub mod`): los tests E2E que los cruzan deben vivir **dentro del crate** (ej. `mod consultation_e2e;` con `#[cfg(test)]` en lib.rs), no en un `tests/` externo.

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

- 2026-06-11: paso 9 portal/desktop + E2E smoke base; extendido con agenda y recuperación. Refactor a `globalSetup` (un solo server entre archivos E2E) y añadido E2E de sync + documentos. Luego añadido E2E de auth del médico (registro/login/sesión/admin). Portal: **13 tests E2E en 3 archivos**, default 44/44, lint y tsc limpios. Desktop: añadido **E2E de consulta clínica** (`consultation_e2e.rs`, 2 tests). Luego añadido **drill de restauración con evidencia** (`restore_drill.rs`) + docs `paso-9-drill-restauracion.md` y `paso-9-actualizacion-tauri.md` (auto-update + rollback documentado). Suite Rust **27 tests**, clippy limpio. Con esto el **diseño del paso 9 queda completo** (solo resta ejecución de infra). Rama pusheada a `origin/v2/paso6-llaves-e2e`. **Siguiente sugerido:** abrir PR a `dev`, o iniciar paso 10 (operación presencial) / paso 8 (odontología).
