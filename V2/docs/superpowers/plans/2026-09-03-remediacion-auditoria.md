# Plan de remediación — auditoría del 2026-09-03

Fecha: 2026-09-03
Estado: EN EJECUCION — paquete A entregado en `v2/paso17-cron-y-purga` (2026-09-03); B-H pendientes
Superficies: `V2/consultorio-app`, `V2/desktop-app`, `.github/workflows`, documentación V2
Origen: revisión completa del repositorio (docs, portal, app de escritorio, CI). Estado verificado al auditar: portal con tipos, lint y 89 pruebas unitarias en verde; escritorio con tipos, 111 pruebas de TS y 273 de Rust en verde. Las pruebas de integración del portal no se ejecutaron por falta de Postgres local.

> Cada paquete es una rama corta con PR a `dev` (REGLAS §7). El orden de los
> paquetes es de urgencia; dentro de un paquete, el orden de las tareas es de
> dependencia. Tamaños: **S** menos de medio día, **M** uno o dos días, **L** tres a cinco días.

## Resumen ejecutivo

| # | Paquete | Paso de la línea | Rama | Tamaño | Urgencia |
|---|---|---|---|---|---|
| A | Cron de producción y purga del buzón | 17 (producción) / 9 (piloto seguro) | `v2/paso17-cron-y-purga` | M | Inmediata: hoy la cola de notificaciones no se procesa en producción |
| B | Secretos e higiene del repositorio | 9 | `v2/paso9-secretos-repo` | S | Inmediata |
| C | Compuerta de comandos por rol (paso 27, rebanada 2) | 27 | `v2/paso27-compuerta-comandos` (continúa la rama actual) | L | Alta: bloquea entregar acceso de recepción |
| D | Endurecimiento del escritorio: CSP, Zod en IPC, mock fuera del bundle, lint | 9 / 0 | `v2/paso9-desktop-hardening` | M | Alta |
| E | CI del escritorio y separación de suites | 9 | `v2/ci-desktop-y-suites` | M | Media |
| F | Llave de IA de texto mediada por el portal (Ruta B para texto) | 16 | `v2/paso16-ia-texto-portal` | L | Media: decisión ahora, código con el paso 16 |
| G | Contratos compartidos y estructura de código | transversal (refactor) | `v2/shared-contratos`, `v2/desktop-estructura`, `v2/portal-servicios` | L | Baja, pero acumula deuda |
| H | Documentación al día | transversal | `v2/docs-estado-2026-09` | S | Media: cerrar junto con C |

Secuencia recomendada: **A y B esta semana** (independientes, pequeñas y con impacto en producción). Después **C** (es el trabajo de la rama actual) con **H** en el mismo cierre. Luego **D y E** juntos (D deja lint que E ejecuta en CI). **F** se decide ahora y se implementa cuando el paso 16 abra. **G** al final, en tres PR mecánicos separados y sin cambios de comportamiento.

---

## Paquete A — Cron de producción y purga del buzón

Hallazgos que cierra: 1 (cron apunta a rutas inexistentes), 4 (precheckins sin expiración), 5 (cookie de logout).

### A1. Corregir el workflow de cron (S)

- En `.github/workflows/cron-jobs.yml`:
  - `notifications` → `POST ${APP_BASE_URL}/api/internal/notifications/dispatch` con cabecera `Authorization: Bearer ${NOTIFICATION_CRON_SECRET}`.
  - Sustituir `cleanup-short-links` por `maintenance` → `POST ${APP_BASE_URL}/api/internal/maintenance/cleanup`, misma cabecera. `runPilotCleanup` ya cancela notificaciones con enlace corto vencido, así que el job de enlaces cortos desaparece sin perder nada.
  - Cadencia: notificaciones cada 5 minutos (igual), mantenimiento cada hora (los holds vencidos y los enlaces expirados no deben esperar al día siguiente).
- Unificar la comprobación de autorización de ambas rutas en un helper `src/lib/auth/cron-auth.ts` (hoy `cleanup/route.ts` lee `process.env` directo en vez de `env`).
- **Prueba de contrato** en `tests/unit/cron-workflow.test.ts`: parsea el YAML del workflow, extrae cada URL `/api/...` y comprueba que existe `src/app/api/<ruta>/route.ts` y que la cabecera es `Authorization`. Evita que esta falla se repita al renombrar rutas.
- Verificación manual tras el merge a `main`: `workflow_dispatch` de ambos jobs y comprobar HTTP 200 en el log de Actions.

### A2. Expiración de precheckins sellados (M)

- Migración Prisma `precheckin_expires_at`: columna `expiresAt DateTime?` en `PrecheckinSubmission`, poblada al crear con `createdAt + 30 días` (misma retención que `DEFAULT_MAILBOX_RETENTION_DAYS` y que la re-línea base de 30 días prevista en el paso 27). Backfill en la migración para filas existentes.
- En `runPilotCleanup`: nuevo `updateMany` que ponga `status = PURGED`, `ciphertext = null`, `responses = {}` y `purgedAt = now` a los precheckins no entregados con `expiresAt <= now`. Añadir `purgedPrecheckins` a `PilotCleanupStats` y a la bitácora `sync.clinical-content-purged`.
- Hacer lo mismo con la fecha de corte de `MailboxDocument`: hoy usa `createdAt` y un cutoff; dejar ambos modelos con el mismo criterio explícito.
- Sync: si el escritorio pide por id un precheckin ya purgado, responder 410 con mensaje neutro (ya existe ese patrón en `readMailboxDocument`).
- Pruebas: integración en `operations.integration.test.ts` (precheckin vencido se purga, uno vigente no; el purgado ya no baja por `inbox`) y actualización de `13_contrato_sincronizacion.md` (tabla "Purga tras ACK" gana la columna "Purga por TTL").

### A3. Cookie de logout coherente (S)

- `logout/route.ts` reutiliza `createSessionCookieOptions(new Date(0))` en lugar de literales. Un caso en `auth.integration.test.ts` que verifique que la cookie de salida lleva `Secure` cuando `APP_BASE_URL` es https.

**DoD del paquete:** lint, tipos, `npm test` e integración en verde; migración aplica desde cero y sobre base existente; docs 13 y 10 (paso 17, sección de operación) actualizadas.

**Entregado (2026-09-03).** A1, A2 y A3 completos. Desviaciones respecto al plan: `MailboxDocument` conserva su corte por `createdAt` (ya cumplia el TTL de 30 dias; darle `expiresAt` propio queda como mejora menor), y los reenvios del paciente reinician el TTL. Verificacion: `tsc`, `eslint`, `next build` y 197 pruebas en verde contra una base Postgres limpia con la migracion aplicada desde cero. Tres pruebas de integracion fallan **tambien en `dev` sin estos cambios** y quedan fuera del paquete: el caso de horario de verano de `public-booking` usa fechas de julio de 2026 ya pasadas, el de cobro de creditos de `sync` requiere costos de plan que la base limpia no tiene, y el de cola de `notifications` no envia en la primera pasada; conviene un paquete corto de "pruebas dependientes de fecha y semilla".

---

## Paquete B — Secretos e higiene del repositorio

Hallazgos que cierra: 2 (PFX versionado), 3 (scripts peligrosos), 14 (artefactos fuera de lugar y dependencia muerta).

### B1. Sacar el certificado de firma del repositorio (S)

1. `git rm V2/certs/staging-code-signing.pfx` y borrar la carpeta `V2/certs`.
2. Tratar el certificado como comprometido: generar uno nuevo auto-firmado para staging (el comando ya está en `paso-9-firma-codigo-staging.md`) y **no reutilizar la contraseña publicada**.
3. Guardar el nuevo PFX en base64 como secreto `CODE_SIGNING_CERT` y su contraseña como `CODE_SIGNING_PASSWORD` (los nombres ya están documentados en la sección "Integración en CI/CD").
4. Quitar la contraseña en claro de `paso-9-firma-codigo-staging.md`, `PASO9-RESUMEN.md` y `PASO9-COMPLETO-RESUMEN.md`; dejar solo la referencia al secreto.
5. Añadir a `.gitignore` raíz: `*.pfx`, `*.p12`, `*.key`, `*.pem` (con excepción explícita si algún día hace falta un `.pem` público).
6. Decisión del propietario del repo: reescribir historial con `git filter-repo` para eliminar el blob, o aceptarlo como certificado quemado. Recomendación: reescribir solo si el repositorio sigue privado y el equipo es de una persona; si no, basta con revocar.

### B2. Retirar los scripts de administración de la raíz del portal (S)

- Eliminar `check-users.ts` (vuelca hashes; no tiene uso legítimo).
- Mover `reset-admin.ts` a `scripts/dev/reset-admin.ts` con tres guardas: aborta si `NODE_ENV === "production"`, aborta si `DATABASE_URL` no apunta a `localhost`, y toma la contraseña de `RESET_ADMIN_PASSWORD` en vez de un literal. Documentarlo en el README del portal como herramienta de desarrollo.
- Alternativa más simple si no se usa: eliminarlo y apoyarse en `prisma/seed.ts`.

### B3. Limpieza de artefactos (S)

- Mover `V2/desktop-app/Rediseño interfaz aplicación médica/` a `V2/design-propuesta/canvas-rediseno/` (o eliminarla si `design-propuesta` ya contiene la versión vigente).
- `.codex-audits/` (capturas PNG sin trackear): moverlas a `V2/docs/auditorias/` si sirven como evidencia del paso 26, o añadir la carpeta a `.gitignore`.
- Quitar `openai` de `optionalDependencies` del portal (ningún import lo usa; el proveedor se implementa contra `fetch`). `npm install` para actualizar el lockfile.

**DoD del paquete:** `git ls-files` sin `.pfx`; `npm run build` del portal sin cambios; docs del paso 9 sin secretos en claro.

---

## Paquete C — Compuerta de comandos por rol (paso 27, rebanada 2)

Hallazgo que cierra: 6 (rol RECEPCION sin compuerta real). Es la continuación natural de la rama actual `v2/paso27-frontera-datos`, donde ya están la DEK, `keys.json` y los roles.

### C1. Tabla de política de comandos (M)

- Nuevo módulo `src-tauri/src/authz.rs` con un enum `Capability` (`Clinical`, `Operations`, `Cash`, `Identity`, `Sync`, `Ai`, `Admin`) y una función `required_capability(command: &str) -> Capability` construida a partir de una **tabla exhaustiva** de los 112 comandos registrados. Un test recorre `tauri::generate_handler!` (o una lista espejo) y falla si algún comando no está en la tabla: **negar por defecto**.
- Política por rol: `DOCTOR` → todas; `RECEPCION` → `Operations`, `Cash`, `Identity` (solo lectura de contacto), `Sync` limitado a eventos de cita. Los comandos con dependencia de argumentos (`register_payment` con `REFUND`, `start_visit_encounter`) reciben una comprobación específica dentro del comando, documentada en la tabla.
- Punto único de aplicación: el helper que hoy obtiene la sesión (`session.actor`) recibe el nombre del comando y devuelve `Forbidden` antes de tocar la base. Sin este helper ningún comando puede leer la conexión, así que no se puede olvidar la compuerta.

### C2. Prueba de frontera de comandos (M)

- Espejo de la prueba que borra las 17 tablas clínicas: abre una base con sesión `RECEPCION` e invoca **cada** comando de la tabla con argumentos mínimos válidos. Los de capacidad clínica deben responder `Forbidden` sin ejecutar SQL (se verifica con un contador de consultas en la conexión de prueba). Prueba de inversión: si se mueve un comando clínico a `Operations`, la prueba lo nombra.
- `start_visit_encounter` desde recepción devuelve solo el id del encuentro, nunca su contenido.

### C3. Actor y estación en bitácora, UI por rol y bloqueo (M)

- `clinical_audit` gana `actor_id`, `station_id` y `authorized_by` (migración v31; ya previsto en `14_plan §4`).
- `App.tsx`: con rol `RECEPCION` no se monta ningún componente clínico (hoy la puerta es una condición en el render; pasa a ser una rama de enrutado sin importar `Atencion`/`Expediente`).
- Bloqueo por inactividad y cambio rápido de usuario según `14_plan`.

### C4. Rekey verificado (S)

- Extender `restore_drill.rs` para probar restauración post-rekey (riesgo mayor declarado del paso). Marcarlo como requisito del PR.

**DoD del paquete:** compuerta cubierta por prueba de frontera de comandos; 10_linea y 14_plan describen la rebanada 2 como entregada con su verificación; cabecera de `db.rs` actualizada (la passphrase ya no va a `PRAGMA key`, va a la envoltura).

---

## Paquete D — Endurecimiento del escritorio

Hallazgos que cierra: 7 (sin Zod), 8 parcial (mock dentro de `ipc.ts`), 11 (sin CSP), 12 parcial (sin lint).

### D1. CSP del webview (S)

- `tauri.conf.json` → `"csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src ipc: http://ipc.localhost"`. Toda la red sale por `reqwest` desde Rust, así que el webview no necesita `connect-src` externo.
- Verificar con `npm run tauri:dev`: descarga de modelo, transcripción, impresión de recibo y tema nocturno sin errores de CSP en la consola del webview. Si el recibo imprimible usa estilos inline generados, mantener `'unsafe-inline'` solo en `style-src`.

### D2. Zod en la frontera IPC (M)

- Añadir `zod` como dependencia del escritorio (justificación en el PR: regla 3 de REGLAS).
- Nueva firma `call(command, schema, args)`: `schema.parse` sobre la respuesta, tanto de `invoke` como del mock. Migración progresiva por prioridad: primero respuestas de IA (`ai_*`, salida de modelo), luego comandos clínicos, luego el resto. Un test asegura que ningún `call<` sin esquema queda en `src/` al terminar (grep en prueba, como `buildScripts.test.ts`).
- Los tipos TS se derivan de los esquemas (`z.infer`), eliminando interfaces duplicadas.

### D3. Mock fuera del bundle (S)

- Mover todo lo posterior a `/* Mock de navegador */` de `ipc.ts` a `ipc.mock.ts`. En `ipc.ts`: `if (!isTauri && import.meta.env.DEV) { const { mockCall } = await import("./ipc.mock"); ... }`. En producción sin Tauri, error explícito.
- Verificación: tamaño de `dist/assets/*.js` antes y después en el PR.

### D4. ESLint en el escritorio (S)

- `eslint.config.mjs` con `typescript-eslint` (recommended) y `eslint-plugin-react-hooks`, mismo estilo que el portal. Script `lint` en `package.json`. Corregir hallazgos o justificarlos con comentario.

**DoD del paquete:** `npm run lint`, `tsc`, `node --test` y `tauri:dev` con CSP activa en verde; README del escritorio documenta `lint` y la política de esquemas.

---

## Paquete E — CI del escritorio y separación de suites

Hallazgos que cierra: 12 (sin CI de escritorio) y la mejora de suites del informe QA de junio.

### E1. Workflow `desktop-verify.yml` (M)

- Disparo en PR y push a `dev`/`main` con cambios bajo `V2/desktop-app/**`.
- Jobs: `npm ci`, `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`; luego `cargo test` y `cargo clippy -- -D warnings` en `src-tauri` **sin features nativos** (el build por defecto no necesita CMake ni LLVM). En Ubuntu: `apt-get install libssl-dev pkg-config libwebkit2gtk-4.1-dev libgtk-3-dev` para que `bundled-sqlcipher` y Tauri compilen. Cache de `~/.cargo` y `target` por hash de `Cargo.lock`.
- El workflow no distribuye binarios; eso sigue siendo el proceso del paso 9.

### E2. Suites del portal separadas (S)

- `vitest.unit.config.ts` (paralelo, `tests/unit/**`) y `vitest.integration.config.ts` (`fileParallelism: false`, `tests/integration/**` y `tests/smoke/**`). `npm test` ejecuta ambos en secuencia; `test:unit` y `test:integration` por separado. Actualizar el paso "Unit tests" del workflow de despliegue.

**DoD del paquete:** un PR de prueba con un warning de clippy y un error de lint falla en CI; la suite unitaria vuelve a correr en paralelo.

---

## Paquete F — Llave de IA de texto mediada por el portal

Hallazgo que cierra: 10 (llaves de IA por `.env` en el escritorio). El plan `2026-06-30-ruta-b-faseado.md` ya fijó el principio para transcripción: "la clave de proveedor NO se hornea en el binario" y "el cobro por créditos solo es posible si el portal media la llamada". La IA de texto (Gemini/OpenAI en `ai.rs`) quedó fuera de ese principio y lo contradice.

### F1. Decisión de diseño (ahora, S)

- Extender la Ruta B a texto: el escritorio seudonimiza y pide consentimiento localmente (como hoy), pero la llamada al proveedor sale por `POST /api/sync/ai/text` con device token; el portal verifica créditos **antes** de gastar, guarda la llave en Key Vault y devuelve la respuesta sin persistirla (misma garantía que `cloud-transcription-service.ts`).
- Mantener `MIDOC_*_API_KEY` solo como **modo desarrollador** (feature flag `ai-direct-dev`, deshabilitado en `tauri:build`), para no bloquear el trabajo local mientras el paso 16 no abre.
- Registrar la decisión en `10_linea` (paso 16, "Se construye") y en `11_recomendaciones_ia_medica.md`.

### F2. Implementación (con el paso 16, L)

- Portal: servicio `ai-text-service.ts` con el mismo contrato de proveedor intercambiable y de créditos que la transcripción; ruta bajo rate limit por dispositivo; pruebas de integración de camino feliz, sin créditos y payload inválido.
- Escritorio: `ai.rs` gana un proveedor `PortalTextProvider`; las trazas de run siguen registrándose localmente; el reporte `ai-usage` deja de ser "después del hecho" porque el portal ya descontó.
- Degradación (paso 24) se conserva: el portal devuelve causa y modelos alternos; el médico sigue eligiendo.

---

## Paquete G — Contratos compartidos y estructura de código

Hallazgos que cierra: 8 (archivos gigantes y `src/` plano), 9 (contrato duplicado a mano), 14 parcial (clasificación de datos incompleta en Prisma). Tres PR mecánicos, cada uno sin cambio de comportamiento y con las pruebas actuales como red.

### G1. `V2/shared/` con contratos Zod (M)

- Workspace npm desde `V2/package.json` (`"workspaces": ["shared", "consultorio-app", "desktop-app"]`) y paquete `@midoc/contracts` con: historia clínica (`medical-history`), preconsulta IA, payloads de sync (inbox, ack, ai-usage, transcriptions). Solo Zod y tipos; sin dependencias de runtime de ninguna app.
- Portal y escritorio importan del paquete; se borran `medicalHistoryFormat.ts` (la parte de contrato) y los comentarios de "espejo a mano". El formateo para la vista del médico se queda en el escritorio.
- Prueba en `shared` que cada esquema acepta los fixtures que hoy usan las dos apps.

### G2. Estructura del escritorio (L)

- `src/` pasa a `app/` (App, main, theme), `features/{recepcion,atencion,expediente,dental,transcripcion,ia,arco,ajustes}`, `ipc/` (call, esquemas, mock), `lib/` (fechas, utilidades), `styles/` (App.css partido por feature; primero por concatenación, después CSS modules si conviene).
- `Atencion.tsx` se parte por paneles ya identificables (`ClinicalAidRail`, `ConsultationTranscriptionPanel`, editor de nota, receta). Sin cambiar props ni estado global en este PR.
- Se hace con `git mv` para conservar historial; `tsc` y las 111 pruebas deben seguir en verde sin modificar aserciones.

### G3. Servicios grandes del portal (M)

- `public-booking-service.ts` → `booking/{holds,appointments,reschedule,notifications}.ts` con un índice que conserve las exportaciones actuales (las pruebas no cambian).
- `configuracion-client.tsx` → un componente por sección (perfil, horarios, servicios, galería, notificaciones, seguridad).

### G4. Clasificación de datos en el esquema Prisma (S)

- Comentario `/// Clase: CLINICO | CONTACTO | OPERATIVO | FACTURABLE` encima de **cada** `model`. Prueba unitaria que parsea `schema.prisma` y falla si un modelo no lo tiene. Cierra la regla 4.4 de forma verificable.

---

## Paquete H — Documentación al día

Hallazgo que cierra: 13. Se entrega junto con el cierre del paquete C para no actualizar dos veces.

- `10_linea_de_desarrollo.md`: cabecera "Estado actual" reescrita con fecha real; fila del paso 11 con su estado verdadero (fundación + SOAP asistido entregados, resto ligado al paso 16); paso 27 con rebanada 2.
- `README.md` de V2: quitar "No incluye implementación de código V2"; orden de lectura con 14 y 15; sección "Arranque local" apuntando a los comandos reales de cada app.
- `CONTEXTO_LAPTOP.md` y `docs/HANDOFF_IA.md`: fusionar en un solo `docs/HANDOFF.md` vivo (rama activa, comandos, toolchain) y archivar los dos como históricos con su fecha en el nombre.
- `env-schema.ts`: añadir `APP_TIMEZONE` (con default `America/Chihuahua`) o eliminarlo del workflow; aceptar `SESSION_SECRET` como alias de `NEXTAUTH_SECRET` y documentar el nombre nuevo (renombrar en producción cuando se rote el secreto).
- `db.rs` cabecera, `14_plan_estaciones_y_roles.md` estado, `paso-9-actualizacion-tauri.md` estado real del updater.

---

## Riesgos y decisiones que requieren al propietario

1. **Reescribir o no el historial de git** por el PFX (B1). Recomendación: revocar y regenerar; reescribir solo si el repo sigue privado y sin colaboradores externos.
2. **Retención de precheckins a 30 días** (A2). Alternativa: ligarla a la fecha de la cita (purgar 7 días después de la cita). La de 30 días es más simple y coincide con el resto del buzón.
3. **Ruta B para texto** (F1) mueve latencia y costo al portal; el modo desarrollador con llave local se conserva. Requiere confirmar que el paso 16 contempla también la IA de texto y no solo transcripción.
4. **Orden de G2**: reorganizar carpetas antes de cerrar el paso 27 obligaría a rebasar la rama actual; por eso G va al final.
