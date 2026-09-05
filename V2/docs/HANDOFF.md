# Handoff — contexto vivo de trabajo

> Documento de traspaso entre sesiones (humanas o de IA) y entre equipos. Se
> actualiza al cerrar cada unidad de trabajo. **Leelo primero**, y despues
> `CLAUDE.md` y `V2/REGLAS_DESARROLLO.md`. Aqui va lo **no obvio**: lo que ya
> esta en el codigo, en git o en la linea de desarrollo no se duplica.
>
> Sustituye a `CONTEXTO_LAPTOP.md` y a `docs/HANDOFF_IA.md`, archivados en
> `docs/historico/` con la fecha en que dejaron de estar al dia.

Ultima actualizacion: 2026-09-04.

## Donde estamos

El estado por paso vive en `V2/10_linea_de_desarrollo.md` (seccion "Estado
actual"); no se repite aqui. En una linea: pasos 0-15, 18-21 y 23-26
entregados; 22 y 27 en progreso; 16, 17 y 28 planeados.

- **Remoto:** `git@github.com:ZhadowIA/sistema-midoc.git`.
- **Flujo:** ramas cortas `v2/<paso>-<descripcion>` → PR a `dev`; `main` solo
  recibe merges validados desde `dev`.
- **Worktrees:** el repositorio se trabaja con varios worktrees a la vez
  (`git worktree list`). Antes de empezar, comprueba en que rama esta el
  directorio principal: puede estar ocupado por otra sesion.

## Puesta a punto

### Portal (`V2/consultorio-app`)

Necesita PostgreSQL y un `.env.local` (plantilla en `.env.example`). El
`.env.local` **no se versiona**: si clonas o creas un worktree nuevo, copialo a
mano o las pruebas fallaran con un `ZodError` de configuracion incompleta.

```bash
npm install
npm run db:migrate:dev
npm run dev              # http://localhost:3000
```

### App del medico (`V2/desktop-app`)

Requiere cadena nativa en Windows: **Rust** (rustup, toolchain MSVC), **VS Build
Tools 2022** con C++, **CMake**, **LLVM/libclang**, y **Strawberry Perl** +
**NASM** solo la primera vez que se compila OpenSSL/SQLCipher. Node 24 (el
runner de pruebas ejecuta TypeScript sin banderas).

```bash
npm install
npm run tauri:dev        # con Whisper local (CPU)
npm run tauri:dev:cuda   # solo si la maquina tiene GPU NVIDIA
```

En esta laptop, `cargo` necesita el OpenSSL de MSVC: hay un
`src-tauri/.cargo/config.toml` **local por maquina** (ignorado por git) con
`OPENSSL_DIR`/`OPENSSL_LIB_DIR`/`OPENSSL_INCLUDE_DIR`, y el `bin` de OpenSSL
tiene que estar en el `PATH` para que el DLL cargue. En Linux (integracion
continua) lo resuelve `libssl-dev`.

- **Modelos de IA:** no estan en el repo. Se descargan **desde dentro de la
  app** hacia `%APPDATA%/com.midoc.app/`. Hasta entonces la transcripcion guia a
  descargarlos y la diarizacion degrada sin separar hablantes.
- **Base local:** `%APPDATA%/com.midoc.app/midoc.db` (SQLCipher). Es de cada
  equipo y **no se sincroniza por git**: en una maquina nueva empiezas con una
  base vacia. Desde el paso 27 la llave es una DEK envuelta por persona en
  `keys.json`, junto al `.db`: **un respaldo sin ese archivo no se puede abrir**.

## Verificaciones antes de commitear (Definition of Done, regla 8)

```bash
# Portal
cd V2/consultorio-app
npm run lint && npx tsc --noEmit
npm run test:unit && npm run test:integration   # integracion necesita el esquema aplicado
npm run test:e2e                                # levanta su propio next dev

# App del medico
cd V2/desktop-app
npm run lint && npx tsc --noEmit && npm test && npx vite build
cd src-tauri && cargo test && cargo clippy --all-targets -- -D warnings
```

Ambos proyectos tienen integracion continua: `desktop-verify.yml` (escritorio,
en cada PR) y `main_midoc-web-prod.yml` (portal, al llegar a `main`).

Commits: pequeños, una intencion por commit, formato `tipo: descripcion`.
**Sin lineas de co-autoria** de asistentes en los commits ni atribucion en los
PR — es preferencia explicita del dueño del repositorio.

## Trampas que cuestan una tarde

### Portal

- **La configuracion se valida al importar.** `src/lib/env.ts` parsea
  `process.env` con Zod en tiempo de import, asi que cualquier prueba que
  importe un servicio necesita el entorno completo. De eso se encarga
  `tests/setup-env.ts` (setupFile de todas las configs), que carga `.env` y
  `.env.local` y rellena defaults de proveedor (mocks de SMS y correo).
- **Suites separadas:** unitarias en paralelo (`test:unit`), integracion
  secuencial (`test:integration`). La integracion **comparte una sola base** y
  ejercita operaciones globales (limpieza de mantenimiento, expiracion perezosa
  de holds); en paralelo se pisan entre archivos. No la vuelvas a paralelizar.
- **La integracion necesita migraciones aplicadas.** Contra una base vacia falla
  entera; `npm run db:migrate:deploy` con el `DATABASE_URL` correcto.
- **`next dev` reescribe `next-env.d.ts` y `tsconfig.json`** al correr los E2E.
  Revertirlos antes de commitear: `git restore next-env.d.ts tsconfig.json`.
- **Los E2E no arrancan si ya tienes un `npm run dev` vivo** en el puerto 3000:
  Next 16 se niega a levantar un segundo servidor de desarrollo. No es un bug.

### App del medico

- **Comando nuevo en Rust = dos declaraciones obligatorias.** Al registrarlo en
  `tauri::generate_handler!` hay que darle (1) su capacidad en `authz.rs`, o la
  compuerta lo niega para todos, y (2) el contrato de su respuesta en
  `src/ipcSchemas.ts`, o la llamada se rechaza. Las dos cosas tienen prueba que
  lee `lib.rs` y falla si falta alguna: es a proposito, niegan por defecto.
- **El mock de navegador** (`src/ipcMock.ts`) se valida contra los mismos
  esquemas que el backend real. Si cambias lo que devuelve Rust, el mock deja de
  cumplir el contrato y la prueba lo dice — actualiza los dos.
- **`cargo fmt` no es compuerta.** El codigo existente difiere de rustfmt por
  defecto (el repo usa lineas largas en pruebas); no corras rustfmt suelto o tu
  archivo divergira de sus vecinos.
- **`db::tests::rejects_wrong_key` imprime `ERROR ... hmac check failed`.** Es
  esperado: prueba una llave incorrecta. El test pasa.
- **Los modulos `clinical`/`sync` son privados del crate.** Las pruebas que los
  cruzan viven **dentro** del crate (`#[cfg(test)] mod ...` en `lib.rs`), no en
  un directorio `tests/` externo.
- **Datos residuales** de corridas viejas en la base de desarrollo (citas de
  mayo de 2026, notificaciones huerfanas). No es un bug nuevo; los cleanups de
  integracion no borran notificaciones ni enlaces cortos.

## Contratos HTTP utiles (verificados)

- **Agenda publica:** `GET /api/public/doctors/{slug}/availability?serviceId=&dateFrom=&days=`,
  `POST .../holds {serviceId, slotStart(ISO Z)}`,
  `POST /api/public/appointments {holdToken, patient, legal}`,
  `POST /api/public/appointments/{token}/confirm`, `GET /api/public/appointments/{token}`.
- **Recuperacion:** `POST /api/auth/password-recovery/request {email}` → respuesta no enumerable.
- **Sync** (Bearer `deviceToken`): `GET /api/sync/inbox?cursor=` → `{events, nextCursor}`,
  `POST /api/sync/ack {cursor}` → `{purgedClinicalEvents}`, `GET /api/sync/documents/{id}`,
  `GET /api/sync/precheckins/{id}`.
- **Rutas internas del cron** (Bearer `NOTIFICATION_CRON_SECRET`):
  `POST /api/internal/notifications/dispatch` cada 5 minutos y
  `POST /api/internal/maintenance/cleanup` cada hora.
- Vincular un dispositivo **revoca el anterior**: un dispositivo activo por medico.

## Bitacora

- **2026-09-03/04.** Auditoria completa del repositorio (14 hallazgos) y
  remediacion por paquetes: cron de produccion corregido y TTL de preconsultas,
  material de firma fuera del repo, compuerta de comandos por rol (rebanada 2
  del paso 27), endurecimiento del escritorio (CSP, contratos Zod en IPC, mock
  fuera del instalador, lint), integracion continua del escritorio y suites
  separadas. Plan y estado en
  `docs/superpowers/plans/2026-09-03-remediacion-auditoria.md`.
- **2026-08-17.** Paso 16 replanteado: es tramite legal (adenda de tratamiento
  de datos bajo LFPDPPP), no codigo. Bloquea el uso de IA con pacientes reales.
- **2026-06-23.** Traslado del desarrollo a la laptop; detalle historico en
  `docs/historico/2026-06-23-contexto-laptop.md`.
- **2026-06-11.** Cierre del diseño del paso 9 (piloto seguro): E2E completos,
  drill de restauracion y auto-actualizacion documentada. Detalle historico en
  `docs/historico/2026-06-11-handoff-ia.md`.
